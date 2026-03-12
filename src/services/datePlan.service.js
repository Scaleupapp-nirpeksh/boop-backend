const DatePlan = require('../models/DatePlan');
const Match = require('../models/Match');
const User = require('../models/User');
const NotificationService = require('./notification.service');
const logger = require('../utils/logger');

class DatePlanService {
  /**
   * Propose a date plan for a match.
   * Only allowed when date readiness >= 70.
   */
  static async proposeDatePlan(userId, matchId, planData) {
    const match = await Match.findById(matchId);
    if (!match) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    if (!match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('You are not part of this match');
      error.statusCode = 403;
      throw error;
    }

    // Check date readiness score
    const MatchService = require('./match.service');
    const readiness = await MatchService.calculateDateReadiness(userId, matchId);
    if (readiness.overall < 70) {
      const error = new Error(`Date readiness is ${readiness.overall}%. Reach 70% to plan a date.`);
      error.statusCode = 403;
      throw error;
    }

    const datePlan = await DatePlan.create({
      matchId,
      proposedBy: userId,
      venue: {
        name: planData.venueName,
        type: planData.venueType || 'coffee',
        address: planData.address || null,
      },
      proposedDate: new Date(planData.proposedDate),
      proposedTime: planData.proposedTime || null,
      notes: planData.notes || null,
    });

    // Notify the other user
    const otherId = match.users.find((u) => u.toString() !== userId.toString());
    const proposer = await User.findById(userId).select('firstName').lean();

    if (otherId) {
      NotificationService.sendPush(otherId, {
        type: 'date_proposed',
        title: 'Date invitation!',
        body: `${proposer?.firstName || 'Someone'} wants to plan a date with you`,
        data: { matchId: matchId.toString() },
      }).catch(() => {});
    }

    logger.info(`Date plan proposed: match=${matchId}, by=${userId}`);
    return datePlan;
  }

  /**
   * Respond to a date plan (accept or decline).
   */
  static async respondToPlan(userId, planId, accept, declineReason) {
    const plan = await DatePlan.findById(planId);
    if (!plan) {
      const error = new Error('Date plan not found');
      error.statusCode = 404;
      throw error;
    }

    if (plan.status !== 'proposed') {
      const error = new Error('This plan has already been responded to');
      error.statusCode = 409;
      throw error;
    }

    // Verify user is part of the match but NOT the proposer
    const match = await Match.findById(plan.matchId);
    if (!match || !match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('You are not part of this match');
      error.statusCode = 403;
      throw error;
    }

    if (plan.proposedBy.toString() === userId.toString()) {
      const error = new Error('You cannot respond to your own plan');
      error.statusCode = 400;
      throw error;
    }

    if (accept) {
      plan.status = 'accepted';
      plan.acceptedAt = new Date();
    } else {
      plan.status = 'declined';
      plan.declinedAt = new Date();
      plan.declineReason = declineReason || null;
    }

    await plan.save();

    // Notify the proposer
    const responder = await User.findById(userId).select('firstName').lean();
    const notificationType = accept ? 'date_accepted' : 'date_declined';
    const notificationBody = accept
      ? `${responder?.firstName || 'Your match'} accepted your date plan!`
      : `${responder?.firstName || 'Your match'} couldn't make it this time`;

    NotificationService.sendPush(plan.proposedBy, {
      type: notificationType,
      title: accept ? 'Date confirmed!' : 'Date plan update',
      body: notificationBody,
      data: { matchId: plan.matchId.toString() },
    }).catch(() => {});

    logger.info(`Date plan ${accept ? 'accepted' : 'declined'}: plan=${planId}, by=${userId}`);
    return plan;
  }

  /**
   * Get all date plans for a match.
   */
  static async getDatePlans(userId, matchId) {
    const match = await Match.findById(matchId);
    if (!match || !match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('Match not found or access denied');
      error.statusCode = 404;
      throw error;
    }

    const plans = await DatePlan.find({ matchId })
      .sort({ createdAt: -1 })
      .lean();

    return plans;
  }

  /**
   * Cancel a proposed/accepted date plan (only by the proposer).
   */
  static async cancelPlan(userId, planId) {
    const plan = await DatePlan.findById(planId);
    if (!plan) {
      const error = new Error('Date plan not found');
      error.statusCode = 404;
      throw error;
    }

    if (plan.proposedBy.toString() !== userId.toString()) {
      const error = new Error('Only the proposer can cancel a plan');
      error.statusCode = 403;
      throw error;
    }

    if (plan.status === 'completed' || plan.status === 'cancelled') {
      const error = new Error('This plan cannot be cancelled');
      error.statusCode = 409;
      throw error;
    }

    plan.status = 'cancelled';
    await plan.save();

    // Notify the other user
    const match = await Match.findById(plan.matchId);
    if (match) {
      const otherId = match.users.find((u) => u.toString() !== userId.toString());
      const canceller = await User.findById(userId).select('firstName').lean();
      if (otherId) {
        NotificationService.sendPush(otherId, {
          type: 'system',
          title: 'Date plan cancelled',
          body: `${canceller?.firstName || 'Your match'} cancelled the date plan`,
          data: { matchId: plan.matchId.toString() },
        }).catch(() => {});
      }
    }

    return plan;
  }

  /**
   * Mark a plan as completed.
   */
  static async completePlan(userId, planId) {
    const plan = await DatePlan.findById(planId);
    if (!plan) {
      const error = new Error('Date plan not found');
      error.statusCode = 404;
      throw error;
    }

    if (plan.status !== 'accepted') {
      const error = new Error('Only accepted plans can be completed');
      error.statusCode = 409;
      throw error;
    }

    const match = await Match.findById(plan.matchId);
    if (!match || !match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }

    plan.status = 'completed';
    plan.completedAt = new Date();
    await plan.save();

    return plan;
  }

  // ─── Safety Features (5B) ──────────────────────────────────────────

  /**
   * Set a safety contact for a date plan.
   */
  static async setSafetyContact(userId, planId, contactName, contactPhone) {
    const plan = await DatePlan.findById(planId);
    if (!plan) {
      const error = new Error('Date plan not found');
      error.statusCode = 404;
      throw error;
    }

    const match = await Match.findById(plan.matchId);
    if (!match || !match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }

    plan.safetyContact = { name: contactName, phone: contactPhone };
    await plan.save();

    return plan;
  }

  /**
   * Enable/disable location sharing for a date.
   */
  static async toggleLocationSharing(userId, planId, enabled) {
    const plan = await DatePlan.findById(planId);
    if (!plan) {
      const error = new Error('Date plan not found');
      error.statusCode = 404;
      throw error;
    }

    const match = await Match.findById(plan.matchId);
    if (!match || !match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }

    if (enabled) {
      plan.locationSharing = {
        enabled: true,
        enabledBy: userId,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
      };
    } else {
      plan.locationSharing = { enabled: false };
    }
    await plan.save();

    return plan;
  }

  /**
   * Submit a check-in during an active date.
   */
  static async submitCheckIn(userId, planId, status, coordinates) {
    const plan = await DatePlan.findById(planId);
    if (!plan) {
      const error = new Error('Date plan not found');
      error.statusCode = 404;
      throw error;
    }

    if (plan.status !== 'accepted') {
      const error = new Error('Can only check in on accepted dates');
      error.statusCode = 409;
      throw error;
    }

    const match = await Match.findById(plan.matchId);
    if (!match || !match.users.some((u) => u.toString() === userId.toString())) {
      const error = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }

    const checkIn = {
      userId,
      status,
      timestamp: new Date(),
      location: coordinates ? { coordinates } : undefined,
    };

    plan.checkIns.push(checkIn);
    await plan.save();

    // If status is 'help' and safety contact exists, log alert
    if (status === 'help' && plan.safetyContact?.phone) {
      logger.warn(`SAFETY ALERT: user=${userId}, plan=${planId}, contact=${plan.safetyContact.phone}`);
      // In production, send SMS via Twilio here
    }

    return plan;
  }

  /**
   * Suggest venue ideas (AI-powered, with rule-based fallback).
   */
  static async suggestVenues(userId, matchId) {
    const match = await Match.findById(matchId).populate('users', 'firstName location');
    if (!match || !match.users.some((u) => u._id.toString() === userId.toString())) {
      const error = new Error('Match not found');
      error.statusCode = 404;
      throw error;
    }

    // Default venue suggestions by type
    const suggestions = [
      { name: 'A cozy coffee shop', type: 'coffee', reason: 'Great for a first meet — relaxed and easy to leave if needed' },
      { name: 'A neighbourhood walk', type: 'walk', reason: 'Low-pressure and you can talk naturally side by side' },
      { name: 'A casual dinner spot', type: 'dinner', reason: 'Perfect for getting to know each other over a meal' },
      { name: 'A fun activity together', type: 'activity', reason: 'Shared experiences create stronger bonds' },
      { name: 'Drinks at a quiet bar', type: 'drinks', reason: 'Relaxed evening vibes, easy conversation' },
    ];

    // Try AI-enhanced suggestions
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const user1 = match.users[0];
      const user2 = match.users[1];
      const city = user1?.location?.city || user2?.location?.city || 'your city';

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `You suggest date venues. Return JSON array of 5 objects with: name (specific venue idea), type (coffee/dinner/activity/walk/drinks), reason (1 sentence why this works). City: ${city}. Keep it practical and fun.`,
        }],
        max_tokens: 300,
        temperature: 0.8,
      });

      const parsed = JSON.parse(completion.choices[0].message.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      logger.debug('AI venue suggestion fell back to defaults:', err.message);
    }

    return suggestions;
  }
}

module.exports = DatePlanService;
