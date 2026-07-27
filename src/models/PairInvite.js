const mongoose = require('mongoose');

// MARK: - Pair Invite Schema

/**
 * A single-use code that pairs its creator with exactly one other person in
 * "Us" — the explore-compatibility-with-someone-you-know mode. Codes expire
 * after 7 days, are revocable, and each user may hold a limited number of
 * active codes at once (enforced in the service layer).
 */
const pairInviteSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 6,
      maxlength: 6,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['active', 'redeemed', 'revoked', 'expired'],
      default: 'active',
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    redeemedAt: {
      type: Date,
      default: null,
    },

    // Set when redemption produced/updated a match
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

pairInviteSchema.index({ createdBy: 1, status: 1 });

module.exports = mongoose.model('PairInvite', pairInviteSchema);
