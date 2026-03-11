const express = require('express');
const router = express.Router();
const discoverController = require('../controllers/discover.controller');
const {
  authenticate,
  requireCompleteProfile,
} = require('../middleware/auth.middleware');
const {
  validate,
  likeSchema,
  passSchema,
} = require('../validators/discover.validator');

// All discover routes require auth + complete profile
router.use(authenticate);
router.use(requireCompleteProfile);

// GET /discover/stats — Dashboard statistics
router.get('/stats', discoverController.getStats);

// GET /discover/pending — Incoming and outgoing pending likes
router.get('/pending', discoverController.getPendingLikes);

// GET /discover/suggest-note/:targetUserId — AI-suggested notes for a like
router.get('/suggest-note/:targetUserId', discoverController.suggestNote);

// GET /discover — Get candidate profiles
router.get('/', discoverController.getCandidates);

// POST /discover/like — Like a user
router.post('/like', validate(likeSchema), discoverController.likeUser);

// POST /discover/pass — Pass on a user
router.post('/pass', validate(passSchema), discoverController.passUser);

module.exports = router;
