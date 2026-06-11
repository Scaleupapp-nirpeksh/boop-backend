const express = require('express');
const router = express.Router();
const discoverController = require('../controllers/discover.controller');
const {
  authenticate,
  requireOnboarded,
} = require('../middleware/auth.middleware');
const {
  validate,
  likeSchema,
  passSchema,
} = require('../validators/discover.validator');

// All discover routes require auth + an onboarded profile (preview OR ready).
// 'preview' users can browse candidates/stats/pending and reach POST /like,
// where the service layer enforces the stricter 'ready' gate and returns the
// typed `complete_setup_required` code that launches the client's connect-setup.
router.use(authenticate);
router.use(requireOnboarded);

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
