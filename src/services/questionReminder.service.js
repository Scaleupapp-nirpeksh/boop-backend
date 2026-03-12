const User = require('../models/User');
const Answer = require('../models/Answer');
const Question = require('../models/Question');
const NotificationService = require('./notification.service');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class QuestionReminderService {
  /**
   * Send daily question reminders to users with unanswered unlocked questions.
   * Called by cron at 11:00 AM IST daily.
   */
  static async sendDailyReminders() {
    logger.info('QuestionReminder: starting daily reminder check');

    try {
      // Find all active, non-banned users with FCM tokens
      const users = await User.find({
        isActive: true,
        isBanned: false,
        fcmToken: { $exists: true, $ne: null },
      })
        .select('_id firstName questionsAnswered createdAt fcmToken notificationPreferences')
        .lean();

      let sentCount = 0;
      let skippedCount = 0;

      for (const user of users) {
        try {
          // Check if user has muted question reminders
          if (
            user.notificationPreferences?.allMuted ||
            user.notificationPreferences?.mutedTypes?.includes('questions_reminder')
          ) {
            skippedCount++;
            continue;
          }

          // Calculate unanswered questions
          const daysSinceRegistration = this._calculateDaysSinceRegistrationIST(user.createdAt);

          const answeredDocs = await Answer.find({ userId: user._id }, { questionNumber: 1 });
          const answeredNumbers = new Set(answeredDocs.map((a) => a.questionNumber));

          const unansweredCount = await Question.countDocuments({
            dayAvailable: { $lte: daysSinceRegistration },
            questionNumber: { $nin: Array.from(answeredNumbers) },
          });

          if (unansweredCount === 0) {
            skippedCount++;
            continue;
          }

          // Determine message based on answer progress
          const totalAnswered = user.questionsAnswered || 0;
          let title, body;

          if (totalAnswered < 6) {
            title = 'Start your personality profile';
            body = `You have ${unansweredCount} questions waiting. Answer at least 6 to unlock your homepage and start connecting!`;
          } else if (totalAnswered < 15) {
            title = 'Complete your profile for better matches';
            body = `${unansweredCount} questions are waiting for you. Answer ${15 - totalAnswered} more to unlock your full personality analysis!`;
          } else {
            title = 'New questions unlocked';
            body = `You have ${unansweredCount} new question${unansweredCount === 1 ? '' : 's'} waiting. Answer them for better matches and updated personality insights!`;
          }

          // Send push notification
          await NotificationService.sendPush(user._id, {
            type: 'questions_reminder',
            title,
            body,
            data: { screen: 'questions' },
          });

          sentCount++;
        } catch (err) {
          logger.warn(`QuestionReminder: failed for user=${user._id}:`, err.message);
        }
      }

      logger.info(`QuestionReminder: sent ${sentCount}, skipped ${skippedCount} of ${users.length} users`);
    } catch (err) {
      logger.error('QuestionReminder: daily check failed:', err.message);
    }
  }

  /**
   * Invalidate question caches at midnight so new questions become available.
   * Called by cron at midnight IST daily.
   */
  static async invalidateQuestionCaches() {
    logger.info('QuestionReminder: invalidating question caches at midnight IST');

    try {
      cache.invalidatePattern('questions:available:*');
      logger.info('QuestionReminder: question caches invalidated');
    } catch (err) {
      logger.error('QuestionReminder: cache invalidation failed:', err.message);
    }
  }

  // ─── Daily Connection Nudges (6 PM IST) ──────────────────────

  /**
   * Send evening nudges: unread messages, streak warnings, re-engagement.
   * Called by cron at 6:00 PM IST daily.
   */
  static async sendConnectionNudges() {
    logger.info('DailyNudge: starting evening connection nudges');

    try {
      const Match = require('../models/Match');
      const Conversation = require('../models/Conversation');

      const users = await User.find({
        isActive: true,
        isBanned: false,
        fcmToken: { $exists: true, $ne: null },
      })
        .select('_id firstName lastActive notificationPreferences')
        .lean();

      let sentCount = 0;

      for (const user of users) {
        try {
          if (
            user.notificationPreferences?.allMuted ||
            user.notificationPreferences?.mutedTypes?.includes('connection_nudge')
          ) continue;

          // Check for unread messages
          const unreadConversations = await Conversation.countDocuments({
            participants: user._id,
            isActive: true,
            [`unreadCount.${user._id}`]: { $gt: 0 },
          });

          if (unreadConversations > 0) {
            await NotificationService.sendPush(user._id, {
              type: 'connection_nudge',
              title: 'Messages waiting for you',
              body: `You have unread messages in ${unreadConversations} conversation${unreadConversations > 1 ? 's' : ''}. Don't leave them hanging!`,
              data: { screen: 'chat' },
            });
            sentCount++;
            continue;
          }

          // Check for streak warnings (active yesterday but not today)
          const streakMatches = await Match.find({
            users: user._id,
            isActive: true,
            'streak.current': { $gt: 2 },
          })
            .select('streak users')
            .populate('users', 'firstName')
            .lean();

          const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
          const nowIST = new Date(Date.now() + IST_OFFSET_MS);
          const todayIST = nowIST.toISOString().split('T')[0];

          for (const match of streakMatches) {
            if (!match.streak?.lastActiveDate) continue;
            const lastIST = new Date(new Date(match.streak.lastActiveDate).getTime() + IST_OFFSET_MS)
              .toISOString().split('T')[0];

            if (lastIST !== todayIST) {
              const otherUser = match.users.find(u => u._id.toString() !== user._id.toString());
              const otherName = otherUser?.firstName || 'your match';

              if (user.notificationPreferences?.mutedTypes?.includes('streak_warning')) continue;

              await NotificationService.sendPush(user._id, {
                type: 'streak_warning',
                title: `Don't break your 🔥${match.streak.current} streak!`,
                body: `Send ${otherName} a message before midnight to keep it going`,
                data: { matchId: match._id.toString(), screen: 'chat' },
              });
              sentCount++;
              break; // One streak warning per user per day
            }
          }

          // Re-engagement for inactive users (2+ days since last activity)
          if (user.lastActive) {
            const daysSinceActive = (Date.now() - new Date(user.lastActive).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceActive >= 2) {
              const activeMatches = await Match.countDocuments({
                users: user._id,
                isActive: true,
                stage: { $ne: 'archived' },
              });

              if (activeMatches > 0) {
                await NotificationService.sendPush(user._id, {
                  type: 'connection_nudge',
                  title: 'Your connections miss you!',
                  body: `${activeMatches} ${activeMatches === 1 ? 'person is' : 'people are'} waiting to hear from you`,
                  data: { screen: 'home' },
                });
                sentCount++;
              }
            }
          }
        } catch (err) {
          logger.warn(`DailyNudge: failed for user=${user._id}:`, err.message);
        }
      }

      logger.info(`DailyNudge: sent ${sentCount} evening nudges to ${users.length} users`);
    } catch (err) {
      logger.error('DailyNudge: evening nudges failed:', err.message);
    }
  }

  // ─── Morning Digest (9 AM IST) ──────────────────────────────

  /**
   * Send morning digest: new candidates available, quick stats.
   * Called by cron at 9:00 AM IST daily.
   */
  static async sendMorningDigest() {
    logger.info('DailyNudge: starting morning digest');

    try {
      const users = await User.find({
        isActive: true,
        isBanned: false,
        fcmToken: { $exists: true, $ne: null },
        profileStage: 'ready',
      })
        .select('_id notificationPreferences')
        .lean();

      let sentCount = 0;

      for (const user of users) {
        try {
          if (
            user.notificationPreferences?.allMuted ||
            user.notificationPreferences?.mutedTypes?.includes('daily_digest')
          ) continue;

          await NotificationService.sendPush(user._id, {
            type: 'daily_digest',
            title: 'Good morning! ☀️',
            body: 'New daily connections are waiting for you. Open Boop to discover today\'s matches!',
            data: { screen: 'discover' },
          });
          sentCount++;
        } catch (err) {
          logger.warn(`DailyNudge: morning digest failed for user=${user._id}:`, err.message);
        }
      }

      logger.info(`DailyNudge: sent ${sentCount} morning digests`);
    } catch (err) {
      logger.error('DailyNudge: morning digest failed:', err.message);
    }
  }

  /**
   * Calculate days since registration using IST timezone (Asia/Kolkata, UTC+5:30).
   * @private
   */
  static _calculateDaysSinceRegistrationIST(createdAt) {
    // Use IST (UTC+5:30) for consistent midnight calculation
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

    const nowUTC = Date.now();
    const createdUTC = new Date(createdAt).getTime();

    // Shift both to IST
    const nowIST = new Date(nowUTC + IST_OFFSET_MS);
    const createdIST = new Date(createdUTC + IST_OFFSET_MS);

    // Compare dates only (floor to midnight IST)
    const nowMidnight = new Date(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate());
    const createdMidnight = new Date(createdIST.getUTCFullYear(), createdIST.getUTCMonth(), createdIST.getUTCDate());

    const diffMs = nowMidnight - createdMidnight;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays + 1; // Day 1 = registration day
  }
}

module.exports = QuestionReminderService;
