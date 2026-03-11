const User = require('../models/User');
const { getMessaging } = require('../config/firebase');
const logger = require('../utils/logger');

// MARK: - Notification Service

/**
 * Handles push notifications via Firebase Cloud Messaging.
 * Respects user notification preferences (mute, quiet hours).
 * All methods are fire-and-forget — errors are logged but never thrown.
 */
class NotificationService {
  // ─── Core Push Method ─────────────────────────────────────────

  /**
   * Sends a push notification to a user.
   * Respects notification preferences (allMuted, quiet hours).
   *
   * @param {string} userId - Target user ID
   * @param {Object} notification - { title, body, data }
   */
  static async sendPush(userId, { title, body, data = {} }) {
    try {
      const Notification = require('../models/Notification');

      // Save notification to DB
      const notification = await Notification.create({
        userId,
        type: data.type || 'system',
        title,
        body,
        data,
        read: false,
        pushSent: false,
      });

      // Try to send via queue, fallback to direct
      try {
        const { getNotificationQueue } = require('../config/queue');
        const queue = getNotificationQueue();
        if (queue) {
          await queue.add('sendPush', {
            notificationId: notification._id.toString(),
            userId: userId.toString(),
            title,
            body,
            data
          });
          return;
        }
      } catch (queueErr) {
        // Queue unavailable, send directly
      }

      // Direct send fallback
      await NotificationService._deliverPush(userId, notification, { title, body, data });
    } catch (err) {
      logger.error('NotificationService.sendPush failed:', err.message);
    }
  }

  /**
   * Delivers a push notification via FCM. Called directly or from the Bull queue processor.
   * @param {string} userId - Target user ID
   * @param {Object|null} notification - Notification document (for updating pushSent/pushError)
   * @param {Object} payload - { title, body, data }
   */
  static async _deliverPush(userId, notification, { title, body, data }) {
    const user = await User.findById(userId).select('fcmToken notificationPreferences').lean();
    if (!user?.fcmToken) return;

    // Check preferences
    if (user.notificationPreferences?.allMuted) return;

    // Check per-type muting
    if (user.notificationPreferences?.mutedTypes?.includes(data.type)) return;

    if (NotificationService._isQuietHours(user.notificationPreferences)) return;

    const messaging = getMessaging();
    if (!messaging) return;

    try {
      await messaging.send({
        token: user.fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        apns: {
          payload: {
            aps: { sound: 'default', badge: 1, 'mutable-content': 1, 'thread-id': data.type || 'boop' },
          },
        },
      });

      if (notification) {
        await require('../models/Notification').findByIdAndUpdate(notification._id, { pushSent: true });
      }
      logger.debug(`Push notification sent to user ${userId}: "${title}"`);
    } catch (fcmErr) {
      if (notification) {
        await require('../models/Notification').findByIdAndUpdate(notification._id, { pushError: fcmErr.message });
      }
      if (fcmErr.code === 'messaging/registration-token-not-registered' || fcmErr.code === 'messaging/invalid-registration-token') {
        logger.warn(`Invalid FCM token for user ${userId} — clearing token`);
        await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
      } else {
        logger.error(`Push notification failed for user ${userId}:`, fcmErr.message);
      }
    }
  }

  // ─── Typed Notification Helpers ───────────────────────────────

  /**
   * Notify user of a new mutual match.
   */
  static async notifyNewMatch(userId, otherUserName, matchId, compatibilityScore) {
    await NotificationService.sendPush(userId, {
      title: "It's a Match! 💕",
      body: `You and ${otherUserName} are ${compatibilityScore}% compatible!`,
      data: {
        type: 'new_match',
        matchId: matchId.toString(),
        compatibilityScore: String(compatibilityScore),
      },
    });
  }

  /**
   * Notify user of a new message (when offline).
   */
  static async notifyNewMessage(userId, senderName, messagePreview, conversationId) {
    const truncated =
      messagePreview.length > 100
        ? messagePreview.substring(0, 97) + '...'
        : messagePreview;

    await NotificationService.sendPush(userId, {
      title: senderName,
      body: truncated,
      data: {
        type: 'new_message',
        conversationId: conversationId.toString(),
      },
    });
  }

  /**
   * Notify user that someone requested photo reveal.
   */
  static async notifyRevealRequest(userId, otherUserName, matchId) {
    await NotificationService.sendPush(userId, {
      title: 'Photo Reveal Request 📸',
      body: `${otherUserName} wants to reveal photos! Are you ready?`,
      data: {
        type: 'reveal_request',
        matchId: matchId.toString(),
      },
    });
  }

  /**
   * Notify user that photos have been mutually revealed.
   */
  static async notifyPhotosRevealed(userId, matchId) {
    await NotificationService.sendPush(userId, {
      title: 'Photos Revealed! 🎉',
      body: 'You can now see each other. Take a look!',
      data: {
        type: 'photos_revealed',
        matchId: matchId.toString(),
      },
    });
  }

  /**
   * Notify user that their match stage has advanced.
   */
  static async notifyStageAdvanced(userId, matchId, newStage) {
    const stageLabels = {
      connecting: 'Started connecting',
      reveal_ready: 'Ready to reveal photos',
      revealed: 'Photos revealed',
      dating: 'Taking it to the next level',
    };

    await NotificationService.sendPush(userId, {
      title: 'Connection Update ✨',
      body: stageLabels[newStage] || `Stage: ${newStage}`,
      data: {
        type: 'stage_advanced',
        matchId: matchId.toString(),
        stage: newStage,
      },
    });
  }

  /**
   * Notify user of a game invitation.
   */
  static async notifyGameInvite(userId, senderName, gameType, conversationId) {
    const gameNames = {
      would_you_rather: 'Would You Rather',
      two_truths_a_lie: 'Two Truths & A Lie',
      never_have_i_ever: 'Never Have I Ever',
      intimacy_spectrum: 'Intimacy Spectrum',
      what_would_you_do: 'What Would You Do',
      dream_board: 'Dream Board',
      blind_reveal: 'Blind Reveal',
    };

    await NotificationService.sendPush(userId, {
      title: `Game Invite from ${senderName} 🎮`,
      body: `Let's play ${gameNames[gameType] || gameType}!`,
      data: {
        type: 'game_invite',
        conversationId: conversationId.toString(),
        gameType,
      },
    });
  }

  // ─── Quiet Hours Check ────────────────────────────────────────

  /**
   * Checks if the current time falls within the user's quiet hours.
   */
  static _isQuietHours(preferences) {
    if (!preferences?.quietHoursStart || !preferences?.quietHoursEnd) {
      return false;
    }

    try {
      const timezone = preferences.timezone || 'Asia/Kolkata';
      const now = new Date();

      // Get current hour and minute in user's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const currentHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
      const currentMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
      const currentTime = currentHour * 60 + currentMinute;

      // Parse quiet hours
      const [startH, startM] = preferences.quietHoursStart.split(':').map(Number);
      const [endH, endM] = preferences.quietHoursEnd.split(':').map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;

      // Handle overnight ranges (e.g., 22:00 - 07:00)
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime < endTime;
      }

      return currentTime >= startTime && currentTime < endTime;
    } catch (error) {
      logger.error('Error checking quiet hours:', error.message);
      return false;
    }
  }
}

module.exports = NotificationService;
