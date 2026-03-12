const cron = require('node-cron');
const logger = require('../utils/logger');

/**
 * Initialize all cron jobs.
 * Called once during server startup.
 */
const initializeCronJobs = () => {
  const QuestionReminderService = require('../services/questionReminder.service');

  // ─── Midnight IST (18:30 UTC) — Invalidate question caches ──────────
  // New questions unlock at midnight IST based on dayAvailable field.
  // We invalidate caches so the next request picks up newly available questions.
  cron.schedule(
    '30 18 * * *',
    async () => {
      logger.info('Cron: midnight IST — invalidating question caches');
      await QuestionReminderService.invalidateQuestionCaches();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // ─── 9:00 AM IST — Morning digest ──────────────────────────────
  cron.schedule(
    '0 9 * * *',
    async () => {
      logger.info('Cron: 9 AM IST — sending morning digest');
      await QuestionReminderService.sendMorningDigest();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // ─── 11:00 AM IST (05:30 UTC) — Question reminder notifications ────
  // Send push notifications to users who have unanswered unlocked questions.
  cron.schedule(
    '0 11 * * *',
    async () => {
      logger.info('Cron: 11 AM IST — sending question reminders');
      await QuestionReminderService.sendDailyReminders();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // ─── 6:00 PM IST — Evening connection nudges ────────────────────
  cron.schedule(
    '0 18 * * *',
    async () => {
      logger.info('Cron: 6 PM IST — sending connection nudges');
      await QuestionReminderService.sendConnectionNudges();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // ─── Midnight IST — Reset stale streaks ────────────────────────
  // If a match's lastActiveDate is more than 1 day ago, reset current streak to 0.
  cron.schedule(
    '30 18 * * *',
    async () => {
      logger.info('Cron: midnight IST — resetting stale streaks');
      try {
        const Match = require('../models/Match');
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        const result = await Match.updateMany(
          {
            isActive: true,
            'streak.current': { $gt: 0 },
            'streak.lastActiveDate': { $lt: twoDaysAgo },
          },
          { $set: { 'streak.current': 0 } }
        );

        logger.info(`Cron: reset ${result.modifiedCount} stale streaks`);
      } catch (err) {
        logger.error('Cron: streak reset failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  logger.info('Cron jobs initialized: midnight (cache + streaks), 9 AM digest, 11 AM questions, 6 PM nudges');
};

module.exports = { initializeCronJobs };
