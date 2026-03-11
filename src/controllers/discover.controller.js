const asyncHandler = require('../utils/asyncHandler');
const DiscoverService = require('../services/discover.service');

// MARK: - Discover Controller

/**
 * @desc    Get discovery candidates for the current user
 * @route   GET /api/v1/discover
 * @access  Private (requires complete profile)
 */
const getCandidates = asyncHandler(async (req, res) => {
  const { limit, maxDistanceKm } = req.query;

  const candidates = await DiscoverService.getCandidates(req.user._id, {
    limit: limit ? parseInt(limit, 10) : 10,
    maxDistanceKm: maxDistanceKm ? parseFloat(maxDistanceKm) : null,
  });

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${candidates.length} candidates found`,
    data: { candidates },
  });
});

/**
 * @desc    Like a user (potential match)
 * @route   POST /api/v1/discover/like
 * @access  Private (requires complete profile)
 */
const likeUser = asyncHandler(async (req, res) => {
  const { targetUserId, note } = req.body;

  const result = await DiscoverService.likeUser(
    req.user._id,
    targetUserId,
    { note }
  );

  const statusCode = result.isMutual ? 201 : 200;
  const message = result.isMutual
    ? "It's a match! You both liked each other."
    : 'Like recorded';

  res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data: {
      isMutual: result.isMutual,
      match: result.match
        ? {
            matchId: result.match._id,
            compatibilityScore: result.match.compatibilityScore,
            matchTier: result.match.matchTier,
          }
        : null,
    },
  });
});

/**
 * @desc    Pass on a user
 * @route   POST /api/v1/discover/pass
 * @access  Private (requires complete profile)
 */
const passUser = asyncHandler(async (req, res) => {
  const { targetUserId } = req.body;

  await DiscoverService.passUser(req.user._id, targetUserId);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Pass recorded',
    data: null,
  });
});

/**
 * @desc    Get discovery dashboard statistics
 * @route   GET /api/v1/discover/stats
 * @access  Private (requires complete profile)
 */
const getStats = asyncHandler(async (req, res) => {
  const stats = await DiscoverService.getStats(req.user._id);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Stats retrieved',
    data: stats,
  });
});

/**
 * @desc    Get pending discovery states
 * @route   GET /api/v1/discover/pending
 * @access  Private (requires complete profile)
 */
const getPendingLikes = asyncHandler(async (req, res) => {
  const result = await DiscoverService.getPendingLikes(req.user._id);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Pending discovery states retrieved',
    data: result,
  });
});

/**
 * @desc    Get AI-suggested notes for a like
 * @route   GET /api/v1/discover/suggest-note/:targetUserId
 * @access  Private (requires complete profile)
 */
const suggestNote = async (req, res, next) => {
  try {
    const { targetUserId } = req.params;
    const userId = req.user.id;

    // Get both users' question answers
    const Answer = require('../models/Answer');
    const Question = require('../models/Question');

    const [userAnswers, targetAnswers] = await Promise.all([
      Answer.find({ userId }).limit(20).lean(),
      Answer.find({ userId: targetUserId }).limit(20).lean(),
    ]);

    // Get question texts for context
    const allQuestionNumbers = [
      ...userAnswers.map((a) => a.questionNumber),
      ...targetAnswers.map((a) => a.questionNumber),
    ];
    const questions = await Question.find({
      questionNumber: { $in: allQuestionNumbers },
    }).lean();
    const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

    const userContext = userAnswers
      .map((a) => {
        const q = questionMap.get(a.questionNumber);
        const answer = a.textAnswer || a.selectedOption || (a.selectedOptions || []).join(', ');
        return `Q: ${q?.questionText || 'Question'} A: ${answer}`;
      })
      .join('\n');
    const targetContext = targetAnswers
      .map((a) => {
        const q = questionMap.get(a.questionNumber);
        const answer = a.textAnswer || a.selectedOption || (a.selectedOptions || []).join(', ');
        return `Q: ${q?.questionText || 'Question'} A: ${answer}`;
      })
      .join('\n');

    // Try AI suggestion
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are helping someone write a warm, genuine first message on a dating app called Boop. The app focuses on personality and compatibility over appearance. Generate 3 short, personal opening notes (max 150 chars each) that reference shared interests or complementary traits from their answers. Be warm, specific, and authentic — not generic pickup lines. Return JSON: { "suggestions": [{ "text": "...", "reason": "..." }] }`,
          },
          {
            role: 'user',
            content: `My answers:\n${userContext}\n\nTheir answers:\n${targetContext}`,
          },
        ],
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return res.json({ suggestions: result.suggestions || [] });
    } catch (aiError) {
      // Fallback: generic suggestions
      return res.json({
        suggestions: [
          {
            text: "Your answers really resonated with me — especially about what matters most in connection.",
            reason: 'Generic but warm',
          },
          {
            text: "I love how thoughtful your responses are. I think we'd have great conversations!",
            reason: 'Compliment their depth',
          },
          {
            text: "Something about your profile feels genuine. I'd love to get to know you better.",
            reason: 'Authenticity focus',
          },
        ],
      });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCandidates,
  getStats,
  getPendingLikes,
  likeUser,
  passUser,
  suggestNote,
};
