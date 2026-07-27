const PairInvite = require('../models/PairInvite');
const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Block = require('../models/Block');
const { CONNECTION_STAGES } = require('../utils/constants');
const logger = require('../utils/logger');

// MARK: - Pair Service ("Us")

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L lookalikes
const CODE_LENGTH = 6;
const MAX_ACTIVE_CODES = 5;
const CODE_TTL_DAYS = 7;

/** Generic rejection used whenever we must not leak WHY a code failed. */
const invalidCode = () => {
  const error = new Error("This code isn't valid.");
  error.statusCode = 400;
  return error;
};

class PairService {
  static _generateCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  /** Lazily expire an invite document if its time has passed. */
  static async _lazyExpire(invite) {
    if (invite.status === 'active' && invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
    }
    return invite;
  }

  // ─── Create ───────────────────────────────────────────────────

  static async createInvite(userId) {
    const activeCount = await PairInvite.countDocuments({
      createdBy: userId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (activeCount >= MAX_ACTIVE_CODES) {
      const error = new Error(
        `You already have ${MAX_ACTIVE_CODES} active codes. Revoke one to create another.`
      );
      error.statusCode = 400;
      throw error;
    }

    // Retry on the (unlikely) unique-code collision
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await PairInvite.create({
          code: this._generateCode(),
          createdBy: userId,
          expiresAt: new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000),
        });
        return {
          code: invite.code,
          expiresAt: invite.expiresAt,
          status: invite.status,
        };
      } catch (err) {
        if (err.code !== 11000) throw err; // not a duplicate-key error
      }
    }
    const error = new Error('Could not generate a code. Please try again.');
    error.statusCode = 500;
    throw error;
  }

  // ─── List / Revoke ────────────────────────────────────────────

  static async listInvites(userId) {
    const invites = await PairInvite.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .limit(20);

    const result = [];
    for (const invite of invites) {
      await this._lazyExpire(invite);
      if (invite.status === 'active') {
        result.push({
          code: invite.code,
          expiresAt: invite.expiresAt,
          status: invite.status,
          createdAt: invite.createdAt,
        });
      }
    }
    return { invites: result, maxActive: MAX_ACTIVE_CODES };
  }

  static async revokeInvite(userId, code) {
    const invite = await PairInvite.findOne({
      code: String(code || '').toUpperCase().trim(),
      createdBy: userId,
    });

    if (!invite || invite.status !== 'active') {
      const error = new Error('Code not found or no longer active.');
      error.statusCode = 404;
      throw error;
    }

    invite.status = 'revoked';
    await invite.save();
    return { code: invite.code, status: invite.status };
  }

  // ─── Redeem ───────────────────────────────────────────────────

  /**
   * Redeem a pair code. Handles every connection state between the two
   * people (spec §3.2.1):
   *  - no match            → create pair match (origin 'pair', stage 'paired')
   *  - active, pre-reveal  → auto-reveal + merge (usLinked)
   *  - active, revealed+   → mark usLinked ("already connected")
   *  - archived            → reactivate as a fresh start
   * Blocks (either direction) and self-redemption fail with a generic error.
   */
  static async redeem(userId, rawCode) {
    const code = String(rawCode || '').toUpperCase().trim();
    if (code.length !== CODE_LENGTH) throw invalidCode();

    const invite = await PairInvite.findOne({ code });
    if (!invite) throw invalidCode();

    await this._lazyExpire(invite);
    if (invite.status !== 'active') throw invalidCode();

    const inviterId = invite.createdBy;
    if (String(inviterId) === String(userId)) throw invalidCode(); // own code

    // Blocked in either direction → generic failure (never reveal the block)
    const block = await Block.findOne({
      $or: [
        { blocker: inviterId, blocked: userId },
        { blocker: userId, blocked: inviterId },
      ],
    });
    if (block) throw invalidCode();

    const inviter = await User.findById(inviterId).select(
      'firstName isActive isBanned photos'
    );
    const redeemer = await User.findById(userId).select(
      'firstName profileStage discoverable'
    );
    if (!inviter || !inviter.isActive || inviter.isBanned) throw invalidCode();

    const sortedUsers = [String(inviterId), String(userId)].sort();
    const existing = await Match.findOne({
      pairKey: sortedUsers.join('_'),
    });

    let match;
    let outcome;

    if (!existing) {
      // Fresh pair. Compatibility is computed best-effort — a brand-new
      // invitee has no answers yet, and that's fine (bronze/0 to start).
      let score = 0;
      let tier = 'bronze';
      try {
        const CompatibilityService = require('./compatibility.service');
        const compat = await CompatibilityService.calculateCompatibility(
          String(inviterId),
          String(userId)
        );
        if (compat?.score != null) {
          score = compat.score;
          tier = compat.tier || 'bronze';
        }
      } catch (_) {
        // Non-fatal: invitee likely has no answers yet
      }

      match = await Match.create({
        users: sortedUsers,
        origin: 'pair',
        stage: CONNECTION_STAGES.PAIRED,
        compatibilityScore: score,
        matchTier: tier,
        matchedAt: new Date(),
        isActive: true,
      });

      const conversation = new Conversation({
        participants: sortedUsers,
        matchId: match._id,
        isActive: true,
      });
      conversation.unreadCount.set(sortedUsers[0], 0);
      conversation.unreadCount.set(sortedUsers[1], 0);
      await conversation.save();

      outcome = 'paired';
    } else if (existing.isActive) {
      const preReveal = [
        CONNECTION_STAGES.MUTUAL,
        CONNECTION_STAGES.CONNECTING,
        CONNECTION_STAGES.REVEAL_READY,
      ].includes(existing.stage);

      if (preReveal) {
        // They found each other twice — exchanging a code is mutual
        // disclosure, so the blur has nothing left to protect.
        existing.stage = CONNECTION_STAGES.REVEALED;
        existing.revealStatus = {
          user1: { userId: sortedUsers[0], requested: true },
          user2: { userId: sortedUsers[1], requested: true },
          revealedAt: new Date(),
        };
        outcome = 'merged';
      } else {
        outcome = 'already_connected';
      }
      existing.usLinked = true;
      await existing.save();
      match = existing;
    } else {
      // Archived (previously ended) — a fresh code is a fresh start.
      existing.isActive = true;
      existing.archivedBy = null;
      existing.archivedAt = null;
      existing.archiveReason = null;
      if (existing.origin === 'pair') {
        existing.stage = CONNECTION_STAGES.PAIRED;
      } else {
        existing.stage = CONNECTION_STAGES.REVEALED;
        existing.usLinked = true;
        if (!existing.revealStatus?.revealedAt) {
          existing.revealStatus = {
            user1: { userId: sortedUsers[0], requested: true },
            user2: { userId: sortedUsers[1], requested: true },
            revealedAt: new Date(),
          };
        }
      }
      await existing.save();
      await Conversation.updateOne(
        { matchId: existing._id },
        { $set: { isActive: true } }
      );
      match = existing;
      outcome = 'reactivated';
    }

    // Mark the invite consumed
    invite.status = 'redeemed';
    invite.redeemedBy = userId;
    invite.redeemedAt = new Date();
    invite.matchId = match._id;
    await invite.save();

    // A redeemer without a dating profile becomes a pair-only account:
    // full access to their pairs, invisible in Discover until they opt in.
    if (
      redeemer &&
      !['preview', 'ready'].includes(redeemer.profileStage)
    ) {
      redeemer.profileStage = 'pair_only';
      redeemer.discoverable = false;
      await redeemer.save();
    }

    // Tell the inviter their person arrived
    try {
      const NotificationService = require('./notification.service');
      await NotificationService.sendPush(inviterId, {
        title: 'UnMutee',
        body: `${redeemer?.firstName || 'Someone'} joined your Us 🎉`,
        data: { type: 'pair_joined', matchId: match._id.toString() },
      });
    } catch (_) {
      // Non-critical
    }

    logger.info(`Pair redeem: ${outcome} (${userId} ↔ ${inviterId})`);

    return {
      outcome,
      matchId: match._id,
      partner: {
        userId: inviterId,
        firstName: inviter.firstName || null,
        photoUrl: inviter.photos?.profilePhoto?.url || null,
      },
    };
  }
}

module.exports = PairService;
