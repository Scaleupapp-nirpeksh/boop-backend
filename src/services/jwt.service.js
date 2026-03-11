const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'boop_super_secret_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'boop_refresh_secret_key_2026';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

/**
 * Generate an access token for a user
 * @param {string} userId - The user's MongoDB _id
 * @returns {string} Signed JWT access token
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
};

/**
 * Generate a refresh token for a user
 * @param {string} userId - The user's MongoDB _id
 * @returns {string} Signed JWT refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );
};

/**
 * Generate both access and refresh tokens
 * @param {string} userId - The user's MongoDB _id
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateTokenPair = (userId) => {
  return {
    accessToken: generateAccessToken(userId),
    refreshToken: generateRefreshToken(userId),
  };
};

/**
 * Verify an access token
 * @param {string} token - JWT access token
 * @returns {object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (decoded.type !== 'access') {
    const error = new Error('Invalid token type');
    error.name = 'JsonWebTokenError';
    throw error;
  }

  return decoded;
};

/**
 * Verify a refresh token
 * @param {string} token - JWT refresh token
 * @returns {object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError} If token is invalid or expired
 */
const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET);

  if (decoded.type !== 'refresh') {
    const error = new Error('Invalid token type');
    error.name = 'JsonWebTokenError';
    throw error;
  }

  return decoded;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
};
