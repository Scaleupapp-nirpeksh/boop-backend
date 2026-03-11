const logger = require('../utils/logger');

/**
 * Bull job processor: deliver a push notification via FCM.
 * Uses _deliverPush directly to avoid re-enqueuing loop.
 * Job data: { notificationId?, userId, title, body, data }
 */
module.exports = async (job) => {
  const { notificationId, userId, title, body, data } = job.data;

  try {
    const NotificationService = require('../services/notification.service');
    const Notification = require('../models/Notification');

    // Look up the persisted notification if we have an ID
    let notification = null;
    if (notificationId) {
      notification = await Notification.findById(notificationId);
    }

    // Deliver directly via FCM (skip sendPush to avoid re-queue)
    await NotificationService._deliverPush(userId, notification, { title, body, data });
    logger.debug(`Notification delivered to user ${userId}: "${title}"`);
  } catch (err) {
    logger.error(`Notification job failed for user ${userId}:`, err.message);
    throw err; // Let Bull handle retries
  }
};
