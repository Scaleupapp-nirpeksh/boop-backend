const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Game = require('../models/Game');
const ScoreSnapshot = require('../models/ScoreSnapshot');
const { COMFORT_WEIGHTS } = require('../utils/constants');
const logger = require('../utils/logger');

// MARK: - Comfort Score Service

/**
 * Calculates the comfort score between two matched users.
 *
 * Uses weighted factors from COMFORT_WEIGHTS:
 *  - MESSAGE_VOLUME (0.15): total messages / 50 (capped at 1)
 *  - MESSAGE_DEPTH (0.20): avg message length / 100 chars (capped at 1)
 *  - VOICE_ENGAGEMENT (0.15): voice messages / 5 (capped at 1)
 *  - GAMES_COMPLETED (0.15): completed games / 3 (capped at 1)
 *  - RESPONSE_CONSISTENCY (0.10): ratio of min/max message counts between users
 *  - ACTIVE_DAYS (0.15): distinct days with messages / 14 (capped at 1)
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
      return ComfortService._saveAndReturn(match, 0, ComfortService._emptyBreakdown());
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

    // ─── Factor 1: MESSAGE_VOLUME ─────────────────────────────────
    const totalMessages = messages.length;
    const messageVolumeRaw = Math.min(totalMessages / 50, 1);

    // ─── Factor 2: MESSAGE_DEPTH ──────────────────────────────────
    const textMessages = messages.filter(
      (m) => m.type === 'text' && m.content?.text
    );
    const avgLength =
      textMessages.length > 0
        ? textMessages.reduce((sum, m) => sum + (m.content.text?.length || 0), 0) /
          textMessages.length
        : 0;
    const messageDepthRaw = Math.min(avgLength / 100, 1);

    // ─── Factor 3: VOICE_ENGAGEMENT ───────────────────────────────
    const voiceMessages = messages.filter((m) => m.type === 'voice').length;
    const voiceEngagementRaw = Math.min(voiceMessages / 5, 1);

    // ─── Factor 4: GAMES_COMPLETED ────────────────────────────────
    const gamesCompletedRaw = Math.min(completedGames / 3, 1);

    // ─── Factor 5: RESPONSE_CONSISTENCY ───────────────────────────
    const user1Messages = messages.filter(
      (m) => m.senderId.toString() === user1Id
    ).length;
    const user2Messages = messages.filter(
      (m) => m.senderId.toString() === user2Id
    ).length;

    let responseConsistencyRaw = 0;
    if (user1Messages > 0 && user2Messages > 0) {
      const minMsgs = Math.min(user1Messages, user2Messages);
      const maxMsgs = Math.max(user1Messages, user2Messages);
      responseConsistencyRaw = minMsgs / maxMsgs;
    } else if (user1Messages > 0 || user2Messages > 0) {
      // Only one person messaging — low consistency
      responseConsistencyRaw = 0.1;
    }

    // ─── Factor 6: ACTIVE_DAYS ────────────────────────────────────
    const activeDays = new Set();
    messages.forEach((m) => {
      if (m.createdAt) {
        // Use YYYY-MM-DD as the key
        const dateStr = new Date(m.createdAt).toISOString().split('T')[0];
        activeDays.add(dateStr);
      }
    });
    const activeDaysRaw = Math.min(activeDays.size / 14, 1);

    // ─── Factor 7: VULNERABILITY_SIGNALS ──────────────────────────
    // Signals: deep game play, long messages (>200 chars), photo shares
    const longMessages = textMessages.filter(
      (m) => (m.content.text?.length || 0) > 200
    ).length;
    const photoMessages = messages.filter((m) => m.type === 'image').length;

    // Deep game play: count games with deep/vulnerability categories
    const deepGames = await Game.countDocuments({
      matchId,
      status: 'completed',
      'rounds.prompt.category': {
        $in: ['vulnerability', 'self-discovery', 'growth', 'connection'],
      },
    });

    const vulnerabilityScore =
      Math.min(longMessages / 10, 0.4) +
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
        detail: `${totalMessages} messages (target: 50)`,
      },
      messageDepth: {
        value: Math.round(messageDepthRaw * 100),
        weight: COMFORT_WEIGHTS.MESSAGE_DEPTH,
        detail: `Avg ${Math.round(avgLength)} chars/msg (target: 100)`,
      },
      voiceEngagement: {
        value: Math.round(voiceEngagementRaw * 100),
        weight: COMFORT_WEIGHTS.VOICE_ENGAGEMENT,
        detail: `${voiceMessages} voice messages (target: 5)`,
      },
      gamesCompleted: {
        value: Math.round(gamesCompletedRaw * 100),
        weight: COMFORT_WEIGHTS.GAMES_COMPLETED,
        detail: `${completedGames} games completed (target: 3)`,
      },
      responseConsistency: {
        value: Math.round(responseConsistencyRaw * 100),
        weight: COMFORT_WEIGHTS.RESPONSE_CONSISTENCY,
        detail: `${user1Messages} vs ${user2Messages} messages`,
      },
      activeDays: {
        value: Math.round(activeDaysRaw * 100),
        weight: COMFORT_WEIGHTS.ACTIVE_DAYS,
        detail: `${activeDays.size} active days (target: 14)`,
      },
      vulnerabilitySignals: {
        value: Math.round(vulnerabilitySignalsRaw * 100),
        weight: COMFORT_WEIGHTS.VULNERABILITY_SIGNALS,
        detail: `${longMessages} long msgs, ${photoMessages} photos, ${deepGames} deep games`,
      },
    };

    return ComfortService._saveAndReturn(match, score, breakdown);
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
  static async _saveAndReturn(match, score, breakdown) {
    match.comfortScore = score;
    match.comfortScoreUpdatedAt = new Date();
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
