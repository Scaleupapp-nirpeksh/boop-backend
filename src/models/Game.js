const mongoose = require('mongoose');
const { GAME_TYPES } = require('../utils/constants');

// MARK: - Game Schema

/**
 * Represents an interactive game session between two matched users.
 * Games are turn-based with multiple rounds.
 * Supports: would_you_rather, two_truths_a_lie, never_have_i_ever, etc.
 */
const gameSchema = new mongoose.Schema(
  {
    // Which match this game belongs to
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },

    // Which conversation this game is linked to
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },

    // Game type
    gameType: {
      type: String,
      enum: Object.values(GAME_TYPES),
      required: true,
    },

    // Game status
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'cancelled'],
      default: 'pending',
    },

    // Who created the game
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // The two participants
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
        message: 'A game must have exactly 2 participants',
      },
      required: true,
    },

    // Game rounds
    rounds: [
      {
        roundNumber: { type: Number, required: true },
        prompt: {
          text: { type: String, required: true },
          // For Would You Rather: two options
          optionA: { type: String, default: null },
          optionB: { type: String, default: null },
          // For Never Have I Ever: category/depth
          category: { type: String, default: null },
          // For Intimacy Spectrum: rating scale
          scale: {
            min: { type: Number, default: null },
            max: { type: Number, default: null },
          },
          // For What Would You Do: scenario context
          context: { type: String, default: null },
          // For Blind Reveal: follow-up reveal prompt
          revealPrompt: { type: String, default: null },
        },
        responses: [
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User',
              required: true,
            },
            answer: { type: String, required: true },
            answeredAt: { type: Date, default: Date.now },
          },
        ],
        isComplete: { type: Boolean, default: false },
      },
    ],

    // Current round index (0-based)
    currentRound: {
      type: Number,
      default: 0,
    },

    // Total rounds
    totalRounds: {
      type: Number,
      default: 5,
    },

    syncState: {
      readyPlayers: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          isReady: {
            type: Boolean,
            default: false,
          },
          readyAt: {
            type: Date,
            default: null,
          },
        },
      ],
      countdownSeconds: {
        type: Number,
        default: 3,
      },
      roundDurationSeconds: {
        type: Number,
        default: 45,
      },
      countdownStartedAt: {
        type: Date,
        default: null,
      },
      countdownEndsAt: {
        type: Date,
        default: null,
      },
      roundStartedAt: {
        type: Date,
        default: null,
      },
      roundEndsAt: {
        type: Date,
        default: null,
      },
      lastTransitionAt: {
        type: Date,
        default: null,
      },
      replayAvailableAt: {
        type: Date,
        default: null,
      },
    },

    // When the game was completed
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────

gameSchema.index({ matchId: 1, status: 1 });
gameSchema.index({ conversationId: 1 });
gameSchema.index({ participants: 1, status: 1 });

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;
