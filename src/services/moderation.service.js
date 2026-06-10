const OpenAI = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Categories that auto-hide content immediately (review still happens)
const SEVERE_CATEGORIES = [
  'sexual/minors',
  'self-harm/intent',
  'self-harm/instructions',
  'violence/graphic',
];

// Categories that block a photo upload outright
const PHOTO_BLOCK_CATEGORIES = ['sexual', 'sexual/minors', 'violence', 'violence/graphic'];

// MARK: - Moderation Service

/**
 * Content moderation via OpenAI omni-moderation (free endpoint).
 * Text moderation FAILS OPEN (chat must not break if the API is down);
 * flagged content lands in the ModerationFlag review queue, and severe
 * categories are auto-hidden.
 */
class ModerationService {
  /** Moderate a text snippet. */
  static async moderateText(text) {
    try {
      const response = await openai.moderations.create({
        model: 'omni-moderation-latest',
        input: text,
      });
      return ModerationService._toResult(response);
    } catch (err) {
      logger.error('Moderation (text) failed — failing open:', err.message);
      return { flagged: false, severe: false, categories: [], failedOpen: true };
    }
  }

  /** Moderate an image buffer (profile photos, chat images). */
  static async moderateImage(buffer, mimeType = 'image/webp') {
    try {
      const response = await openai.moderations.create({
        model: 'omni-moderation-latest',
        input: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` },
          },
        ],
      });
      return ModerationService._toResult(response);
    } catch (err) {
      logger.error('Moderation (image) failed — failing open:', err.message);
      return { flagged: false, severe: false, categories: [], failedOpen: true };
    }
  }

  /** True when a photo moderation result should block the upload. */
  static shouldBlockPhoto(result) {
    if (!result.flagged) return false;
    return result.categories.some((c) => PHOTO_BLOCK_CATEGORIES.includes(c));
  }

  /**
   * Review a just-sent chat message in the background (fire-and-forget
   * from message.service). Flags to the review queue; auto-hides severe.
   */
  static async reviewMessage(message) {
    if (!message?.content?.text) return;

    const result = await ModerationService.moderateText(message.content.text);
    if (!result.flagged) return;

    const ModerationFlag = require('../models/ModerationFlag');
    await ModerationFlag.create({
      contentType: 'message',
      userId: message.senderId?._id || message.senderId,
      messageId: message._id,
      conversationId: message.conversationId,
      categories: result.categories,
      severe: result.severe,
      autoHidden: result.severe,
      excerpt: message.content.text.slice(0, 300),
    });

    if (result.severe) {
      const Message = require('../models/Message');
      await Message.findByIdAndUpdate(message._id, { isDeleted: true });
      logger.warn(`Moderation: auto-hid severe message ${message._id}`);
    }
  }

  /** Normalize an OpenAI moderation response. */
  static _toResult(response) {
    const r = response?.results?.[0];
    if (!r) return { flagged: false, severe: false, categories: [] };

    const categories = Object.entries(r.categories || {})
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    return {
      flagged: Boolean(r.flagged),
      severe: categories.some((c) => SEVERE_CATEGORIES.includes(c)),
      categories,
    };
  }
}

module.exports = ModerationService;
