const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter: 300 requests per 15 minute window per client IP.
 * Kept lenient because Indian mobile carriers place many users behind a
 * shared (CGNAT) public IP; abuse on specific actions (e.g. OTP) is
 * controlled separately by authLimiter + per-phone throttling.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
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
 * Stricter limiter for auth routes: 20 requests per 15 minute window per IP.
 * The real anti-abuse control for OTP is the per-phone throttle + attempt
 * lockout in auth.service.js; this is a coarse per-IP DoS guard kept lenient
 * enough for shared mobile (CGNAT) IPs.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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
