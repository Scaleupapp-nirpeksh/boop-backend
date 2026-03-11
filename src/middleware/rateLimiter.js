const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter: 100 requests per 15 minute window
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests. Please try again after 15 minutes.',
  },
  keyGenerator: (req) => {
    return req.ip;
  },
});

/**
 * Strict rate limiter for auth routes: 10 requests per 15 minute window
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  keyGenerator: (req) => {
    return req.ip;
  },
});

module.exports = { globalLimiter, authLimiter };
