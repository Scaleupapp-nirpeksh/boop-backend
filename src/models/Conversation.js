const mongoose = require('mongoose');

// MARK: - Conversation Schema

/**
 * Represents a chat conversation between two matched users.
 * Created automatically when a mutual match occurs.
 * One conversation per match (enforced by unique matchId).
 */
const conversationSchema = new mongoose.Schema(
  {
    // The two users in this conversation
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      validate: {
        validator: function (v) {
          return v.length === 2;
        },
        message: 'A conversation must have exactly 2 participants',
      },
      required: true,
    },

    // Link back to the Match that spawned this conversation
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      unique: true,
    },

    // Denormalized last message for quick listing
    lastMessage: {
      text: { type: String, default: null },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      sentAt: { type: Date, default: null },
      type: {
        type: String,
        enum: ['text', 'voice', 'image', 'game_invite', 'system'],
        default: null,
      },
    },

    // Per-user unread message count: { "userId1": 3, "userId2": 0 }
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },

    // Total messages in this conversation (denormalized for quick access)
    messageCount: {
      type: Number,
      default: 0,
    },

    // Whether this conversation is active
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────

// Find conversations for a user, sorted by most recent activity
conversationSchema.index({ participants: 1, isActive: 1, updatedAt: -1 });

// matchId already has unique: true in schema definition — no duplicate index needed

// ─── Instance Methods ───────────────────────────────────────────

/**
 * Get the other participant's ID given one user's ID.
 */
conversationSchema.methods.getOtherParticipantId = function (userId) {
  const userIdStr = userId.toString();
  return this.participants.find((p) => p.toString() !== userIdStr);
};

/**
 * Update the lastMessage snapshot and increment unread for the recipient.
 */
conversationSchema.methods.updateLastMessage = function (message) {
  this.lastMessage = {
    text:
      message.content?.text ||
      (message.type === 'voice'
        ? '🎤 Voice message'
        : message.type === 'image'
        ? '📷 Photo'
        : message.type === 'game_invite'
        ? '🎮 Game invite'
        : 'New message'),
    senderId: message.senderId,
    sentAt: message.createdAt || new Date(),
    type: message.type,
  };

  this.messageCount += 1;

  // Increment unread for the OTHER participant (not the sender)
  const recipientId = this.getOtherParticipantId(message.senderId);
  if (recipientId) {
    const currentCount = this.unreadCount.get(recipientId.toString()) || 0;
    this.unreadCount.set(recipientId.toString(), currentCount + 1);
  }

  return this.save();
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
