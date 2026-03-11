const { verifyAccessToken } = require('../services/jwt.service');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Authentication middleware — requires a valid access token.
 * Extracts Bearer token from Authorization header, verifies JWT,
 * finds the user, and attaches to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Access token is required',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Access token is required',
      });
    }

    // Verify token (checks type === 'access')
    const decoded = verifyAccessToken(token);

    // Find user
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'User not found',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Account has been deactivated',
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Account has been banned',
        data: { reason: user.banReason },
      });
    }

    // Attach user to request
    req.user = user;

    // Update lastActive (fire-and-forget — don't await)
    User.findByIdAndUpdate(user._id, { lastActive: new Date() }).catch((err) => {
      logger.error('Error updating lastActive:', err);
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Token has expired',
      });
    }

    logger.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication middleware — attaches user if token is valid,
 * but silently continues if no token is provided.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId);

    if (user && user.isActive && !user.isBanned) {
      req.user = user;

      // Update lastActive (fire-and-forget)
      User.findByIdAndUpdate(user._id, { lastActive: new Date() }).catch((err) => {
        logger.error('Error updating lastActive:', err);
      });
    }

    next();
  } catch (error) {
    // Silently continue without user
    next();
  }
};

/**
 * Middleware to require a completed profile (profileStage === 'ready').
 * Must be used after `authenticate` middleware.
 */
const requireCompleteProfile = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Authentication required',
    });
  }

  if (req.user.profileStage !== 'ready') {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Profile is not complete. Please finish setting up your profile.',
      data: { currentStage: req.user.profileStage },
    });
  }

  next();
};

module.exports = { authenticate, optionalAuth, requireCompleteProfile };
