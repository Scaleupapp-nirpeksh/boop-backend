const asyncHandler = require('../utils/asyncHandler');
const DatePlanService = require('../services/datePlan.service');

/**
 * @desc    Propose a date plan
 * @route   POST /api/v1/matches/:matchId/date-plans
 */
const proposeDatePlan = asyncHandler(async (req, res) => {
  const plan = await DatePlanService.proposeDatePlan(
    req.user._id,
    req.params.matchId,
    req.body
  );
  res.status(201).json({ success: true, plan });
});

/**
 * @desc    Get all date plans for a match
 * @route   GET /api/v1/matches/:matchId/date-plans
 */
const getDatePlans = asyncHandler(async (req, res) => {
  const plans = await DatePlanService.getDatePlans(
    req.user._id,
    req.params.matchId
  );
  res.json({ success: true, plans });
});

/**
 * @desc    Respond to a date plan (accept/decline)
 * @route   PATCH /api/v1/date-plans/:planId
 */
const respondToPlan = asyncHandler(async (req, res) => {
  const { accept, declineReason } = req.body;
  const plan = await DatePlanService.respondToPlan(
    req.user._id,
    req.params.planId,
    accept,
    declineReason
  );
  res.json({ success: true, plan });
});

/**
 * @desc    Cancel a date plan
 * @route   DELETE /api/v1/date-plans/:planId
 */
const cancelPlan = asyncHandler(async (req, res) => {
  const plan = await DatePlanService.cancelPlan(req.user._id, req.params.planId);
  res.json({ success: true, plan });
});

/**
 * @desc    Mark a date plan as completed
 * @route   PATCH /api/v1/date-plans/:planId/complete
 */
const completePlan = asyncHandler(async (req, res) => {
  const plan = await DatePlanService.completePlan(req.user._id, req.params.planId);
  res.json({ success: true, plan });
});

/**
 * @desc    Set safety contact
 * @route   POST /api/v1/date-plans/:planId/safety-contact
 */
const setSafetyContact = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const plan = await DatePlanService.setSafetyContact(
    req.user._id,
    req.params.planId,
    name,
    phone
  );
  res.json({ success: true, plan });
});

/**
 * @desc    Toggle location sharing
 * @route   POST /api/v1/date-plans/:planId/location-sharing
 */
const toggleLocationSharing = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  const plan = await DatePlanService.toggleLocationSharing(
    req.user._id,
    req.params.planId,
    enabled
  );
  res.json({ success: true, plan });
});

/**
 * @desc    Submit a check-in during a date
 * @route   POST /api/v1/date-plans/:planId/check-in
 */
const submitCheckIn = asyncHandler(async (req, res) => {
  const { status, coordinates } = req.body;
  const plan = await DatePlanService.submitCheckIn(
    req.user._id,
    req.params.planId,
    status,
    coordinates
  );
  res.json({ success: true, plan });
});

/**
 * @desc    Get AI venue suggestions for a match
 * @route   GET /api/v1/matches/:matchId/venue-suggestions
 */
const suggestVenues = asyncHandler(async (req, res) => {
  const suggestions = await DatePlanService.suggestVenues(
    req.user._id,
    req.params.matchId
  );
  res.json({ success: true, suggestions });
});

module.exports = {
  proposeDatePlan,
  getDatePlans,
  respondToPlan,
  cancelPlan,
  completePlan,
  setSafetyContact,
  toggleLocationSharing,
  submitCheckIn,
  suggestVenues,
};
