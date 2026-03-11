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

  logger.info('Cron jobs initialized: midnight cache invalidation, 11 AM question reminders');
};

module.exports = { initializeCronJobs };
