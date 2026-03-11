const mongoose = require('mongoose');
const { REACTION_EMOJIS } = require('../utils/constants');

// MARK: - Message Schema

/**
 * Individual message within a conversation.
 * Supports text, voice, image, game invites, and system messages.
 */
const messageSchema = new mongoose.Schema(
  {
    // Which conversation this message belongs to
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },

    // Who sent it
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Message type
    type: {
      type: String,
      enum: ['text', 'voice', 'image', 'game_invite', 'system'],
      required: true,
      default: 'text',
    },

    // Message content — fields used depend on type
    content: {
      // Text message body
      text: {
        type: String,
        maxlength: [2000, 'Message cannot exceed 2000 characters'],
        default: null,
      },
      // URL for voice/image messages (S3)
      mediaUrl: {
        type: String,
        default: null,
      },
      // Duration in seconds for voice messages
      mediaDuration: {
        type: Number,
        default: null,
      },
      // Game type for game_invite messages
      gameType: {
        type: String,
        default: null,
      },
      // Game session ID for game_invite messages
      gameSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },

    // When the message was read by the recipient (null = unread)
    readAt: {
      type: Date,
      default: null,
    },

    // Emoji reactions: each user can react once
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        emoji: {
          type: String,
          enum: REACTION_EMOJIS,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Reply-to another message (optional)
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────

// Paginate messages within a conversation (newest first)
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Find messages by sender
messageSchema.index({ senderId: 1 });

// Find unread messages for a conversation
messageSchema.index({ conversationId: 1, readAt: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
