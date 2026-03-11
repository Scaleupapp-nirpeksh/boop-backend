const asyncHandler = require('../utils/asyncHandler');
const AuthService = require('../services/auth.service');
const { sendOTPSchema, verifyOTPSchema, refreshTokenSchema, validate } = require('../validators/auth.validator');

/**
 * @desc    Send OTP to phone number
 * @route   POST /api/v1/auth/send-otp
 * @access  Public
 */
const sendOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  const result = await AuthService.sendOTP(phone);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: result.message,
    data: {
      phone: result.phone,
      expiresIn: result.expiresIn,
    },
  });
});

/**
 * @desc    Verify OTP and authenticate user
 * @route   POST /api/v1/auth/verify-otp
 * @access  Public
 */
const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  const result = await AuthService.verifyOTP(phone, otp);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: result.isNewUser ? 'Account created successfully' : 'Login successful',
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      isNewUser: result.isNewUser,
    },
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/v1/auth/refresh-token
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  const result = await AuthService.refreshAccessToken(token);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Token refreshed successfully',
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

/**
 * @desc    Logout user
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  await AuthService.logout(req.user._id);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Logged out successfully',
    data: null,
  });
});

/**
 * @desc    Get current authenticated user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'User profile retrieved successfully',
    data: {
      user: req.user,
    },
  });
});

module.exports = {
  sendOTP,
  verifyOTP,
  refreshToken,
  logout,
  getMe,
};
