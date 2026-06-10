const express = require('express');
const router = express.Router();
const safetyController = require('../controllers/safety.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../validators/profile.validator');
const { validateParams } = require('../validators/message.validator');
const { blockUserSchema, reportUserSchema, userIdParamSchema } = require('../validators/safety.validator');

// All safety routes require authentication
router.use(authenticate);

// POST /safety/block — Block a user
router.post('/block', validate(blockUserSchema), safetyController.blockUser);

// DELETE /safety/block/:userId — Unblock a user
router.delete('/block/:userId', validateParams(userIdParamSchema), safetyController.unblockUser);

// GET /safety/blocked — List blocked users
router.get('/blocked', safetyController.getBlockedUsers);

// POST /safety/report — Report a user
router.post('/report', validate(reportUserSchema), safetyController.reportUser);

module.exports = router;
