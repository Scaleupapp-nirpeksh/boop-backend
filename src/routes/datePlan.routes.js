const express = require('express');
const router = express.Router();
const datePlanController = require('../controllers/datePlan.controller');
const { authenticate, requireCompleteProfile } = require('../middleware/auth.middleware');

router.use(authenticate);
router.use(requireCompleteProfile);

// ─── Date Plan CRUD (by planId) ──────────────────────────────────

router.patch('/:planId', datePlanController.respondToPlan);
router.delete('/:planId', datePlanController.cancelPlan);
router.patch('/:planId/complete', datePlanController.completePlan);

// ─── Safety Features ─────────────────────────────────────────────

router.post('/:planId/safety-contact', datePlanController.setSafetyContact);
router.post('/:planId/location-sharing', datePlanController.toggleLocationSharing);
router.post('/:planId/check-in', datePlanController.submitCheckIn);

module.exports = router;
