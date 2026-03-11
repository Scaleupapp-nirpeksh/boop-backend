const User = require('../models/User');
const Interaction = require('../models/Interaction');
const Match = require('../models/Match');
const Answer = require('../models/Answer');
const Question = require('../models/Question');
const CompatibilityService = require('./compatibility.service');
const MessageService = require('./message.service');
const UploadService = require('./upload.service');
const NotificationService = require('./notification.service');
const { CONNECTION_STAGES } = require('../utils/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

// MARK: - Discover Service

/**
 * Core business logic for the Discover experience.
 * Handles candidate querying, like/pass recording, and mutual match detection.
 */
class DiscoverService {
  // ─── Get Discovery Candidates ──────────────────────────────────

  /**
   * Fetch a batch of candidate profiles for the current user's discover feed.
   *
   * Filtering pipeline:
   *  1. profileStage === 'ready'
   *  2. isActive === true, isBanned === false
   *  3. Not the current user
   *  4. Gender preference match (bidirectional)
   *  5. Not already interacted with (liked or passed)
   *  6. Age within range (configurable, default ±5 years)
   *  7. Optional: proximity (if user has coordinates)
   *
   * @param {string} userId - The current user's ID
   * @param {object} options - { limit?, ageRange?, maxDistanceKm? }
   * @returns {Array<object>} Array of candidate card objects
   */
  static async getCandidates(userId, options = {}) {
    const { limit = 10, ageRange = 5, maxDistanceKm = null } = options;

    const currentUser = await User.findById(userId).lean();
    if (!currentUser) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // 1. Get IDs the user has already interacted with
    const interactedDocs = await Interaction.find(
      { fromUser: userId },
      { toUser: 1 }
    ).lean();
    const excludeIds = interactedDocs.map((d) => d.toUser);
    excludeIds.push(currentUser._id); // Exclude self

    // 2. Build gender preference filter (bidirectional)
    const genderFilter = this._buildGenderFilter(currentUser);

    // 3. Build age filter
    const ageFilter = this._buildAgeFilter(currentUser.dateOfBirth, ageRange);

    // 4. Build the MongoDB query
    const query = {
      _id: { $nin: excludeIds },
      profileStage: 'ready',
      isActive: true,
      isBanned: false,
      ...genderFilter,
      ...ageFilter,
    };

    // 5. Optional: Geo-proximity filter
    if (
      maxDistanceKm &&
      currentUser.location?.coordinates?.length === 2
    ) {
      query['location.coordinates'] = {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: currentUser.location.coordinates,
          },
          $maxDistance: maxDistanceKm * 1000, // MongoDB expects meters
        },
      };
    }

    // 6. Execute query
    const candidates = await User.find(query)
      .select(
        'firstName dateOfBirth location.city photos.profilePhoto voiceIntro.audioUrl voiceIntro.duration questionsAnswered'
      )
      .limit(limit)
      .lean();

    logger.info(
      `Discover: found ${candidates.length} candidates for user ${userId}`
    );

    // 7. For each candidate, compute compatibility and attach showcase answers
    const results = await Promise.all(
      candidates.map(async (candidate) => {
        const compatibility =
          await CompatibilityService.calculateCompatibility(
            userId.toString(),
            candidate._id.toString()
          );

        const showcaseAnswers = await this._getShowcaseAnswers(
          candidate._id.toString(),
          6
        );

        return this._formatCandidateCard(
          candidate,
          compatibility,
          showcaseAnswers
        );
      })
    );

    // 8. Sort: higher compatibility first
    results.sort((a, b) => b.compatibility.score - a.compatibility.score);

    return results;
  }

  // ─── Like a User ────────────────────────────────────────────────

  /**
   * Records a "like" interaction. If the other user has already liked
   * this user, creates a mutual Match.
   *
   * @param {string} fromUserId
   * @param {string} toUserId
   * @returns {{ interaction, match?, isMutual }}
   */
  static async likeUser(fromUserId, toUserId, options = {}) {
    // Prevent self-like
    if (fromUserId.toString() === toUserId.toString()) {
      const error = new Error('You cannot like yourself');
      error.statusCode = 400;
      throw error;
    }

    // Check target user exists and is valid
    const targetUser = await User.findById(toUserId).lean();
    if (!targetUser || !targetUser.isActive || targetUser.isBanned) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Calculate compatibility
    const compatibility =
      await CompatibilityService.calculateCompatibility(fromUserId, toUserId);

    // Create interaction
    const interactionData = {
      fromUser: fromUserId,
      toUser: toUserId,
      action: 'like',
      compatibilityScore: compatibility.score,
      matchTier: compatibility.tier,
    };

    if (options.note) {
      interactionData.note = options.note;
    }

    const interaction = await Interaction.create(interactionData);

    // Check for mutual like
    const reciprocal = await Interaction.findOne({
      fromUser: toUserId,
      toUser: fromUserId,
      action: 'like',
    });

    let match = null;
    let isMutual = false;

    if (reciprocal) {
      isMutual = true;

      // Create Match with sorted user IDs for uniqueness
      const sortedUsers = [fromUserId.toString(), toUserId.toString()].sort();

      match = await Match.create({
        users: sortedUsers,
        stage: CONNECTION_STAGES.MUTUAL,
        compatibilityScore: compatibility.score,
        matchTier: compatibility.tier,
        dimensionScores: compatibility.dimensions,
        matchedAt: new Date(),
      });

      logger.info(
        `Mutual match! Users ${fromUserId} <-> ${toUserId} ` +
          `(score: ${compatibility.score}, tier: ${compatibility.tier})`
      );

      // Auto-create conversation for the new match
      try {
        await MessageService.createConversation(match._id, fromUserId, toUserId);
      } catch (err) {
        logger.error('Error creating conversation for match:', err.message);
      }

      // Emit real-time match event to both users
      try {
        const socketManager = require('../config/socket');
        const matchEvent = {
          matchId: match._id,
          compatibilityScore: compatibility.score,
          matchTier: compatibility.tier,
        };
        socketManager.emitToUser(fromUserId.toString(), 'match:new', matchEvent);
        socketManager.emitToUser(toUserId.toString(), 'match:new', matchEvent);
      } catch (err) {
        logger.error('Error emitting match socket event:', err.message);
      }

      // Notify both users of the new match
      const fromUser = await User.findById(fromUserId).select('firstName').lean();
      NotificationService.notifyNewMatch(toUserId, fromUser?.firstName || 'Someone', match._id, compatibility.score);
      NotificationService.notifyNewMatch(fromUserId, targetUser.firstName || 'Someone', match._id, compatibility.score);
    } else {
      // Non-mutual like: notify the target user
      const fromUser = await User.findById(fromUserId).select('firstName').lean();
      NotificationService.sendPush(toUserId, {
        title: 'Someone liked you!',
        body: `${fromUser?.firstName || 'Someone'} is interested in connecting with you`,
        data: { type: 'like_received' }
      });
    }

    // Invalidate stats cache for both users
    cache.invalidate(`discover:stats:${fromUserId}`);
    cache.invalidate(`discover:stats:${toUserId}`);

    return { interaction, match, isMutual };
  }

  // ─── Get Discovery Stats ────────────────────────────────────────

  /**
   * Fetch dashboard statistics for the current user.
   *
   * @param {string} userId
   * @returns {{ newMatches, activeConnections, totalCandidates }}
   */
  static async getStats(userId) {
    return cache.getOrSet(`discover:stats:${userId}`, 60, async () => {
      const [newMatches, activeConnections, totalCandidates] = await Promise.all([
        Match.countDocuments({
          users: userId,
          stage: CONNECTION_STAGES.MUTUAL,
          isActive: true,
        }),
        Match.countDocuments({
          users: userId,
          stage: {
            $in: [
              CONNECTION_STAGES.CONNECTING,
              CONNECTION_STAGES.REVEAL_READY,
              CONNECTION_STAGES.REVEALED,
              CONNECTION_STAGES.DATING,
            ],
          },
          isActive: true,
        }),
        this._countAvailableCandidates(userId),
      ]);

      return { newMatches, activeConnections, totalCandidates };
    });
  }

  /**
   * Pending likes around the current user.
   * incoming: liked you, waiting on your decision
   * outgoing: you liked them, waiting on their decision
   */
  static async getPendingLikes(userId) {
    const [incomingLikes, outgoingLikes, myInteractions, theirInteractions] = await Promise.all([
      Interaction.find({ toUser: userId, action: 'like' })
        .populate(
          'fromUser',
          'firstName dateOfBirth location.city photos.profilePhoto voiceIntro.audioUrl voiceIntro.duration isActive isBanned'
        )
        .sort({ createdAt: -1 })
        .lean(),
      Interaction.find({ fromUser: userId, action: 'like' })
        .populate(
          'toUser',
          'firstName dateOfBirth location.city photos.profilePhoto voiceIntro.audioUrl voiceIntro.duration isActive isBanned'
        )
        .sort({ createdAt: -1 })
        .lean(),
      Interaction.find({ fromUser: userId }, { toUser: 1, action: 1 }).lean(),
      Interaction.find({ toUser: userId }, { fromUser: 1, action: 1 }).lean(),
    ]);

    const myInteractionMap = new Map(
      myInteractions.map((interaction) => [interaction.toUser.toString(), interaction.action])
    );
    const theirInteractionMap = new Map(
      theirInteractions.map((interaction) => [interaction.fromUser.toString(), interaction.action])
    );

    const incoming = await Promise.all(
      incomingLikes
        .filter((interaction) => {
          const fromUser = interaction.fromUser;
          if (!fromUser || !fromUser.isActive || fromUser.isBanned) return false;
          return !myInteractionMap.has(fromUser._id.toString());
        })
        .map((interaction) =>
          this._formatPendingProfile(interaction.fromUser, {
            compatibilityScore: interaction.compatibilityScore,
            matchTier: interaction.matchTier,
            likedAt: interaction.createdAt,
            note: interaction.note || null,
          })
        )
    );

    const outgoing = await Promise.all(
      outgoingLikes
        .filter((interaction) => {
          const toUser = interaction.toUser;
          if (!toUser || !toUser.isActive || toUser.isBanned) return false;
          return !theirInteractionMap.has(toUser._id.toString());
        })
        .map((interaction) =>
          this._formatPendingProfile(interaction.toUser, {
            compatibilityScore: interaction.compatibilityScore,
            matchTier: interaction.matchTier,
            likedAt: interaction.createdAt,
          })
        )
    );

    return { incoming, outgoing };
  }

  /**
   * Count eligible candidates using the same filter pipeline as getCandidates.
   * @private
   */
  static async _countAvailableCandidates(userId) {
    const currentUser = await User.findById(userId).lean();
    if (!currentUser) return 0;

    const interactedDocs = await Interaction.find(
      { fromUser: userId },
      { toUser: 1 }
    ).lean();
    const excludeIds = interactedDocs.map((d) => d.toUser);
    excludeIds.push(currentUser._id);

    const genderFilter = this._buildGenderFilter(currentUser);
    const ageFilter = this._buildAgeFilter(currentUser.dateOfBirth, 5);

    return User.countDocuments({
      _id: { $nin: excludeIds },
      profileStage: 'ready',
      isActive: true,
      isBanned: false,
      ...genderFilter,
      ...ageFilter,
    });
  }

  // ─── Pass on a User ─────────────────────────────────────────────

  /**
   * Records a "pass" interaction.
   *
   * @param {string} fromUserId
   * @param {string} toUserId
   * @returns {{ interaction }}
   */
  static async passUser(fromUserId, toUserId) {
    if (fromUserId.toString() === toUserId.toString()) {
      const error = new Error('Invalid operation');
      error.statusCode = 400;
      throw error;
    }

    const interaction = await Interaction.create({
      fromUser: fromUserId,
      toUser: toUserId,
      action: 'pass',
    });

    return { interaction };
  }

  // ─── Private Helpers ────────────────────────────────────────────

  /**
   * Build bidirectional gender preference filter.
   *
   * For user A to see user B:
   *   - A.interestedIn must match B.gender
   *   - B.interestedIn must match A.gender
   *
   * Mapping: interestedIn "men" → gender "male",
   *          interestedIn "women" → gender "female",
   *          interestedIn "everyone" → any gender
   * @private
   */
  static _buildGenderFilter(currentUser) {
    const filter = {};

    // What genders should the current user see?
    if (currentUser.interestedIn === 'men') {
      filter.gender = 'male';
    } else if (currentUser.interestedIn === 'women') {
      filter.gender = 'female';
    }
    // 'everyone' → no gender filter on candidates

    // Candidates must also be interested in the current user's gender
    const userGender = currentUser.gender;
    if (userGender === 'male') {
      filter.interestedIn = { $in: ['men', 'everyone'] };
    } else if (userGender === 'female') {
      filter.interestedIn = { $in: ['women', 'everyone'] };
    } else {
      // non-binary/other: show users interested in 'everyone'
      filter.interestedIn = 'everyone';
    }

    return filter;
  }

  /**
   * Build age range filter from the current user's DOB.
   * @private
   */
  static _buildAgeFilter(currentUserDob, range) {
    if (!currentUserDob) return {};

    const now = new Date();
    const currentAge = Math.floor(
      (now - new Date(currentUserDob)) / (365.25 * 24 * 60 * 60 * 1000)
    );

    const minAge = Math.max(18, currentAge - range);
    const maxAge = currentAge + range;

    // Convert age limits back to DOB limits
    // maxAge → earliest DOB, minAge → latest DOB
    const earliestDob = new Date(
      now.getFullYear() - maxAge - 1,
      now.getMonth(),
      now.getDate()
    );
    const latestDob = new Date(
      now.getFullYear() - minAge,
      now.getMonth(),
      now.getDate()
    );

    return {
      dateOfBirth: {
        $gte: earliestDob,
        $lte: latestDob,
      },
    };
  }

  /**
   * Fetch N interesting answers from a candidate for their card.
   * Prioritizes text answers from 'surface' and 'moderate' depth
   * (more personality-revealing and approachable).
   * @private
   */
  static async _getShowcaseAnswers(candidateId, count = 3) {
    return cache.getOrSet(`showcase:${candidateId}:${count}`, 300, async () => {
      const answers = await Answer.find({ userId: candidateId })
        .sort({ submittedAt: -1 })
        .limit(20)
        .lean();

      if (answers.length === 0) return [];

      const questionNumbers = answers.map((a) => a.questionNumber);
      const questions = await Question.find({
        questionNumber: { $in: questionNumbers },
      }).lean();

      const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

      const combined = answers
        .map((a) => ({
          questionText: questionMap.get(a.questionNumber)?.questionText || '',
          dimension: questionMap.get(a.questionNumber)?.dimension || '',
          depthLevel:
            questionMap.get(a.questionNumber)?.depthLevel || 'surface',
          answer:
            a.textAnswer ||
            a.selectedOption ||
            (a.selectedOptions || []).join(', '),
          questionType:
            questionMap.get(a.questionNumber)?.questionType || 'text',
        }))
        .filter(
          (item) => item.answer && item.answer.length > 0 && item.questionText
        )
        .sort((a, b) => {
          if (a.questionType === 'text' && b.questionType !== 'text') return -1;
          if (a.questionType !== 'text' && b.questionType === 'text') return 1;
          const depthOrder = { surface: 0, moderate: 1, deep: 2, vulnerable: 3 };
          return (depthOrder[a.depthLevel] || 0) - (depthOrder[b.depthLevel] || 0);
        });

      return combined.slice(0, count);
    });
  }

  /**
   * Format a candidate document into the card payload sent to the frontend.
   * @private
   */
  static async _formatCandidateCard(candidate, compatibility, showcaseAnswers) {
    // Compute age from DOB
    const age = candidate.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(candidate.dateOfBirth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

    const [silhouetteUrl, blurredUrl, audioUrl] = await Promise.all([
      UploadService.getAccessibleUrl(candidate.photos?.profilePhoto?.silhouetteUrl || null),
      UploadService.getAccessibleUrl(candidate.photos?.profilePhoto?.blurredUrl || null),
      UploadService.getAccessibleUrl(candidate.voiceIntro?.audioUrl || null),
    ]);

    return {
      userId: candidate._id,
      firstName: candidate.firstName,
      age,
      city: candidate.location?.city || null,
      photos: {
        silhouetteUrl,
        blurredUrl,
      },
      voiceIntro: {
        audioUrl,
        duration: candidate.voiceIntro?.duration || null,
      },
      compatibility: {
        score: compatibility.score,
        tier: compatibility.tier,
        tierLabel: compatibility.tierLabel,
        dimensions: compatibility.dimensions || {},
      },
      showcaseAnswers,
    };
  }

  static async _formatPendingProfile(user, interaction) {
    const age = user.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(user.dateOfBirth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

    const [silhouetteUrl, blurredUrl, audioUrl] = await Promise.all([
      UploadService.getAccessibleUrl(user.photos?.profilePhoto?.silhouetteUrl || null),
      UploadService.getAccessibleUrl(user.photos?.profilePhoto?.blurredUrl || null),
      UploadService.getAccessibleUrl(user.voiceIntro?.audioUrl || null),
    ]);

    return {
      userId: user._id,
      firstName: user.firstName,
      age,
      city: user.location?.city || null,
      photos: {
        silhouetteUrl,
        blurredUrl,
      },
      voiceIntro: {
        audioUrl,
        duration: user.voiceIntro?.duration || null,
      },
      compatibilityScore: interaction.compatibilityScore || null,
      matchTier: interaction.matchTier || null,
      likedAt: interaction.likedAt || null,
      note: interaction.note || null,
    };
  }
}

module.exports = DiscoverService;
