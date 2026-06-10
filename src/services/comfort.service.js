const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Game = require('../models/Game');
const ScoreSnapshot = require('../models/ScoreSnapshot');
const { COMFORT_WEIGHTS, COMFORT_LIMITS } = require('../utils/constants');
const logger = require('../utils/logger');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD key for a date in IST */
const dayKeyIST = (date) =>
  new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().split('T')[0];

// MARK: - Comfort Score Service

/**
 * Calculates the comfort score between two matched users.
 *
 * Uses weighted factors from COMFORT_WEIGHTS:
 *  - MESSAGE_VOLUME (0.15): quality messages / 50 (per-day cap applied, capped at 1)
 *  - MESSAGE_DEPTH (0.20): avg message length / 100 chars (capped at 1)
 *  - VOICE_ENGAGEMENT (0.15): voice messages / 5 (per-day cap applied, capped at 1)
 *  - GAMES_COMPLETED (0.15): completed games / 3 (capped at 1)
 *  - RESPONSE_CONSISTENCY (0.10): ratio of min/max message counts between users
 *  - ACTIVE_DAYS (0.15): distinct IST days with quality messages / 14 (capped at 1)
 *  - VULNERABILITY_SIGNALS (0.10): deep game play + photo reveals + long msgs
 *
 * Final score is 0–100.
 */
class ComfortService {
  // ─── Calculate Comfort Score ──────────────────────────────────

  /**
   * Calculates and persists the comfort score for a match.
   * @param {string} matchId
   * @returns {{ score: number, breakdown: object }}
   */
  static async calculateComfortScore(matchId) {
    const match = await Match.findById(matchId);
    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    // Find the conversation for this match
    const conversation = await Conversation.findOne({ matchId });
    if (!conversation) {
      // No conversation yet — score is 0
      return ComfortService._saveAndReturn(match, 0, ComfortService._emptyBreakdown(), { activeDays: 0, qualityMessages: 0 });
    }

    // Fetch all messages in this conversation
    const messages = await Message.find({
      conversationId: conversation._id,
      isDeleted: false,
    })
      .select('senderId type content.text createdAt')
      .lean();

    // Fetch completed games
    const completedGames = await Game.countDocuments({
      matchId,
      status: 'completed',
    });

    const user1Id = match.users[0].toString();
    const user2Id = match.users[1].toString();

    // ─── Quality filter ───────────────────────────────────────────
    // Only real conversation counts: text (≥ min length), voice, image.
    // Never system (boops) or game_invite messages.
    const COUNTABLE_TYPES = ['text', 'voice', 'image'];
    const qualityMessages = messages.filter((m) => {
      if (!COUNTABLE_TYPES.includes(m.type)) return false;
      if (m.type !== 'text') return true;
      return (m.content?.text || '').trim().length >= COMFORT_LIMITS.MIN_QUALITY_TEXT_LENGTH;
    });

    // Group by IST calendar day for per-day caps.
    // Note: caps pool BOTH users' messages per day (combined, not per-user) — a
    // deliberate choice so a pair can't double the counted volume by each sending
    // up to the cap independently.
    const byDay = new Map();
    qualityMessages.forEach((m) => {
      const key = dayKeyIST(m.createdAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(m);
    });

    // ─── Factor 1: MESSAGE_VOLUME (per-day cap) ───────────────────
    let countedMessages = 0;
    byDay.forEach((dayMsgs) => {
      countedMessages += Math.min(dayMsgs.length, COMFORT_LIMITS.MAX_MESSAGES_PER_DAY);
    });
    const messageVolumeRaw = Math.min(countedMessages / 50, 1);

    // ─── Factor 2: MESSAGE_DEPTH (quality text only) ──────────────
    const textMessages = qualityMessages.filter(
      (m) => m.type === 'text' && m.content?.text
    );
    const avgLength =
      textMessages.length > 0
        ? textMessages.reduce((sum, m) => sum + (m.content.text?.length || 0), 0) /
          textMessages.length
        : 0;
    const messageDepthRaw = Math.min(avgLength / 100, 1);

    // ─── Factor 3: VOICE_ENGAGEMENT (per-day cap) ─────────────────
    let countedVoice = 0;
    byDay.forEach((dayMsgs) => {
      const dayVoice = dayMsgs.filter((m) => m.type === 'voice').length;
      countedVoice += Math.min(dayVoice, COMFORT_LIMITS.MAX_VOICE_PER_DAY);
    });
    const voiceEngagementRaw = Math.min(countedVoice / 5, 1);

    // ─── Factor 4: GAMES_COMPLETED ────────────────────────────────
    const gamesCompletedRaw = Math.min(completedGames / 3, 1);

    // ─── Factor 5: RESPONSE_CONSISTENCY (quality messages) ────────
    const user1Messages = qualityMessages.filter(
      (m) => m.senderId.toString() === user1Id
    ).length;
    const user2Messages = qualityMessages.filter(
      (m) => m.senderId.toString() === user2Id
    ).length;

    let responseConsistencyRaw = 0;
    if (user1Messages > 0 && user2Messages > 0) {
      const minMsgs = Math.min(user1Messages, user2Messages);
      const maxMsgs = Math.max(user1Messages, user2Messages);
      responseConsistencyRaw = minMsgs / maxMsgs;
    } else if (user1Messages > 0 || user2Messages > 0) {
      responseConsistencyRaw = 0.1;
    }

    // ─── Factor 6: ACTIVE_DAYS (IST, quality messages) ────────────
    const activeDayCount = byDay.size;
    const activeDaysRaw = Math.min(activeDayCount / 14, 1);

    // ─── Factor 7: VULNERABILITY_SIGNALS (per-day cap on long msgs)
    let countedLong = 0;
    byDay.forEach((dayMsgs) => {
      const dayLong = dayMsgs.filter(
        (m) => m.type === 'text' && (m.content?.text?.length || 0) > 200
      ).length;
      countedLong += Math.min(dayLong, COMFORT_LIMITS.MAX_LONG_MESSAGES_PER_DAY);
    });
    const photoMessages = qualityMessages.filter((m) => m.type === 'image').length;

    // Deep game play: count games with deep/vulnerability categories.
    // This list must stay in sync with the categories defined in src/scripts/gameContent.js.
    const deepGames = await Game.countDocuments({
      matchId,
      status: 'completed',
      'rounds.prompt.category': {
        $in: ['vulnerability', 'self-discovery', 'growth', 'connection', 'emotional'],
      },
    });

    const vulnerabilityScore =
      Math.min(countedLong / 10, 0.4) +
      Math.min(photoMessages / 3, 0.2) +
      Math.min(deepGames / 2, 0.4);
    const vulnerabilitySignalsRaw = Math.min(vulnerabilityScore, 1);

    // ─── Weighted Sum ─────────────────────────────────────────────
    const rawScore =
      messageVolumeRaw * COMFORT_WEIGHTS.MESSAGE_VOLUME +
      messageDepthRaw * COMFORT_WEIGHTS.MESSAGE_DEPTH +
      voiceEngagementRaw * COMFORT_WEIGHTS.VOICE_ENGAGEMENT +
      gamesCompletedRaw * COMFORT_WEIGHTS.GAMES_COMPLETED +
      responseConsistencyRaw * COMFORT_WEIGHTS.RESPONSE_CONSISTENCY +
      activeDaysRaw * COMFORT_WEIGHTS.ACTIVE_DAYS +
      vulnerabilitySignalsRaw * COMFORT_WEIGHTS.VULNERABILITY_SIGNALS;

    // Scale to 0–100
    const score = Math.round(rawScore * 100);

    const breakdown = {
      messageVolume: {
        value: Math.round(messageVolumeRaw * 100),
        weight: COMFORT_WEIGHTS.MESSAGE_VOLUME,
        detail: `${countedMessages} quality messages counted (target: 50)`,
      },
      messageDepth: {
        value: Math.round(messageDepthRaw * 100),
        weight: COMFORT_WEIGHTS.MESSAGE_DEPTH,
        detail: `Avg ${Math.round(avgLength)} chars/msg (target: 100)`,
      },
      voiceEngagement: {
        value: Math.round(voiceEngagementRaw * 100),
        weight: COMFORT_WEIGHTS.VOICE_ENGAGEMENT,
        detail: `${countedVoice} voice messages counted (target: 5)`,
      },
      gamesCompleted: {
        value: Math.round(gamesCompletedRaw * 100),
        weight: COMFORT_WEIGHTS.GAMES_COMPLETED,
        detail: `${completedGames} games completed (target: 3)`,
      },
      responseConsistency: {
        value: Math.round(responseConsistencyRaw * 100),
        weight: COMFORT_WEIGHTS.RESPONSE_CONSISTENCY,
        detail: `${user1Messages} vs ${user2Messages} quality messages`,
      },
      activeDays: {
        value: Math.round(activeDaysRaw * 100),
        weight: COMFORT_WEIGHTS.ACTIVE_DAYS,
        detail: `${activeDayCount} active days (IST, target: 14)`,
      },
      vulnerabilitySignals: {
        value: Math.round(vulnerabilitySignalsRaw * 100),
        weight: COMFORT_WEIGHTS.VULNERABILITY_SIGNALS,
        detail: `${countedLong} long msgs, ${photoMessages} photos, ${deepGames} deep games`,
      },
    };

    return ComfortService._saveAndReturn(match, score, breakdown, {
      activeDays: activeDayCount,
      qualityMessages: qualityMessages.length,
    });
  }

  // ─── Quick Recalculate (Lightweight) ──────────────────────────

  /**
   * Lightweight recalc triggered periodically (e.g., every 10th message).
   * Same logic as full calculate but doesn't throw — just logs errors.
   */
  static async recalculateSilently(matchId) {
    try {
      await ComfortService.calculateComfortScore(matchId);
    } catch (err) {
      logger.error(`Comfort score recalculation failed for match ${matchId}:`, err.message);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Saves score to match and returns the result object.
   */
  static async _saveAndReturn(match, score, breakdown, stats = null) {
    match.comfortScore = score;
    match.comfortScoreUpdatedAt = new Date();
    match.comfortStats = stats || { activeDays: 0, qualityMessages: 0 };
    await match.save();

    // Save periodic score snapshot (max one per hour)
    try {
      const lastSnapshot = await ScoreSnapshot.findOne({ matchId: match._id }).sort({ createdAt: -1 });
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (!lastSnapshot || lastSnapshot.createdAt < hourAgo) {
        await ScoreSnapshot.create({
          matchId: match._id,
          comfortScore: score,
          compatibilityScore: match.compatibilityScore || null,
          comfortBreakdown: breakdown,
          trigger: 'periodic',
        });
      }
    } catch (err) {
      logger.error(`Score snapshot save failed for match ${match._id}:`, err.message);
    }

    logger.debug(`Comfort score updated for match ${match._id}: ${score}/100`);

    return { score, breakdown, matchId: match._id, updatedAt: match.comfortScoreUpdatedAt };
  }

  /**
   * Returns an empty breakdown object for matches with no activity.
   */
  static _emptyBreakdown() {
    return {
      messageVolume: { value: 0, weight: COMFORT_WEIGHTS.MESSAGE_VOLUME, detail: '0 messages' },
      messageDepth: { value: 0, weight: COMFORT_WEIGHTS.MESSAGE_DEPTH, detail: 'No messages' },
      voiceEngagement: { value: 0, weight: COMFORT_WEIGHTS.VOICE_ENGAGEMENT, detail: '0 voice messages' },
      gamesCompleted: { value: 0, weight: COMFORT_WEIGHTS.GAMES_COMPLETED, detail: '0 games completed' },
      responseConsistency: { value: 0, weight: COMFORT_WEIGHTS.RESPONSE_CONSISTENCY, detail: 'No messages' },
      activeDays: { value: 0, weight: COMFORT_WEIGHTS.ACTIVE_DAYS, detail: '0 active days' },
      vulnerabilitySignals: { value: 0, weight: COMFORT_WEIGHTS.VULNERABILITY_SIGNALS, detail: 'No signals' },
    };
  }
}

module.exports = ComfortService;
