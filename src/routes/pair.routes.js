const express = require('express');
const router = express.Router();
const pairController = require('../controllers/pair.controller');
const { authenticate } = require('../middleware/auth.middleware');

// "Us" pair routes require authentication only — an invited user redeems
// right after minimal onboarding, before any dating profile exists. Access
// to pair resources (chat/games) is scoped by match membership downstream.
router.use(authenticate);

router.post('/invites', pairController.createInvite);
router.get('/invites', pairController.listInvites);
router.delete('/invites/:code', pairController.revokeInvite);
router.post('/redeem', pairController.redeem);

module.exports = router;
