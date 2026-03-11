const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Match = require('../models/Match');
const { CONNECTION_STAGES, REACTION_EMOJIS } = require('../utils/constants');
const UploadService = require('./upload.service');
const logger = require('../utils/logger');

// MARK: - Message Service

/**
 * Handles all messaging logic: conversations, messages, reactions, read receipts.
 */
class MessageService {
  // ─── Create Conversation ──────────────────────────────────────

  /**
   * Creates a conversation for a mutual match.
   * Called automatically when a mutual match is detected.
   */
  static async createConversation(matchId, user1Id, user2Id) {
    // Check if conversation already exists for this match
    const existing = await Conversation.findOne({ matchId });
    if (existing) {
      logger.debug(`Conversation already exists for match ${matchId}`);
      return existing;
    }

    const conversation = await Conversation.create({
      participants: [user1Id, user2Id],
      matchId,
      unreadCount: new Map([
        [user1Id.toString(), 0],
        [user2Id.toString(), 0],
      ]),
    });

    logger.info(
      `Conversation created for match ${matchId} between ${user1Id} and ${user2Id}`
    );

    return conversation;
  }

  // ─── Get Conversations ────────────────────────────────────────

  /**
   * Lists conversations for a user, sorted by most recent message.
   * Includes other participant info and unread counts.
   */
  static async getConversations(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find({
        participants: userId,
        isActive: true,
      })
        .populate(
          'participants',
          'firstName photos.profilePhoto voiceIntro.duration isOnline lastSeen'
        )
        .populate('matchId', 'stage compatibilityScore matchTier comfortScore')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments({
        participants: userId,
        isActive: true,
      }),
    ]);

    const formatted = await Promise.all(conversations.map(async (conv) => {
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== userId.toString()
      );

      // Photo visibility based on match stage
      const photosRevealed =
        conv.matchId?.stage === CONNECTION_STAGES.REVEALED ||
        conv.matchId?.stage === CONNECTION_STAGES.DATING;

      return {
        conversationId: conv._id,
        matchId: conv.matchId?._id,
        matchStage: conv.matchId?.stage,
        compatibilityScore: conv.matchId?.compatibilityScore,
        matchTier: conv.matchId?.matchTier,
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount?.get?.(userId.toString()) || conv.unreadCount?.[userId.toString()] || 0,
        messageCount: conv.messageCount,
        otherUser: {
          userId: otherUser?._id,
          firstName: otherUser?.firstName,
          isOnline: otherUser?.isOnline || false,
          lastSeen: otherUser?.lastSeen || null,
          photo: await UploadService.getAccessibleUrl(
            photosRevealed
              ? otherUser?.photos?.profilePhoto?.url || null
              : otherUser?.photos?.profilePhoto?.silhouetteUrl || null
          ),
        },
        updatedAt: conv.updatedAt,
      };
    }));

    return {
      conversations: formatted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Get Messages ─────────────────────────────────────────────

  /**
   * Paginated messages for a conversation using cursor-based pagination.
   * @param {string} before - ISO date string: get messages before this timestamp
   */
  static async getMessages(
    userId,
    conversationId,
    { before = null, limit = 50 } = {}
  ) {
    // Verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true,
    });

    if (!conversation) {
      const error = new Error('Conversation not found');
      error.statusCode = 404;
      throw error;
    }

    const query = {
      conversationId,
      isDeleted: false,
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'firstName')
      .populate('replyTo', 'content.text senderId type')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formattedMessages = await Promise.all(
      messages.reverse().map((message) => this._signMessageMedia(message))
    );

    return {
      messages: formattedMessages,
      hasMore: messages.length === limit,
    };
  }

  // ─── Send Message ─────────────────────────────────────────────

  /**
   * Sends a message in a conversation.
   * Auto-advances match from MUTUAL → CONNECTING on first message.
   */
  static async sendMessage(
    senderId,
    conversationId,
    { type = 'text', text = null, mediaUrl = null, mediaDuration = null, replyTo = null } = {}
  ) {
    // Verify sender is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: senderId,
      isActive: true,
    });

    if (!conversation) {
      const error = new Error('Conversation not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate content based on type
    if (type === 'text' && (!text || text.trim().length === 0)) {
      const error = new Error('Text message content is required');
      error.statusCode = 400;
      throw error;
    }

    if ((type === 'voice' || type === 'image') && !mediaUrl) {
      const error = new Error(`Media URL is required for ${type} messages`);
      error.statusCode = 400;
      throw error;
    }

    // Create message
    const message = await Message.create({
      conversationId,
      senderId,
      type,
      content: {
        text: text?.trim() || null,
        mediaUrl,
        mediaDuration,
      },
      replyTo,
    });

    // Update conversation's lastMessage and unread count
    await conversation.updateLastMessage(message);

    // Populate sender info for the response
    await message.populate('senderId', 'firstName');

    // ─── Auto-transition: MUTUAL → CONNECTING on first message ──
    try {
      const match = await Match.findById(conversation.matchId);
      if (match && match.stage === CONNECTION_STAGES.MUTUAL) {
        match.stage = CONNECTION_STAGES.CONNECTING;

        // Initialize reveal status
        match.revealStatus = {
          user1: { userId: match.users[0], requested: false },
          user2: { userId: match.users[1], requested: false },
        };
        match.markModified('revealStatus');
        await match.save();

        logger.info(
          `Match ${match._id} auto-advanced to CONNECTING after first message`
        );
      }
    } catch (err) {
      logger.error('Error auto-transitioning match stage:', err.message);
    }

    // ─── Periodic Comfort Score Recalculation ─────────────────────
    try {
      if (conversation.messageCount % 10 === 0 && conversation.messageCount > 0) {
        const { getComfortQueue } = require('../config/queue');
        const queue = getComfortQueue();
        if (queue) {
          queue.add({ matchId: conversation.matchId.toString() });
        } else {
          // Fallback: inline recalculation
          const ComfortService = require('./comfort.service');
          ComfortService.recalculateSilently(conversation.matchId);
        }
      }
    } catch (_) {
      // Non-critical
    }

    logger.debug(
      `Message sent in conversation ${conversationId} by user ${senderId} (type: ${type})`
    );

    return {
      message: await this._signMessageMedia({
        _id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        type: message.type,
        content: message.content,
        reactions: message.reactions,
        replyTo: message.replyTo,
        readAt: message.readAt,
        createdAt: message.createdAt,
      }),
      recipientId: conversation.getOtherParticipantId(senderId),
    };
  }

  // ─── Mark as Read ─────────────────────────────────────────────

  /**
   * Marks all unread messages in a conversation as read for this user.
   * Resets the user's unread count to 0.
   */
  static async markAsRead(userId, conversationId) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true,
    });

    if (!conversation) {
      const error = new Error('Conversation not found');
      error.statusCode = 404;
      throw error;
    }

    const now = new Date();

    // Mark all unread messages from the OTHER user as read
    const result = await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        readAt: null,
        isDeleted: false,
      },
      { $set: { readAt: now } }
    );

    // Reset this user's unread count
    conversation.unreadCount.set(userId.toString(), 0);
    await conversation.save();

    logger.debug(
      `${result.modifiedCount} messages marked as read in conversation ${conversationId} for user ${userId}`
    );

    return {
      conversationId,
      messagesRead: result.modifiedCount,
      readAt: now,
    };
  }

  // ─── Add Reaction ─────────────────────────────────────────────

  /**
   * Adds or updates a user's reaction on a message.
   * Each user can have one reaction per message.
   */
  static async addReaction(userId, messageId, emoji) {
    // Validate emoji
    if (!REACTION_EMOJIS.includes(emoji)) {
      const error = new Error(
        `Invalid emoji. Allowed: ${REACTION_EMOJIS.join(' ')}`
      );
      error.statusCode = 400;
      throw error;
    }

    const message = await Message.findOne({
      _id: messageId,
      isDeleted: false,
    });

    if (!message) {
      const error = new Error('Message not found');
      error.statusCode = 404;
      throw error;
    }

    // Verify user is a participant of this conversation
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: userId,
    });

    if (!conversation) {
      const error = new Error('You are not a participant of this conversation');
      error.statusCode = 403;
      throw error;
    }

    // Remove existing reaction from this user (if any)
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString()
    );

    // Add new reaction
    message.reactions.push({
      userId,
      emoji,
      createdAt: new Date(),
    });

    await message.save();

    return {
      messageId: message._id,
      conversationId: message.conversationId,
      reactions: message.reactions,
    };
  }

  // ─── Remove Reaction ──────────────────────────────────────────

  /**
   * Removes a user's reaction from a message.
   */
  static async removeReaction(userId, messageId) {
    const message = await Message.findOne({
      _id: messageId,
      isDeleted: false,
    });

    if (!message) {
      const error = new Error('Message not found');
      error.statusCode = 404;
      throw error;
    }

    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== userId.toString()
    );

    await message.save();

    return {
      messageId: message._id,
      conversationId: message.conversationId,
      reactions: message.reactions,
    };
  }

  static async _signMessageMedia(message) {
    if (!message) return message;

    const signedContent = { ...(message.content || {}) };
    signedContent.mediaUrl = await UploadService.getAccessibleUrl(
      signedContent.mediaUrl || null
    );

    return {
      ...message,
      content: signedContent,
    };
  }
}

module.exports = MessageService;
