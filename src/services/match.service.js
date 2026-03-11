const Match = require('../models/Match');
const User = require('../models/User');
const { CONNECTION_STAGES, STAGE_TRANSITIONS, COMFORT_REVEAL_THRESHOLD, DATE_READINESS_WEIGHTS } = require('../utils/constants');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Game = require('../models/Game');
const UploadService = require('./upload.service');
const NotificationService = require('./notification.service');
const logger = require('../utils/logger');

// MARK: - Match Service

/**
 * Handles match lifecycle: listing, stage progression, photo reveal, archiving.
 */
class MatchService {
  // ─── Get Matches ──────────────────────────────────────────────

  /**
   * Lists the user's matches, optionally filtered by stage.
   * Returns matches sorted by most recent first, with other user populated.
   */
  static async getMatches(userId, { stage = null, page = 1, limit = 20 } = {}) {
    const query = { users: userId, isActive: true };

    if (stage) {
      query.stage = stage;
    }

    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      Match.find(query)
        .populate('users', 'firstName dateOfBirth gender location voiceIntro photos.profilePhoto isOnline lastSeen')
        .sort({ matchedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Match.countDocuments(query),
    ]);

    // Format: swap out the user array for just the "other user" info
    const formatted = await Promise.all(matches.map(async (match) => {
      const otherUser = match.users.find(
        (u) => u._id.toString() !== userId.toString()
      );

      // Determine photo visibility based on stage
      const photosRevealed =
        match.stage === CONNECTION_STAGES.REVEALED ||
        match.stage === CONNECTION_STAGES.DATING;

      return {
        matchId: match._id,
        stage: match.stage,
        compatibilityScore: match.compatibilityScore,
        matchTier: match.matchTier,
        comfortScore: match.comfortScore,
        matchedAt: match.matchedAt,
        otherUser: await MatchService._formatOtherUser(otherUser, photosRevealed),
      };
    }));

    return {
      matches: formatted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Get Match By ID ──────────────────────────────────────────

  /**
   * Returns a single match detail with full other-user profile.
   * Photo visibility depends on match stage.
   */
  static async getMatchById(userId, matchId) {
    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    })
      .populate(
        'users',
        'firstName dateOfBirth gender location bio voiceIntro photos isOnline lastSeen'
      )
      .lean();

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    const otherUser = match.users.find(
      (u) => u._id.toString() !== userId.toString()
    );

    const photosRevealed =
      match.stage === CONNECTION_STAGES.REVEALED ||
      match.stage === CONNECTION_STAGES.DATING;

    return {
      matchId: match._id,
      stage: match.stage,
      compatibilityScore: match.compatibilityScore,
      matchTier: match.matchTier,
      dimensionScores: match.dimensionScores,
      comfortScore: match.comfortScore,
      matchedAt: match.matchedAt,
      revealStatus: match.revealStatus,
      otherUser: await MatchService._formatOtherUser(otherUser, photosRevealed, true),
    };
  }

  // ─── Advance Stage ────────────────────────────────────────────

  /**
   * Advances a match to the next valid stage in the pipeline.
   * Enforces transition rules from STAGE_TRANSITIONS.
   */
  static async advanceStage(userId, matchId) {
    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    });

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    // Determine the next valid stage (forward-only, excludes ARCHIVED)
    const validTargets = STAGE_TRANSITIONS[match.stage] || [];
    const nextStage = validTargets.find((s) => s !== CONNECTION_STAGES.ARCHIVED);

    if (!nextStage) {
      const error = new Error(
        `Cannot advance from stage "${match.stage}". No forward transition available.`
      );
      error.statusCode = 400;
      throw error;
    }

    // Stage-specific gates
    if (
      match.stage === CONNECTION_STAGES.CONNECTING &&
      nextStage === CONNECTION_STAGES.REVEAL_READY
    ) {
      // Recalculate comfort score before gating
      try {
        const ComfortService = require('./comfort.service');
        await ComfortService.calculateComfortScore(matchId);
        await match.constructor.findById(matchId).then((updated) => {
          if (updated) match.comfortScore = updated.comfortScore;
        });
      } catch (_) {
        // If recalculation fails, use existing score
      }

      // Require minimum comfort score to advance to reveal_ready
      if (match.comfortScore < COMFORT_REVEAL_THRESHOLD) {
        const error = new Error(
          `Your comfort level (${match.comfortScore}/100) hasn't reached the threshold (${COMFORT_REVEAL_THRESHOLD}). Keep chatting and playing games!`
        );
        error.statusCode = 400;
        throw error;
      }
    }

    if (
      match.stage === CONNECTION_STAGES.REVEAL_READY &&
      nextStage === CONNECTION_STAGES.REVEALED
    ) {
      // Both users must have requested reveal
      if (
        !match.revealStatus?.user1?.requested ||
        !match.revealStatus?.user2?.requested
      ) {
        const error = new Error(
          'Both users must request photo reveal before advancing to REVEALED'
        );
        error.statusCode = 400;
        throw error;
      }
    }

    match.stage = nextStage;
    await match.save();

    // Notify the other user about stage advancement
    try {
      const otherUserId = match.users.find(
        (u) => u.toString() !== userId.toString()
      );
      if (otherUserId) {
        NotificationService.notifyStageAdvanced(otherUserId.toString(), matchId, nextStage);
      }
    } catch (notifErr) {
      logger.error('Error sending stage advanced notification:', notifErr.message);
    }

    logger.info(
      `Match ${matchId} advanced to stage "${nextStage}" by user ${userId}`
    );

    return {
      matchId: match._id,
      stage: match.stage,
      previousStage: match.stage,
    };
  }

  // ─── Archive Match ────────────────────────────────────────────

  /**
   * Moves a match to the ARCHIVED stage.
   */
  static async archiveMatch(userId, matchId, reason = 'other') {
    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    });

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    if (match.stage === CONNECTION_STAGES.ARCHIVED) {
      const error = new Error('Match is already archived');
      error.statusCode = 400;
      throw error;
    }

    match.stage = CONNECTION_STAGES.ARCHIVED;
    match.isActive = false;
    match.archivedBy = userId;
    match.archivedAt = new Date();
    match.archiveReason = reason;
    await match.save();

    logger.info(`Match ${matchId} archived by user ${userId} (reason: ${reason})`);

    return {
      matchId: match._id,
      stage: match.stage,
      archiveReason: reason,
    };
  }

  // ─── Request Photo Reveal ─────────────────────────────────────

  /**
   * Records a user's request to reveal photos.
   * If both users have requested, auto-advances to REVEALED.
   */
  static async requestReveal(userId, matchId) {
    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    });

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    // Must be in CONNECTING or REVEAL_READY to request reveal
    const allowedStages = [CONNECTION_STAGES.CONNECTING, CONNECTION_STAGES.REVEAL_READY];
    if (!allowedStages.includes(match.stage)) {
      const error = new Error(
        `Cannot request reveal in stage "${match.stage}". Must be in CONNECTING or REVEAL_READY.`
      );
      error.statusCode = 400;
      throw error;
    }

    const userIdStr = userId.toString();

    // Initialize revealStatus user slots if needed
    if (!match.revealStatus?.user1?.userId) {
      match.revealStatus = {
        user1: { userId: match.users[0], requested: false },
        user2: { userId: match.users[1], requested: false },
      };
    }

    // Determine which slot this user is
    const isUser1 =
      match.revealStatus.user1.userId?.toString() === userIdStr;
    const isUser2 =
      match.revealStatus.user2.userId?.toString() === userIdStr;

    if (!isUser1 && !isUser2) {
      const error = new Error('User not part of this match');
      error.statusCode = 403;
      throw error;
    }

    // Set this user's reveal request
    if (isUser1) {
      if (match.revealStatus.user1.requested) {
        const error = new Error('You have already requested reveal');
        error.statusCode = 400;
        throw error;
      }
      match.revealStatus.user1.requested = true;
    } else {
      if (match.revealStatus.user2.requested) {
        const error = new Error('You have already requested reveal');
        error.statusCode = 400;
        throw error;
      }
      match.revealStatus.user2.requested = true;
    }

    // If in CONNECTING, enforce comfort gate before advancing to REVEAL_READY
    if (match.stage === CONNECTION_STAGES.CONNECTING) {
      // Recalculate comfort score
      try {
        const ComfortService = require('./comfort.service');
        await ComfortService.calculateComfortScore(matchId);
        const updated = await Match.findById(matchId);
        if (updated) match.comfortScore = updated.comfortScore;
      } catch (_) {
        // Use existing score if recalculation fails
      }

      if (match.comfortScore < COMFORT_REVEAL_THRESHOLD) {
        const error = new Error(
          `Your comfort level (${match.comfortScore}/100) hasn't reached the threshold (${COMFORT_REVEAL_THRESHOLD}). Keep chatting and playing games!`
        );
        error.statusCode = 400;
        throw error;
      }

      match.stage = CONNECTION_STAGES.REVEAL_READY;
    }

    // If both have requested, auto-advance to REVEALED
    let bothRevealed = false;
    if (
      match.revealStatus.user1.requested &&
      match.revealStatus.user2.requested
    ) {
      match.stage = CONNECTION_STAGES.REVEALED;
      match.revealStatus.revealedAt = new Date();
      bothRevealed = true;
    }

    // Mark as modified since Mongoose may not detect nested changes
    match.markModified('revealStatus');
    await match.save();

    const otherUserId = match.getOtherUserId(userId);

    // Send reveal notifications
    try {
      const requester = await User.findById(userId).select('firstName').lean();
      const requesterName = requester?.firstName || 'Your match';

      if (bothRevealed) {
        // Both revealed — notify both users
        NotificationService.notifyPhotosRevealed(match.users[0].toString(), matchId);
        NotificationService.notifyPhotosRevealed(match.users[1].toString(), matchId);
      } else {
        // Only one side requested — notify the other user
        NotificationService.notifyRevealRequest(otherUserId.toString(), requesterName, matchId);
      }
    } catch (notifErr) {
      logger.error('Error sending reveal notification:', notifErr.message);
    }

    logger.info(
      `Match ${matchId}: User ${userId} requested reveal (bothRevealed: ${bothRevealed})`
    );

    return {
      matchId: match._id,
      stage: match.stage,
      revealStatus: match.revealStatus,
      bothRevealed,
      otherUserId,
    };
  }

  // ─── Date Readiness ──────────────────────────────────────────

  /**
   * Calculates whether a match is ready for a real-world date.
   * Uses DATE_READINESS_WEIGHTS: compatibility (0.35), engagement (0.20),
   * red_flags (0.25), mutual_interest (0.20).
   * Score 0-100, isReady = score >= 70.
   */
  static async calculateDateReadiness(userId, matchId) {
    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    });

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    const user1Id = match.users[0].toString();
    const user2Id = match.users[1].toString();

    // Fetch conversation + messages
    const conversation = await Conversation.findOne({ matchId });
    const messages = conversation
      ? await Message.find({ conversationId: conversation._id, isDeleted: false })
          .select('senderId type createdAt')
          .lean()
      : [];

    // Fetch completed games
    const completedGames = await Game.countDocuments({ matchId, status: 'completed' });

    // ─── Factor 1: COMPATIBILITY (0.35) ───────────────────────────
    const compatibilityFactor = Math.min((match.compatibilityScore || 0) / 100, 1);

    // ─── Factor 2: ENGAGEMENT (0.20) ──────────────────────────────
    // Combination of message count, active days, games, and comfort score
    const totalMessages = messages.length;
    const activeDays = new Set(
      messages.map((m) => new Date(m.createdAt).toISOString().split('T')[0])
    ).size;

    const msgScore = Math.min(totalMessages / 50, 1);
    const dayScore = Math.min(activeDays / 7, 1);
    const gameScore = Math.min(completedGames / 3, 1);
    const comfortNorm = Math.min((match.comfortScore || 0) / 100, 1);
    const engagementFactor = (msgScore * 0.3 + dayScore * 0.3 + gameScore * 0.2 + comfortNorm * 0.2);

    // ─── Factor 3: RED_FLAGS (0.25) ───────────────────────────────
    // Inverse scoring: start at 1.0 and subtract penalties
    let redFlagPenalty = 0;

    // One-sided messaging (>80% from one person)
    const user1Msgs = messages.filter((m) => m.senderId.toString() === user1Id).length;
    const user2Msgs = messages.filter((m) => m.senderId.toString() === user2Id).length;
    if (totalMessages > 10) {
      const maxShare = Math.max(user1Msgs, user2Msgs) / totalMessages;
      if (maxShare > 0.8) redFlagPenalty += 0.4;
      else if (maxShare > 0.7) redFlagPenalty += 0.2;
    }

    // Inactivity: no messages in last 3 days
    if (messages.length > 0) {
      const lastMsg = messages.reduce((latest, m) =>
        new Date(m.createdAt) > new Date(latest.createdAt) ? m : latest
      );
      const daysSinceLastMsg = (Date.now() - new Date(lastMsg.createdAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastMsg > 7) redFlagPenalty += 0.4;
      else if (daysSinceLastMsg > 3) redFlagPenalty += 0.2;
    } else {
      redFlagPenalty += 0.5;
    }

    // Low game engagement
    if (completedGames === 0 && totalMessages > 20) redFlagPenalty += 0.1;

    const redFlagsFactor = Math.max(0, 1 - redFlagPenalty);

    // ─── Factor 4: MUTUAL_INTEREST (0.20) ─────────────────────────
    // Both users actively participating
    let mutualInterestFactor = 0;

    // Message balance (min/max ratio)
    if (user1Msgs > 0 && user2Msgs > 0) {
      mutualInterestFactor += Math.min(user1Msgs, user2Msgs) / Math.max(user1Msgs, user2Msgs) * 0.4;
    }

    // Both playing games
    mutualInterestFactor += Math.min(completedGames / 2, 1) * 0.2;

    // Reveal status (both requesting = strong signal)
    if (match.revealStatus?.user1?.requested && match.revealStatus?.user2?.requested) {
      mutualInterestFactor += 0.4;
    } else if (match.revealStatus?.user1?.requested || match.revealStatus?.user2?.requested) {
      mutualInterestFactor += 0.2;
    }

    mutualInterestFactor = Math.min(mutualInterestFactor, 1);

    // ─── Weighted Sum ─────────────────────────────────────────────
    const rawScore =
      compatibilityFactor * DATE_READINESS_WEIGHTS.COMPATIBILITY +
      engagementFactor * DATE_READINESS_WEIGHTS.ENGAGEMENT +
      redFlagsFactor * DATE_READINESS_WEIGHTS.RED_FLAGS +
      mutualInterestFactor * DATE_READINESS_WEIGHTS.MUTUAL_INTEREST;

    const score = Math.round(rawScore * 100);

    const breakdown = {
      compatibility: { value: Math.round(compatibilityFactor * 100), weight: DATE_READINESS_WEIGHTS.COMPATIBILITY },
      engagement: { value: Math.round(engagementFactor * 100), weight: DATE_READINESS_WEIGHTS.ENGAGEMENT },
      redFlags: { value: Math.round(redFlagsFactor * 100), weight: DATE_READINESS_WEIGHTS.RED_FLAGS },
      mutualInterest: { value: Math.round(mutualInterestFactor * 100), weight: DATE_READINESS_WEIGHTS.MUTUAL_INTEREST },
    };

    return {
      matchId: match._id,
      score,
      isReady: score >= 70,
      breakdown,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Formats other user data based on photo reveal status.
   * @param {Object} user - Populated user document (lean)
   * @param {boolean} photosRevealed - Whether real photos should be shown
   * @param {boolean} detailed - Whether to include extended profile data
   */
  static async _formatOtherUser(user, photosRevealed = false, detailed = false) {
    if (!user) return null;

    const age = user.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(user.dateOfBirth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

    const base = {
      userId: user._id,
      firstName: user.firstName,
      age,
      city: user.location?.city || null,
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen || null,
      voiceIntro: {
        audioUrl: null,
        duration: user.voiceIntro?.duration || null,
      },
    };

    base.voiceIntro.audioUrl = await UploadService.getAccessibleUrl(
      user.voiceIntro?.audioUrl || null
    );

    // Photo visibility
    if (photosRevealed) {
      base.photos = {
        profilePhotoUrl: await UploadService.getAccessibleUrl(user.photos?.profilePhoto?.url || null),
        items: await Promise.all((user.photos?.items || []).map(async (item) => ({
          url: await UploadService.getAccessibleUrl(item.url || item.s3Key || null),
          order: item.order,
        }))),
      };
    } else {
      base.photos = {
        silhouetteUrl: await UploadService.getAccessibleUrl(user.photos?.profilePhoto?.silhouetteUrl || null),
        blurredUrl: await UploadService.getAccessibleUrl(user.photos?.profilePhoto?.blurredUrl || null),
      };
    }

    // Extended info for detail view
    if (detailed) {
      base.gender = user.gender || null;
      base.bio = user.bio?.text || null;
    }

    return base;
  }
}

module.exports = MatchService;
