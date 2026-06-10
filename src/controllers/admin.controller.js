const asyncHandler = require('../utils/asyncHandler');
const Report = require('../models/Report');
const ModerationFlag = require('../models/ModerationFlag');
const User = require('../models/User');

/**
 * @desc    List reports (default: pending)
 * @route   GET /api/v1/admin/reports?status=pending
 * @access  Admin (x-admin-key)
 */
const getReports = asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const reports = await Report.find({ status })
    .populate('reporter', 'firstName phone')
    .populate('reported', 'firstName phone isBanned')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.status(200).json({ success: true, statusCode: 200, message: 'Reports retrieved', data: { reports } });
});

/**
 * @desc    Resolve a report
 * @route   PATCH /api/v1/admin/reports/:id  { action: 'dismissed'|'actioned', note? }
 * @access  Admin
 */
const resolveReport = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  if (!['dismissed', 'actioned'].includes(action)) {
    const error = new Error('action must be "dismissed" or "actioned"');
    error.statusCode = 400;
    throw error;
  }
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: action, reviewNote: note || null, resolvedAt: new Date() },
    { new: true }
  );
  if (!report) {
    const error = new Error('Report not found');
    error.statusCode = 404;
    throw error;
  }
  res.status(200).json({ success: true, statusCode: 200, message: 'Report resolved', data: { report } });
});

/**
 * @desc    List moderation flags (default: pending)
 * @route   GET /api/v1/admin/moderation-flags?status=pending
 * @access  Admin
 */
const getModerationFlags = asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const flags = await ModerationFlag.find({ status })
    .populate('userId', 'firstName phone isBanned')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.status(200).json({ success: true, statusCode: 200, message: 'Moderation flags retrieved', data: { flags } });
});

/**
 * @desc    Resolve a moderation flag
 * @route   PATCH /api/v1/admin/moderation-flags/:id  { action: 'dismissed'|'actioned', note? }
 * @access  Admin
 */
const resolveModerationFlag = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  if (!['dismissed', 'actioned'].includes(action)) {
    const error = new Error('action must be "dismissed" or "actioned"');
    error.statusCode = 400;
    throw error;
  }
  const flag = await ModerationFlag.findByIdAndUpdate(
    req.params.id,
    { status: action, reviewNote: note || null, resolvedAt: new Date() },
    { new: true }
  );
  if (!flag) {
    const error = new Error('Flag not found');
    error.statusCode = 404;
    throw error;
  }
  res.status(200).json({ success: true, statusCode: 200, message: 'Flag resolved', data: { flag } });
});

/**
 * @desc    Ban a user (auth middleware already rejects banned users)
 * @route   POST /api/v1/admin/users/:id/ban  { reason? }
 * @access  Admin
 */
const banUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: { isBanned: true, banReason: req.body.reason || 'Terms of service violation' },
      $unset: { fcmToken: 1, refreshToken: 1 },
    },
    { new: true }
  ).select('firstName isBanned banReason');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  // Kill any live realtime session — bans take effect immediately
  try {
    const socketManager = require('../config/socket');
    socketManager.disconnectUser(req.params.id);
  } catch (_) {
    // Non-critical — auth middleware rejects banned users on next request anyway
  }

  res.status(200).json({ success: true, statusCode: 200, message: 'User banned', data: { user } });
});

/**
 * @desc    Unban a user
 * @route   POST /api/v1/admin/users/:id/unban
 * @access  Admin
 */
const unbanUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { isBanned: false }, $unset: { banReason: 1 } },
    { new: true }
  ).select('firstName isBanned');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  res.status(200).json({ success: true, statusCode: 200, message: 'User unbanned', data: { user } });
});

module.exports = { getReports, resolveReport, getModerationFlags, resolveModerationFlag, banUser, unbanUser };
