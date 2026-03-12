const mongoose = require('mongoose');
const { CONNECTION_STAGES, STAGE_TRANSITIONS } = require('../utils/constants');

// MARK: - Match Schema

/**
 * Represents a mutual connection between two users.
 * Created when user A likes user B AND user B has already liked user A.
 * Tracks the connection through the stage pipeline:
 * MUTUAL → CONNECTING → REVEAL_READY → REVEALED → DATING → ARCHIVED
 */
const matchSchema = new mongoose.Schema(
  {
    // Always stored in sorted order: users[0]._id < users[1]._id
    users: {
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
        message: 'A match must have exactly 2 users',
      },
      required: true,
    },

    // Current stage in the connection pipeline
    stage: {
      type: String,
      enum: Object.values(CONNECTION_STAGES),
      default: CONNECTION_STAGES.MUTUAL,
    },

    // Compatibility snapshot at match time
    compatibilityScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },

    matchTier: {
      type: String,
      enum: ['platinum', 'gold', 'silver', 'bronze'],
      required: true,
    },

    // Per-dimension breakdown { emotional_vulnerability: 82, ... }
    dimensionScores: {
      type: Map,
      of: Number,
      default: {},
    },

    // Timestamp when the match occurred
    matchedAt: {
      type: Date,
      default: Date.now,
    },

    // ─── Photo Reveal Status ──────────────────────────────────────
    revealStatus: {
      user1: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        requested: { type: Boolean, default: false },
      },
      user2: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        requested: { type: Boolean, default: false },
      },
      revealedAt: { type: Date, default: null },
    },

    // ─── Comfort Score ────────────────────────────────────────────
    comfortScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    comfortScoreUpdatedAt: {
      type: Date,
      default: null,
    },

    // ─── Archive Info ─────────────────────────────────────────────
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    archiveReason: {
      type: String,
      enum: ['mutual', 'one_sided', 'inactivity', 'blocked', 'other', null],
      default: null,
    },

    // ─── Boop (Poke) Feature ──────────────────────────────────────
    lastBoop: {
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      sentAt: { type: Date, default: null },
    },
    boopCount: {
      type: Number,
      default: 0,
    },

    // ─── Streak Tracking ────────────────────────────────────────
    streak: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastActiveDate: { type: Date, default: null },
    },

    // Whether the match is active
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

// Unique pair of users (prevents duplicate matches)
matchSchema.index({ users: 1 }, { unique: true });

// Find matches for a specific user filtered by stage and active status
matchSchema.index({ users: 1, stage: 1, isActive: 1 });

// Sort by creation date
matchSchema.index({ createdAt: -1 });

// ─── Instance Methods ───────────────────────────────────────────

/**
 * Get the other user's ID from this match given one user's ID.
 */
matchSchema.methods.getOtherUserId = function (userId) {
  const userIdStr = userId.toString();
  return this.users.find((u) => u.toString() !== userIdStr);
};

/**
 * Check if a stage transition is valid.
 */
matchSchema.methods.canTransitionTo = function (targetStage) {
  const validTargets = STAGE_TRANSITIONS[this.stage] || [];
  return validTargets.includes(targetStage);
};

const Match = mongoose.model('Match', matchSchema);

module.exports = Match;
