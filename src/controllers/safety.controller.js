const asyncHandler = require('../utils/asyncHandler');
const SafetyService = require('../services/safety.service');

/**
 * @desc    Block a user
 * @route   POST /api/v1/safety/block
 * @access  Private
 */
const blockUser = asyncHandler(async (req, res) => {
  const result = await SafetyService.blockUser(req.user._id, req.body.userId);
  res.status(200).json({ success: true, statusCode: 200, message: 'User blocked', data: result });
});

/**
 * @desc    Unblock a user
 * @route   DELETE /api/v1/safety/block/:userId
 * @access  Private
 */
const unblockUser = asyncHandler(async (req, res) => {
  const result = await SafetyService.unblockUser(req.user._id, req.params.userId);
  res.status(200).json({ success: true, statusCode: 200, message: 'User unblocked', data: result });
});

/**
 * @desc    List blocked users
 * @route   GET /api/v1/safety/blocked
 * @access  Private
 */
const getBlockedUsers = asyncHandler(async (req, res) => {
  const blocked = await SafetyService.getBlockedUsers(req.user._id);
  res.status(200).json({ success: true, statusCode: 200, message: 'Blocked users retrieved', data: { blocked } });
});

/**
 * @desc    Report a user
 * @route   POST /api/v1/safety/report
 * @access  Private
 */
const reportUser = asyncHandler(async (req, res) => {
  const result = await SafetyService.reportUser(req.user._id, {
    reportedUserId: req.body.userId,
    reason: req.body.reason,
    details: req.body.details || null,
    contentType: req.body.contentType || 'profile',
    messageId: req.body.messageId || null,
  });
  res.status(201).json({ success: true, statusCode: 201, message: 'Report submitted', data: result });
});

module.exports = { blockUser, unblockUser, getBlockedUsers, reportUser };
