const express = require('express');
const router = express.Router();
const matchController = require('../controllers/match.controller');
const gameController = require('../controllers/game.controller');
const { authenticate, requireCompleteProfile } = require('../middleware/auth.middleware');
const {
  matchIdParamSchema,
  archiveSchema,
  listMatchesSchema,
  validate,
  validateParams,
  validateQuery,
} = require('../validators/match.validator');

// All match routes require authentication + complete profile
router.use(authenticate);
router.use(requireCompleteProfile);

// ─── Match Listing ──────────────────────────────────────────────

router.get('/', validateQuery(listMatchesSchema), matchController.getMatches);

// ─── Single Match Detail ────────────────────────────────────────

router.get(
  '/:matchId',
  validateParams(matchIdParamSchema),
  matchController.getMatchById
);

// ─── Stage Progression ──────────────────────────────────────────

router.patch(
  '/:matchId/advance',
  validateParams(matchIdParamSchema),
  matchController.advanceStage
);

// ─── Archive ────────────────────────────────────────────────────

router.patch(
  '/:matchId/archive',
  validateParams(matchIdParamSchema),
  validate(archiveSchema),
  matchController.archiveMatch
);

// ─── Photo Reveal ───────────────────────────────────────────────

router.post(
  '/:matchId/reveal',
  validateParams(matchIdParamSchema),
  matchController.requestReveal
);

// ─── Comfort Score ──────────────────────────────────────────────

router.get(
  '/:matchId/comfort',
  validateParams(matchIdParamSchema),
  matchController.getComfortScore
);

// ─── Date Readiness ────────────────────────────────────────

router.get(
  '/:matchId/date-readiness',
  validateParams(matchIdParamSchema),
  matchController.getDateReadiness
);

// ─── Games for a Match ──────────────────────────────────────────

router.get(
  '/:matchId/games',
  validateParams(matchIdParamSchema),
  gameController.getGamesForMatch
);

// ─── Score History ─────────────────────────────────────────
router.get(
  '/:matchId/score-history',
  validateParams(matchIdParamSchema),
  matchController.getScoreHistory
);

// ─── AI Relationship Insights ──────────────────────────────
router.get(
  '/:matchId/insights',
  validateParams(matchIdParamSchema),
  matchController.getRelationshipInsights
);

// ─── AI Conversation Starters ─────────────────────────────
router.get(
  '/:matchId/conversation-starters',
  validateParams(matchIdParamSchema),
  matchController.getConversationStarters
);

// ─── Compatibility Deep-Dive ─────────────────────────────────
router.get(
  '/:matchId/compatibility',
  validateParams(matchIdParamSchema),
  matchController.getCompatibilityDeepDive
);

// ─── Boop (Poke) ────────────────────────────────────────────
router.post(
  '/:matchId/boop',
  validateParams(matchIdParamSchema),
  matchController.sendBoop
);

// ─── Date Plans (match-scoped) ──────────────────────────────
const datePlanController = require('../controllers/datePlan.controller');

router.post(
  '/:matchId/date-plans',
  validateParams(matchIdParamSchema),
  datePlanController.proposeDatePlan
);

router.get(
  '/:matchId/date-plans',
  validateParams(matchIdParamSchema),
  datePlanController.getDatePlans
);

router.get(
  '/:matchId/venue-suggestions',
  validateParams(matchIdParamSchema),
  datePlanController.suggestVenues
);

module.exports = router;
