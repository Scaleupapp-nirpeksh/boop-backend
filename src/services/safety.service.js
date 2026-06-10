const Block = require('../models/Block');
const Report = require('../models/Report');
const User = require('../models/User');
const Match = require('../models/Match');
const Conversation = require('../models/Conversation');
const { CONNECTION_STAGES, REPORT_REASONS } = require('../utils/constants');
const logger = require('../utils/logger');

// MARK: - Safety Service

/**
 * Blocking, reporting, and block-lookup helpers used by discover,
 * matching, and messaging to enforce user blocks platform-wide.
 */
class SafetyService {
  /**
   * Block a user. Idempotent. Also archives any active match between
   * the pair and deactivates its conversation. The blocked user is
   * never notified.
   */
  static async blockUser(blockerId, blockedId) {
    if (blockerId.toString() === blockedId.toString()) {
      const error = new Error('You cannot block yourself');
      error.statusCode = 400;
      throw error;
    }

    const target = await User.findById(blockedId).select('_id').lean();
    if (!target) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Upsert so double-blocking is a no-op instead of a duplicate-key error
    await Block.updateOne(
      { blocker: blockerId, blocked: blockedId },
      { $setOnInsert: { blocker: blockerId, blocked: blockedId } },
      { upsert: true }
    );

    // Archive any active match between the pair and deactivate its conversation
    const match = await Match.findOne({
      users: { $all: [blockerId, blockedId] },
      isActive: true,
    });

    if (match) {
      match.stage = CONNECTION_STAGES.ARCHIVED;
      match.isActive = false;
      match.archivedBy = blockerId;
      match.archivedAt = new Date();
      match.archiveReason = 'blocked';
      await match.save();
      await Conversation.updateOne({ matchId: match._id }, { isActive: false });
    }

    logger.info(`Safety: user ${blockerId} blocked ${blockedId}`);
    return { blockedUserId: blockedId };
  }

  /** Remove a block. Does NOT restore an archived match. */
  static async unblockUser(blockerId, blockedId) {
    await Block.deleteOne({ blocker: blockerId, blocked: blockedId });
    logger.info(`Safety: user ${blockerId} unblocked ${blockedId}`);
    return { unblockedUserId: blockedId };
  }

  /** List users this user has blocked (for a settings screen). */
  static async getBlockedUsers(blockerId) {
    const blocks = await Block.find({ blocker: blockerId })
      .populate('blocked', 'firstName')
      .sort({ createdAt: -1 })
      .lean();

    return blocks.map((b) => ({
      userId: b.blocked?._id,
      firstName: b.blocked?.firstName || 'Deleted user',
      blockedAt: b.createdAt,
    }));
  }

  /** True if either user has blocked the other. */
  static async isBlockedEither(userIdA, userIdB) {
    const block = await Block.exists({
      $or: [
        { blocker: userIdA, blocked: userIdB },
        { blocker: userIdB, blocked: userIdA },
      ],
    });
    return Boolean(block);
  }

  /**
   * Set of user-id strings involved in a block with this user (either
   * direction). Used to exclude blocked users from Discover.
   */
  static async getBlockedIdSet(userId) {
    const blocks = await Block.find(
      { $or: [{ blocker: userId }, { blocked: userId }] },
      { blocker: 1, blocked: 1 }
    ).lean();

    const ids = new Set();
    blocks.forEach((b) => {
      const other =
        b.blocker.toString() === userId.toString() ? b.blocked : b.blocker;
      ids.add(other.toString());
    });
    return ids;
  }

  /** File a report against a user. Reports land in the admin review queue. */
  static async reportUser(
    reporterId,
    { reportedUserId, reason, details = null, contentType = 'profile', messageId = null }
  ) {
    if (reporterId.toString() === reportedUserId.toString()) {
      const error = new Error('You cannot report yourself');
      error.statusCode = 400;
      throw error;
    }

    if (!REPORT_REASONS.includes(reason)) {
      const error = new Error(`Invalid reason. Allowed: ${REPORT_REASONS.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const report = await Report.create({
      reporter: reporterId,
      reported: reportedUserId,
      reason,
      details,
      contentType,
      messageId,
    });

    logger.info(`Safety: user ${reporterId} reported ${reportedUserId} (${reason})`);
    return { reportId: report._id, status: report.status };
  }
}

module.exports = SafetyService;
