const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const { authenticate, requireCompleteProfile } = require('../middleware/auth.middleware');
const {
  createGameSchema,
  readyGameSchema,
  submitResponseSchema,
  gameIdParamSchema,
  matchIdParamSchema,
  validate,
  validateParams,
} = require('../validators/game.validator');

// All game routes require authentication + complete profile
router.use(authenticate);
router.use(requireCompleteProfile);

// ─── Create Game ─────────────────────────────────────────────────

router.post('/', validate(createGameSchema), gameController.createGame);

// ─── Get Game State ──────────────────────────────────────────────

router.get(
  '/:gameId',
  validateParams(gameIdParamSchema),
  gameController.getGame
);

router.post(
  '/:gameId/ready',
  validateParams(gameIdParamSchema),
  validate(readyGameSchema),
  gameController.setReadyState
);

// ─── Submit Response ─────────────────────────────────────────────

router.post(
  '/:gameId/respond',
  validateParams(gameIdParamSchema),
  validate(submitResponseSchema),
  gameController.submitResponse
);

// ─── Cancel Game ─────────────────────────────────────────────────

router.patch(
  '/:gameId/cancel',
  validateParams(gameIdParamSchema),
  gameController.cancelGame
);

// ─── Games for a Match (mounted under /games but uses matchId param) ──

router.get(
  '/match/:matchId',
  validateParams(matchIdParamSchema),
  gameController.getGamesForMatch
);

module.exports = router;
