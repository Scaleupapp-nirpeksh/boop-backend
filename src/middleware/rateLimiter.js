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
 * Coarse per-IP DoS guard for auth routes: 120 requests per 15 minute window.
 * This is shared across send-otp AND verify-otp, so a single user mistyping a
 * code can burn several; combined with Indian CGNAT (many real users behind one
 * carrier IP), a low cap blocks legitimate sign-ins. The REAL per-number anti-
 * abuse is the 60s per-phone OTP cooldown + 10-min expiry in auth.service.js,
 * which caps SMS spend per number regardless of this IP ceiling.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
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
