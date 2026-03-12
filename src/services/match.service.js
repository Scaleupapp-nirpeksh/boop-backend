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
        lastBoop: match.lastBoop || null,
        boopCount: match.boopCount || 0,
        streak: match.streak || { current: 0, longest: 0, lastActiveDate: null },
        otherUser: await MatchService._formatOtherUser(otherUser, photosRevealed, false, match.comfortScore || 0),
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
      lastBoop: match.lastBoop || null,
      boopCount: match.boopCount || 0,
      streak: match.streak || { current: 0, longest: 0, lastActiveDate: null },
      otherUser: await MatchService._formatOtherUser(otherUser, photosRevealed, true, match.comfortScore || 0),
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

  // ─── Boop Gesture ───────────────────────────────────────────

  /**
   * Send a "Boop" (poke) to a match.
   * Rate-limited: 1 boop per match per 4 hours.
   * Creates a system message in the conversation and sends push notification.
   */
  static async sendBoop(userId, matchId) {
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

    // Rate limit: 1 boop per 4 hours
    if (match.lastBoop?.sentAt) {
      const hoursSinceLastBoop = (Date.now() - new Date(match.lastBoop.sentAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastBoop < 4) {
        const error = new Error('You can only boop once every 4 hours');
        error.statusCode = 429;
        throw error;
      }
    }

    const otherUserId = match.getOtherUserId(userId);

    // Update match boop data
    match.lastBoop = { senderId: userId, sentAt: new Date() };
    match.boopCount = (match.boopCount || 0) + 1;
    await match.save();

    // Send system message in conversation
    const conversation = await Conversation.findOne({ matchId });
    if (conversation) {
      const systemMessage = await Message.create({
        conversationId: conversation._id,
        senderId: userId,
        type: 'system',
        content: { text: 'sent a boop! 💕' },
      });
      conversation.lastMessage = {
        text: '💕 Boop!',
        senderId: userId,
        sentAt: systemMessage.createdAt,
        type: 'system',
      };
      conversation.messageCount += 1;
      await conversation.save();
    }

    // Get sender name for notification
    const sender = await User.findById(userId).select('firstName').lean();
    const senderName = sender?.firstName || 'Someone';

    // Send push notification
    NotificationService.sendPush(otherUserId, {
      type: 'boop',
      title: `${senderName} booped you! 💕`,
      body: `${senderName} is thinking of you`,
      data: { matchId: matchId.toString(), senderId: userId.toString(), senderName },
    });

    logger.info(`Boop: ${userId} → ${otherUserId} on match ${matchId} (total: ${match.boopCount})`);

    return {
      matchId: match._id,
      boopCount: match.boopCount,
      otherUserId,
      senderName,
    };
  }

  // ─── Compatibility Deep-Dive ─────────────────────────────────

  /**
   * Returns a detailed breakdown of compatibility across all 8 dimensions,
   * with AI-generated narratives for each dimension.
   */
  static async getCompatibilityDeepDive(userId, matchId) {
    const Answer = require('../models/Answer');
    const Question = require('../models/Question');

    const match = await Match.findOne({
      _id: matchId,
      users: userId,
      isActive: true,
    })
      .populate('users', 'firstName')
      .lean();

    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    const otherUserId = match.users.find(
      (u) => u._id.toString() !== userId.toString()
    );
    const currentUser = match.users.find(
      (u) => u._id.toString() === userId.toString()
    );

    const dimensionScores = match.dimensionScores
      ? Object.fromEntries(match.dimensionScores)
      : {};

    const DIMENSION_META = {
      emotional_vulnerability: { label: 'Emotional Honesty', icon: 'heart.fill', color: 'FF6B6B' },
      attachment_patterns: { label: 'Attachment Rhythm', icon: 'link', color: 'E056A0' },
      life_vision: { label: 'Future Direction', icon: 'sparkles', color: '4ECDC4' },
      conflict_resolution: { label: 'Repair Style', icon: 'arrow.triangle.2.circlepath', color: 'FF8C42' },
      love_expression: { label: 'Love Expression', icon: 'gift.fill', color: 'F56FAD' },
      intimacy_comfort: { label: 'Closeness Comfort', icon: 'person.2.fill', color: '9B5DE5' },
      lifestyle_rhythm: { label: 'Daily Rhythm', icon: 'clock.fill', color: '00BBF9' },
      growth_mindset: { label: 'Growth Mindset', icon: 'arrow.up.right', color: '2ECC71' },
    };

    // Fetch shared question answers for context
    const [userAnswers, otherAnswers] = await Promise.all([
      Answer.find({ userId }).limit(20).lean(),
      Answer.find({ userId: otherUserId._id }).limit(20).lean(),
    ]);

    const allQuestionNumbers = [
      ...userAnswers.map((a) => a.questionNumber),
      ...otherAnswers.map((a) => a.questionNumber),
    ];
    const questions = await Question.find({
      questionNumber: { $in: [...new Set(allQuestionNumbers)] },
    }).lean();
    const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

    // Find shared questions (both answered)
    const userAnswerMap = new Map(userAnswers.map((a) => [a.questionNumber, a]));
    const otherAnswerMap = new Map(otherAnswers.map((a) => [a.questionNumber, a]));
    const sharedQuestionNumbers = userAnswers
      .filter((a) => otherAnswerMap.has(a.questionNumber))
      .map((a) => a.questionNumber);

    // Build dimensions array
    const dimensions = Object.entries(DIMENSION_META).map(([key, meta]) => {
      const score = dimensionScores[key] ?? null;
      const scorePercent = score !== null ? Math.round(score * 100) : null;

      return {
        key,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        score: scorePercent,
      };
    });

    // Sort: highest score first
    dimensions.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // Generate AI narratives
    let narratives = {};
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const sharedContext = sharedQuestionNumbers.slice(0, 10).map((qn) => {
        const q = questionMap.get(qn);
        const uAns = userAnswerMap.get(qn);
        const oAns = otherAnswerMap.get(qn);
        const getAnswer = (a) => a?.textAnswer || a?.selectedOption || (a?.selectedOptions || []).join(', ');
        return `Q: ${q?.questionText || 'Question'}\n  ${currentUser?.firstName}: ${getAnswer(uAns)}\n  ${otherUserId?.firstName}: ${getAnswer(oAns)}`;
      }).join('\n\n');

      const dimData = dimensions.map(d => `${d.label} (${d.key}): ${d.score ?? 'N/A'}%`).join('\n');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a relationship psychologist analyzing a compatibility deep-dive for two people on a dating app. For each compatibility dimension, write a warm, specific 1-2 sentence narrative explaining what this score means for their connection. Use their first names. Be encouraging for high scores and gently curious for lower ones.

Return JSON: { "narratives": { "dimension_key": "narrative text", ... }, "overallNarrative": "2-3 sentence overall compatibility summary", "strongestBond": "dimension_key", "growthOpportunity": "dimension_key" }`,
          },
          {
            role: 'user',
            content: `${currentUser?.firstName || 'User 1'} and ${otherUserId?.firstName || 'User 2'}\n\nDimension scores:\n${dimData}\n\nShared answers:\n${sharedContext || 'No shared answers yet'}`,
          },
        ],
      });

      narratives = JSON.parse(completion.choices[0].message.content);
    } catch {
      // Fallback: generate simple narratives
      const FALLBACK_NARRATIVES = {
        emotional_vulnerability: (s) => s >= 70 ? 'You both open up in a similar way — a strong emotional foundation.' : 'This is where patience and curiosity will strengthen the bond.',
        attachment_patterns: (s) => s >= 70 ? 'Your pacing around connection feels naturally compatible.' : 'You may want different speeds of reassurance — worth exploring gently.',
        life_vision: (s) => s >= 70 ? 'The kind of future you imagine has real overlap.' : 'Keep talking about long-term expectations early and openly.',
        conflict_resolution: (s) => s >= 70 ? 'You tend to repair tension in ways that can actually meet.' : 'Different repair styles can complement each other with awareness.',
        love_expression: (s) => s >= 70 ? 'The way you show care lands in a familiar register.' : 'Learning each other\'s love language will unlock a lot here.',
        intimacy_comfort: (s) => s >= 70 ? 'Your comfort with closeness feels unusually well matched.' : 'Let this part grow through trust, not pressure.',
        lifestyle_rhythm: (s) => s >= 70 ? 'Your day-to-day tempo looks easy to share.' : 'Finding your shared rhythm will take some creative compromise.',
        growth_mindset: (s) => s >= 70 ? 'You both lean toward growth instead of staying stuck.' : 'Staying curious together can turn this into a real strength.',
      };

      const dimNarratives = {};
      dimensions.forEach((d) => {
        const fn = FALLBACK_NARRATIVES[d.key];
        dimNarratives[d.key] = fn ? fn(d.score ?? 0) : `${d.score ?? 0}% alignment in this dimension.`;
      });

      narratives = {
        narratives: dimNarratives,
        overallNarrative: `${currentUser?.firstName || 'You'} and ${otherUserId?.firstName || 'your match'} share ${match.compatibilityScore}% overall compatibility. Your strongest areas create a solid foundation, while growth areas offer a chance to learn from each other.`,
        strongestBond: dimensions[0]?.key || null,
        growthOpportunity: dimensions[dimensions.length - 1]?.key || null,
      };
    }

    // Enrich dimensions with narratives
    const enrichedDimensions = dimensions.map((d) => ({
      ...d,
      narrative: narratives.narratives?.[d.key] || null,
    }));

    return {
      matchId: match._id,
      compatibilityScore: match.compatibilityScore,
      matchTier: match.matchTier,
      user1Name: currentUser?.firstName || null,
      user2Name: otherUserId?.firstName || null,
      dimensions: enrichedDimensions,
      overallNarrative: narratives.overallNarrative || null,
      strongestBond: narratives.strongestBond || null,
      growthOpportunity: narratives.growthOpportunity || null,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Calculate blur level from comfort score.
   * 0-24 → 30 (heavy blur), 25-49 → 20, 50-69 → 10, 70+ → 0 (clear)
   */
  static _calculateBlurLevel(comfortScore) {
    if (comfortScore >= 70) return 0;
    if (comfortScore >= 50) return 10;
    if (comfortScore >= 25) return 20;
    return 30;
  }

  /**
   * Formats other user data based on photo reveal status.
   * @param {Object} user - Populated user document (lean)
   * @param {boolean} photosRevealed - Whether real photos should be shown
   * @param {boolean} detailed - Whether to include extended profile data
   * @param {number} comfortScore - Current comfort score (for blur level)
   */
  static async _formatOtherUser(user, photosRevealed = false, detailed = false, comfortScore = 0) {
    if (!user) return null;

    const age = user.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(user.dateOfBirth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

    const blurLevel = photosRevealed ? 0 : MatchService._calculateBlurLevel(comfortScore);

    const base = {
      userId: user._id,
      firstName: user.firstName,
      age,
      city: user.location?.city || null,
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen || null,
      blurLevel,
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
