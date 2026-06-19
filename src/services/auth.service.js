const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { generateTokenPair, generateAccessToken, verifyRefreshToken } = require('./jwt.service');
const { sendOTP: sendOTPViaSMS } = require('./twilio.service');
const logger = require('../utils/logger');

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 3;
const OTP_RATE_LIMIT_SECONDS = parseInt(process.env.OTP_RATE_LIMIT_SECONDS, 10) || 60;
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH, 10) || 6;

class AuthService {
  /**
   * Send OTP to a phone number
   * @param {string} phone - Phone number in E.164 format
   * @returns {Promise<{ message: string, phone: string, expiresIn: number }>}
   */
  static async sendOTP(phone) {
    // Validate phone format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
      const error = new Error('Invalid phone number format. Use E.164 format (e.g., +919876543210)');
      error.statusCode = 400;
      throw error;
    }

    // Rate limit: check if OTP was sent in the last OTP_RATE_LIMIT_SECONDS
    const recentOTP = await OTP.findOne({
      phone,
      createdAt: { $gte: new Date(Date.now() - OTP_RATE_LIMIT_SECONDS * 1000) },
    }).sort({ createdAt: -1 });

    if (recentOTP) {
      const secondsRemaining = Math.ceil(
        (recentOTP.createdAt.getTime() + OTP_RATE_LIMIT_SECONDS * 1000 - Date.now()) / 1000
      );
      const error = new Error(
        `Please wait ${secondsRemaining} seconds before requesting a new OTP`
      );
      error.statusCode = 429;
      throw error;
    }

    // Generate random 6-digit OTP code
    const code = crypto
      .randomInt(Math.pow(10, OTP_LENGTH - 1), Math.pow(10, OTP_LENGTH))
      .toString();

    // Hash the code before storing
    const salt = await bcrypt.genSalt(10);
    const hashedCode = await bcrypt.hash(code, salt);

    // Calculate expiry
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Save OTP document
    await OTP.create({
      phone,
      code: hashedCode,
      expiresAt,
    });

    // Send OTP via SMS (or log in dev mode)
    await sendOTPViaSMS(phone, code);

    logger.info(`OTP sent to ${phone}`);

    return {
      message: 'OTP sent successfully',
      phone,
      expiresIn: OTP_EXPIRY_MINUTES * 60, // in seconds
    };
  }

  /**
   * Verify OTP and authenticate user
   * @param {string} phone - Phone number in E.164 format
   * @param {string} code - The OTP code to verify
   * @returns {Promise<{ user: object, accessToken: string, refreshToken: string, isNewUser: boolean }>}
   */
  static async verifyOTP(phone, code) {
    // Find the most recent non-verified OTP for this phone
    const otpDoc = await OTP.findOne({
      phone,
      isVerified: false,
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      const error = new Error('No OTP found for this phone number. Please request a new one.');
      error.statusCode = 400;
      throw error;
    }

    // Check if OTP has expired
    if (new Date() > otpDoc.expiresAt) {
      const error = new Error('OTP has expired. Please request a new one.');
      error.statusCode = 400;
      throw error;
    }

    // Increment attempts and check maximum
    otpDoc.attempts += 1;

    if (otpDoc.attempts > OTP_MAX_ATTEMPTS) {
      await otpDoc.save();
      const error = new Error('Maximum OTP attempts exceeded. Please request a new one.');
      error.statusCode = 400;
      throw error;
    }

    // Compare code with hashed code
    const isMatch = await bcrypt.compare(code, otpDoc.code);

    if (!isMatch) {
      await otpDoc.save();
      const remainingAttempts = OTP_MAX_ATTEMPTS - otpDoc.attempts;
      const error = new Error(
        `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
      );
      error.statusCode = 400;
      throw error;
    }

    // Mark OTP as verified
    otpDoc.isVerified = true;
    await otpDoc.save();

    // Find or create user
    let isNewUser = false;
    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        phone,
        phoneVerified: true,
      });
      isNewUser = true;
      logger.info(`New user created: ${user._id} (${phone})`);
    } else {
      user.phoneVerified = true;
      await user.save();
    }

    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user._id.toString());

    // Hash refresh token and save to user
    const salt = await bcrypt.genSalt(10);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);
    user.refreshToken = hashedRefreshToken;
    await user.save();

    logger.info(`User authenticated: ${user._id} (${phone})`);

    return {
      user,
      accessToken,
      refreshToken,
      isNewUser,
    };
  }

  /**
   * Refresh the access token using a valid refresh token
   * @param {string} refreshToken - The refresh token
   * @returns {Promise<{ accessToken: string, user: object }>}
   */
  static async refreshAccessToken(refreshToken) {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user
    const user = await User.findById(decoded.userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error = new Error('Account has been deactivated');
      error.statusCode = 401;
      throw error;
    }

    if (user.isBanned) {
      const error = new Error('Account has been banned');
      error.statusCode = 403;
      throw error;
    }

    // Verify stored refresh token matches
    if (!user.refreshToken) {
      const error = new Error('Refresh token has been revoked. Please log in again.');
      error.statusCode = 401;
      throw error;
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!isMatch) {
      const error = new Error('Invalid refresh token. Please log in again.');
      error.statusCode = 401;
      throw error;
    }

    // Generate new access token
    const accessToken = generateAccessToken(user._id.toString());

    return {
      accessToken,
      user,
    };
  }

  /**
   * Logout the user — clear refresh token and mark offline
   * @param {string} userId - The user's MongoDB _id
   * @returns {Promise<void>}
   */
  static async logout(userId) {
    await User.findByIdAndUpdate(userId, {
      refreshToken: null,
      isOnline: false,
      lastSeen: new Date(),
    });

    logger.info(`User logged out: ${userId}`);
  }
}

module.exports = AuthService;
