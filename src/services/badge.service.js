const User = require('../models/User');
const Match = require('../models/Match');
const Answer = require('../models/Answer');
const Game = require('../models/Game');
const NotificationService = require('./notification.service');
const logger = require('../utils/logger');

// ─── Badge Catalog ──────────────────────────────────────────────

const BADGE_CATALOG = {
  voice_verified: {
    key: 'voice_verified',
    title: 'Voice Verified',
    emoji: '🎙️',
    description: 'Recorded a voice intro',
    category: 'profile',
  },
  question_pioneer: {
    key: 'question_pioneer',
    title: 'Question Pioneer',
    emoji: '🌱',
    description: 'Answered 15+ questions',
    category: 'questions',
  },
  question_master: {
    key: 'question_master',
    title: 'Question Master',
    emoji: '🧠',
    description: 'Answered 40+ questions',
    category: 'questions',
  },
  game_enthusiast: {
    key: 'game_enthusiast',
    title: 'Game Enthusiast',
    emoji: '🎮',
    description: 'Completed 5+ games',
    category: 'games',
  },
  game_master: {
    key: 'game_master',
    title: 'Game Master',
    emoji: '🏆',
    description: 'Completed 20+ games',
    category: 'games',
  },
  streak_keeper: {
    key: 'streak_keeper',
    title: 'Streak Keeper',
    emoji: '🔥',
    description: 'Maintained a 7-day streak',
    category: 'engagement',
  },
  streak_legend: {
    key: 'streak_legend',
    title: 'Streak Legend',
    emoji: '⚡',
    description: 'Maintained a 30-day streak',
    category: 'engagement',
  },
  early_adopter: {
    key: 'early_adopter',
    title: 'Early Adopter',
    emoji: '🚀',
    description: 'Joined in the first month',
    category: 'special',
  },
  deep_connector: {
    key: 'deep_connector',
    title: 'Deep Connector',
    emoji: '💞',
    description: 'Reached dating stage with 3+ matches',
    category: 'connections',
  },
  personality_unlocked: {
    key: 'personality_unlocked',
    title: 'Personality Unlocked',
    emoji: '✨',
    description: 'Completed full personality analysis',
    category: 'profile',
  },
  first_boop: {
    key: 'first_boop',
    title: 'First Boop',
    emoji: '💕',
    description: 'Sent your first boop',
    category: 'engagement',
  },
  photo_revealed: {
    key: 'photo_revealed',
    title: 'Face to Face',
    emoji: '👀',
    description: 'Had photos revealed with a match',
    category: 'connections',
  },
};

class BadgeService {
  /**
   * Returns the full badge catalog with earned status for a user.
   */
  static async getBadgeCatalog(userId) {
    const user = await User.findById(userId).select('badges').lean();
    const earnedKeys = new Set((user?.badges || []).map((b) => b.key));

    return Object.values(BADGE_CATALOG).map((badge) => ({
      ...badge,
      earned: earnedKeys.has(badge.key),
      earnedAt: user?.badges?.find((b) => b.key === badge.key)?.earnedAt || null,
    }));
  }

  /**
   * Check all badge conditions and award any newly earned badges.
   * Call this after answer submission, game completion, profile updates, etc.
   */
  static async checkAndAwardBadges(userId) {
    const user = await User.findById(userId)
      .select('badges questionsAnswered voiceIntro createdAt')
      .lean();

    if (!user) return [];

    const earnedKeys = new Set((user.badges || []).map((b) => b.key));
    const newBadges = [];

    // Voice Verified
    if (!earnedKeys.has('voice_verified') && user.voiceIntro?.audioUrl) {
      newBadges.push('voice_verified');
    }

    // Question Pioneer (15+)
    if (!earnedKeys.has('question_pioneer') && (user.questionsAnswered || 0) >= 15) {
      newBadges.push('question_pioneer');
    }

    // Question Master (40+)
    if (!earnedKeys.has('question_master') && (user.questionsAnswered || 0) >= 40) {
      newBadges.push('question_master');
    }

    // Game Enthusiast (5+) & Game Master (20+)
    if (!earnedKeys.has('game_enthusiast') || !earnedKeys.has('game_master')) {
      const completedGames = await Game.countDocuments({
        'participants.userId': userId,
        status: 'completed',
      });

      if (!earnedKeys.has('game_enthusiast') && completedGames >= 5) {
        newBadges.push('game_enthusiast');
      }
      if (!earnedKeys.has('game_master') && completedGames >= 20) {
        newBadges.push('game_master');
      }
    }

    // Streak Keeper (7-day) & Streak Legend (30-day)
    if (!earnedKeys.has('streak_keeper') || !earnedKeys.has('streak_legend')) {
      const longestStreak = await Match.findOne({
        users: userId,
        isActive: true,
      })
        .sort({ 'streak.longest': -1 })
        .select('streak.longest')
        .lean();

      const best = longestStreak?.streak?.longest || 0;

      if (!earnedKeys.has('streak_keeper') && best >= 7) {
        newBadges.push('streak_keeper');
      }
      if (!earnedKeys.has('streak_legend') && best >= 30) {
        newBadges.push('streak_legend');
      }
    }

    // Early Adopter (registered within first month — before 2026-02-01 as a cutoff)
    if (!earnedKeys.has('early_adopter')) {
      const cutoff = new Date('2026-04-01T00:00:00Z');
      if (user.createdAt && new Date(user.createdAt) < cutoff) {
        newBadges.push('early_adopter');
      }
    }

    // Deep Connector (3+ matches at dating stage)
    if (!earnedKeys.has('deep_connector')) {
      const datingMatches = await Match.countDocuments({
        users: userId,
        stage: 'dating',
      });
      if (datingMatches >= 3) {
        newBadges.push('deep_connector');
      }
    }

    // Personality Unlocked (has personality analysis — check questionsAnswered >= 15 as proxy)
    if (!earnedKeys.has('personality_unlocked') && (user.questionsAnswered || 0) >= 15) {
      // Check if analysis was actually generated
      try {
        const cache = require('../utils/cache');
        const cached = cache.get(`personality:${userId}`);
        if (cached) {
          newBadges.push('personality_unlocked');
        }
      } catch {
        // Skip if cache not available
      }
    }

    // First Boop
    if (!earnedKeys.has('first_boop')) {
      const boopMatch = await Match.findOne({
        users: userId,
        'lastBoop.senderId': userId,
      }).lean();
      if (boopMatch) {
        newBadges.push('first_boop');
      }
    }

    // Photo Revealed
    if (!earnedKeys.has('photo_revealed')) {
      const revealedMatch = await Match.findOne({
        users: userId,
        stage: { $in: ['revealed', 'dating'] },
      }).lean();
      if (revealedMatch) {
        newBadges.push('photo_revealed');
      }
    }

    // Award new badges
    if (newBadges.length > 0) {
      const badgeEntries = newBadges.map((key) => ({
        key,
        earnedAt: new Date(),
      }));

      await User.findByIdAndUpdate(userId, {
        $push: { badges: { $each: badgeEntries } },
      });

      // Send push notification for each new badge
      for (const key of newBadges) {
        const badge = BADGE_CATALOG[key];
        if (badge) {
          try {
            NotificationService.sendPush(userId, {
              type: 'badge_earned',
              title: `${badge.emoji} Badge earned!`,
              body: `You unlocked "${badge.title}" — ${badge.description}`,
              data: { badgeKey: key },
            });
          } catch {
            // Non-critical
          }
        }
      }

      logger.info(`Badges: awarded ${newBadges.join(', ')} to user ${userId}`);
    }

    return newBadges;
  }
}

module.exports = { BadgeService, BADGE_CATALOG };
