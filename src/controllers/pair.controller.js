const asyncHandler = require('../utils/asyncHandler');
const PairService = require('../services/pair.service');

// MARK: - Pair Controller ("Us")

/**
 * @desc    Create a pair invite code
 * @route   POST /api/v1/pairs/invites
 * @access  Private
 */
const createInvite = asyncHandler(async (req, res) => {
  const result = await PairService.createInvite(req.user._id);
  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Pair code created',
    data: result,
  });
});

/**
 * @desc    List my active pair codes
 * @route   GET /api/v1/pairs/invites
 * @access  Private
 */
const listInvites = asyncHandler(async (req, res) => {
  const result = await PairService.listInvites(req.user._id);
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.invites.length} active codes`,
    data: result,
  });
});

/**
 * @desc    Revoke one of my pair codes
 * @route   DELETE /api/v1/pairs/invites/:code
 * @access  Private
 */
const revokeInvite = asyncHandler(async (req, res) => {
  const result = await PairService.revokeInvite(req.user._id, req.params.code);
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Code revoked',
    data: result,
  });
});

/**
 * @desc    Redeem a pair code (creates/merges/reactivates the pair)
 * @route   POST /api/v1/pairs/redeem
 * @access  Private
 */
const redeem = asyncHandler(async (req, res) => {
  const result = await PairService.redeem(req.user._id, req.body.code);
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Paired',
    data: result,
  });
});

module.exports = {
  createInvite,
  listInvites,
  revokeInvite,
  redeem,
};
