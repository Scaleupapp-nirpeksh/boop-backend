const mongoose = require('mongoose');

// MARK: - Interaction Schema

/**
 * Tracks every like and pass between users.
 * Foundation of the discovery system — prevents showing the same user twice
 * and enables mutual-match detection.
 */
const interactionSchema = new mongoose.Schema(
  {
    // The user who performed the action
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'fromUser is required'],
      index: true,
    },

    // The user who was acted upon
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'toUser is required'],
      index: true,
    },

    // What action was taken
    action: {
      type: String,
      enum: {
        values: ['like', 'pass'],
        message: '{VALUE} is not a valid interaction action',
      },
      required: [true, 'Action is required'],
    },

    // Compatibility score at time of interaction (snapshot)
    compatibilityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    // Which tier this score mapped to
    matchTier: {
      type: String,
      enum: ['platinum', 'gold', 'silver', 'bronze', null],
      default: null,
    },

    // Optional note sent with a like
    note: {
      type: { type: String, enum: ['text', 'voice'], default: 'text' },
      content: String, // text content or voice URL
      duration: Number, // voice duration in seconds
    },
  },
  {
    timestamps: true,
  }
);

// Each user can only interact with another user once
interactionSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });

// Fast lookup: "who has liked me?"
interactionSchema.index({ toUser: 1, action: 1 });

// Fast lookup: "who have I interacted with?"
interactionSchema.index({ fromUser: 1, action: 1 });

const Interaction = mongoose.model('Interaction', interactionSchema);

module.exports = Interaction;
