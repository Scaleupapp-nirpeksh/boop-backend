const asyncHandler = require('../utils/asyncHandler');
const MessageService = require('../services/message.service');
const UploadService = require('../services/upload.service');
const Conversation = require('../models/Conversation');

// MARK: - Message Controller

/**
 * @desc    Get user's conversations
 * @route   GET /api/v1/messages/conversations
 * @access  Private
 */
const getConversations = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;

  const result = await MessageService.getConversations(req.user._id, {
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  });

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.conversations.length} conversations found`,
    data: result,
  });
});

/**
 * @desc    Get messages in a conversation
 * @route   GET /api/v1/messages/conversations/:conversationId/messages
 * @access  Private
 */
const getMessages = asyncHandler(async (req, res) => {
  const { before, limit } = req.query;

  const result = await MessageService.getMessages(
    req.user._id,
    req.params.conversationId,
    {
      before: before || null,
      limit: limit ? parseInt(limit, 10) : 50,
    }
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.messages.length} messages retrieved`,
    data: result,
  });
});

/**
 * @desc    Send a message in a conversation
 * @route   POST /api/v1/messages/conversations/:conversationId/messages
 * @access  Private
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { type, text, mediaUrl, mediaDuration, replyTo } = req.body;

  const result = await MessageService.sendMessage(
    req.user._id,
    req.params.conversationId,
    { type, text, mediaUrl, mediaDuration, replyTo }
  );

  // Emit real-time message event via socket
  try {
    const socketManager = require('../config/socket');

    // Send to conversation room (all participants)
    socketManager.emitToConversation(
      req.params.conversationId,
      'message:new',
      result.message
    );

    // Also emit directly to the recipient (in case they're not in the room)
    if (result.recipientId) {
      socketManager.emitToUser(
        result.recipientId.toString(),
        'message:new',
        result.message
      );
    }
  } catch (_) {
    // Non-critical
  }

  // Trigger push notification for offline recipient
  try {
    const NotificationService = require('../services/notification.service');
    if (result.recipientId) {
      const socketManager = require('../config/socket');
      const isOnline = socketManager.isUserOnline(result.recipientId.toString());
      if (!isOnline) {
        await NotificationService.notifyNewMessage(
          result.recipientId,
          req.user.firstName,
          result.message.content?.text || `New ${type} message`,
          req.params.conversationId
        );
      }
    }
  } catch (_) {
    // Non-critical: notification service may not be built yet
  }

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Message sent',
    data: result.message,
  });
});

/**
 * @desc    Upload media for a conversation message
 * @route   POST /api/v1/messages/conversations/:conversationId/media
 * @access  Private
 */
const uploadMedia = asyncHandler(async (req, res) => {
  const { type, duration } = req.body;

  if (!req.file) {
    const error = new Error('Media file is required');
    error.statusCode = 400;
    throw error;
  }

  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    participants: req.user._id,
    isActive: true,
  });

  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }

  const ext = req.file.originalname?.split('.').pop()?.toLowerCase()
    || (type === 'voice' ? 'm4a' : 'jpg');
  const key = `users/${req.user._id}/messages/${req.params.conversationId}/${type}-${Date.now()}.${ext}`;
  const uploaded = await UploadService.uploadToS3(req.file.buffer, key, req.file.mimetype);

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Media uploaded',
    data: {
      mediaUrl: uploaded.url,
      mediaType: type,
      mediaDuration: duration ? parseFloat(duration) : null,
    },
  });
});

/**
 * @desc    Mark conversation as read
 * @route   PATCH /api/v1/messages/conversations/:conversationId/read
 * @access  Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const result = await MessageService.markAsRead(
    req.user._id,
    req.params.conversationId
  );

  // Emit read receipt via socket
  try {
    const socketManager = require('../config/socket');
    socketManager.emitToConversation(
      req.params.conversationId,
      'message:read',
      {
        conversationId: req.params.conversationId,
        readBy: req.user._id,
        readAt: result.readAt,
      }
    );
  } catch (_) {
    // Non-critical
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.messagesRead} messages marked as read`,
    data: result,
  });
});

/**
 * @desc    Add a reaction to a message
 * @route   POST /api/v1/messages/:messageId/reactions
 * @access  Private
 */
const addReaction = asyncHandler(async (req, res) => {
  const { emoji } = req.body;

  const result = await MessageService.addReaction(
    req.user._id,
    req.params.messageId,
    emoji
  );

  // Emit reaction event via socket
  try {
    const socketManager = require('../config/socket');
    socketManager.emitToConversation(
      result.conversationId.toString(),
      'message:reaction',
      {
        messageId: result.messageId,
        reactions: result.reactions,
        addedBy: req.user._id,
        emoji,
      }
    );
  } catch (_) {
    // Non-critical
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Reaction added',
    data: result,
  });
});

/**
 * @desc    Remove a reaction from a message
 * @route   DELETE /api/v1/messages/:messageId/reactions
 * @access  Private
 */
const removeReaction = asyncHandler(async (req, res) => {
  const result = await MessageService.removeReaction(
    req.user._id,
    req.params.messageId
  );

  // Emit reaction update via socket
  try {
    const socketManager = require('../config/socket');
    socketManager.emitToConversation(
      result.conversationId.toString(),
      'message:reaction',
      {
        messageId: result.messageId,
        reactions: result.reactions,
        removedBy: req.user._id,
      }
    );
  } catch (_) {
    // Non-critical
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Reaction removed',
    data: result,
  });
});

/**
 * @desc    Get media messages (images/voice) in a conversation
 * @route   GET /api/v1/messages/conversations/:conversationId/media
 * @access  Private
 */
const getConversationMedia = asyncHandler(async (req, res) => {
  const { type, page, limit } = req.query;

  const result = await MessageService.getMediaMessages(
    req.user._id,
    req.params.conversationId,
    {
      type: type || null,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 30,
    }
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.media.length} media items retrieved`,
    data: result,
  });
});

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  uploadMedia,
  markAsRead,
  addReaction,
  removeReaction,
  getConversationMedia,
};
