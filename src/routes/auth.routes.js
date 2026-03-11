const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate, sendOTPSchema, verifyOTPSchema, refreshTokenSchema } = require('../validators/auth.validator');

// Public routes (rate-limited)
router.post('/send-otp', authLimiter, validate(sendOTPSchema), authController.sendOTP);
router.post('/verify-otp', authLimiter, validate(verifyOTPSchema), authController.verifyOTP);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
