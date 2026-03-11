const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadMessageMedia } = require('../middleware/upload.middleware');
const {
  sendMessageSchema,
  reactionSchema,
  uploadMediaSchema,
  conversationIdParamSchema,
  messageIdParamSchema,
  paginationSchema,
  validate,
  validateParams,
  validateQuery,
} = require('../validators/message.validator');

// All message routes require authentication
router.use(authenticate);

// ─── Conversations ──────────────────────────────────────────────

// List user's conversations
router.get(
  '/conversations',
  validateQuery(paginationSchema),
  messageController.getConversations
);

// Get messages in a conversation
router.get(
  '/conversations/:conversationId/messages',
  validateParams(conversationIdParamSchema),
  validateQuery(paginationSchema),
  messageController.getMessages
);

// Send a message
router.post(
  '/conversations/:conversationId/messages',
  validateParams(conversationIdParamSchema),
  validate(sendMessageSchema),
  messageController.sendMessage
);

router.post(
  '/conversations/:conversationId/media',
  validateParams(conversationIdParamSchema),
  uploadMessageMedia,
  validate(uploadMediaSchema),
  messageController.uploadMedia
);

// Mark conversation as read
router.patch(
  '/conversations/:conversationId/read',
  validateParams(conversationIdParamSchema),
  messageController.markAsRead
);

// ─── Reactions ──────────────────────────────────────────────────

// Add reaction
router.post(
  '/:messageId/reactions',
  validateParams(messageIdParamSchema),
  validate(reactionSchema),
  messageController.addReaction
);

// Remove reaction
router.delete(
  '/:messageId/reactions',
  validateParams(messageIdParamSchema),
  messageController.removeReaction
);

module.exports = router;
