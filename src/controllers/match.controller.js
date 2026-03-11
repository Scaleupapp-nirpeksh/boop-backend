const asyncHandler = require('../utils/asyncHandler');
const MatchService = require('../services/match.service');

// MARK: - Match Controller

/**
 * @desc    Get user's matches with optional stage filter
 * @route   GET /api/v1/matches
 * @access  Private (requires complete profile)
 */
const getMatches = asyncHandler(async (req, res) => {
  const { stage, page, limit } = req.query;

  const result = await MatchService.getMatches(req.user._id, {
    stage: stage || null,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  });

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${result.matches.length} matches found`,
    data: result,
  });
});

/**
 * @desc    Get a single match detail
 * @route   GET /api/v1/matches/:matchId
 * @access  Private (requires complete profile)
 */
const getMatchById = asyncHandler(async (req, res) => {
  const match = await MatchService.getMatchById(
    req.user._id,
    req.params.matchId
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Match retrieved',
    data: match,
  });
});

/**
 * @desc    Advance match to next stage
 * @route   PATCH /api/v1/matches/:matchId/advance
 * @access  Private (requires complete profile)
 */
const advanceStage = asyncHandler(async (req, res) => {
  const result = await MatchService.advanceStage(
    req.user._id,
    req.params.matchId
  );

  // Emit socket event to other user
  try {
    const socketManager = require('../config/socket');
    const Match = require('../models/Match');
    const match = await Match.findById(req.params.matchId);
    if (match) {
      const otherUserId = match.getOtherUserId(req.user._id);
      socketManager.emitToUser(otherUserId.toString(), 'match:stage_changed', {
        matchId: result.matchId,
        stage: result.stage,
      });
    }
  } catch (_) {
    // Non-critical: socket emit failure doesn't block response
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `Match advanced to "${result.stage}"`,
    data: result,
  });
});

/**
 * @desc    Archive a match
 * @route   PATCH /api/v1/matches/:matchId/archive
 * @access  Private (requires complete profile)
 */
const archiveMatch = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const result = await MatchService.archiveMatch(
    req.user._id,
    req.params.matchId,
    reason
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Match archived',
    data: result,
  });
});

/**
 * @desc    Request photo reveal
 * @route   POST /api/v1/matches/:matchId/reveal
 * @access  Private (requires complete profile)
 */
const requestReveal = asyncHandler(async (req, res) => {
  const result = await MatchService.requestReveal(
    req.user._id,
    req.params.matchId
  );

  // Emit socket events
  try {
    const socketManager = require('../config/socket');

    if (result.bothRevealed) {
      // Notify both users that photos are now visible
      socketManager.emitToUser(result.otherUserId.toString(), 'match:revealed', {
        matchId: result.matchId,
      });
      socketManager.emitToUser(req.user._id.toString(), 'match:revealed', {
        matchId: result.matchId,
      });
    } else {
      // Notify the other user about the reveal request
      socketManager.emitToUser(result.otherUserId.toString(), 'match:reveal_request', {
        matchId: result.matchId,
        requestedBy: req.user._id,
        requestedByName: req.user.firstName,
      });
    }
  } catch (_) {
    // Non-critical
  }

  const statusCode = result.bothRevealed ? 201 : 200;
  const message = result.bothRevealed
    ? 'Photos revealed! You can now see each other.'
    : 'Reveal request sent. Waiting for the other person.';

  res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data: result,
  });
});

/**
 * @desc    Get comfort score for a match
 * @route   GET /api/v1/matches/:matchId/comfort
 * @access  Private (requires complete profile)
 */
const getComfortScore = asyncHandler(async (req, res) => {
  const ComfortService = require('../services/comfort.service');

  // Verify user is part of this match
  const Match = require('../models/Match');
  const match = await Match.findOne({
    _id: req.params.matchId,
    users: req.user._id,
    isActive: true,
  });

  if (!match) {
    const error = new Error('Match not found');
    error.statusCode = 404;
    throw error;
  }

  const result = await ComfortService.calculateComfortScore(req.params.matchId);

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Comfort score calculated',
    data: result,
  });
});

/**
 * @desc    Get date readiness score for a match
 * @route   GET /api/v1/matches/:matchId/date-readiness
 * @access  Private (requires complete profile)
 */
const getDateReadiness = asyncHandler(async (req, res) => {
  const result = await MatchService.calculateDateReadiness(
    req.user._id,
    req.params.matchId
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: result.isReady ? 'You two are ready for a date!' : 'Not quite ready yet — keep building your connection',
    data: result,
  });
});

/**
 * @desc    Get score history snapshots for a match
 * @route   GET /api/v1/matches/:matchId/score-history
 * @access  Private (requires complete profile)
 */
const getScoreHistory = asyncHandler(async (req, res) => {
  const Match = require('../models/Match');
  const ScoreSnapshot = require('../models/ScoreSnapshot');

  const match = await Match.findOne({
    _id: req.params.matchId,
    users: req.user._id,
    isActive: true,
  });

  if (!match) {
    const error = new Error('Match not found');
    error.statusCode = 404;
    throw error;
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const snapshots = await ScoreSnapshot.find({ matchId: req.params.matchId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: `${snapshots.length} score snapshots found`,
    data: {
      matchId: req.params.matchId,
      snapshots: snapshots.reverse(), // chronological order
      currentScores: {
        comfort: match.comfortScore,
        compatibility: match.compatibilityScore,
        matchTier: match.matchTier,
      },
    },
  });
});

/**
 * @desc    Get AI-powered relationship insights for a match
 * @route   GET /api/v1/matches/:matchId/insights
 * @access  Private (requires complete profile)
 */
const getRelationshipInsights = asyncHandler(async (req, res) => {
  const Match = require('../models/Match');
  const Game = require('../models/Game');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const Answer = require('../models/Answer');
  const User = require('../models/User');

  const match = await Match.findOne({
    _id: req.params.matchId,
    users: req.user._id,
    isActive: true,
  });

  if (!match) {
    const error = new Error('Match not found');
    error.statusCode = 404;
    throw error;
  }

  const otherUserId = match.getOtherUserId(req.user._id);

  // Gather data for AI analysis
  const [games, conversation, user1, user2] = await Promise.all([
    Game.find({ matchId: req.params.matchId, status: 'completed' }).lean(),
    Conversation.findOne({ matchId: req.params.matchId }),
    User.findById(req.user._id).select('firstName').lean(),
    User.findById(otherUserId).select('firstName').lean(),
  ]);

  const messages = conversation
    ? await Message.find({ conversationId: conversation._id, isDeleted: false })
        .select('senderId type content.text createdAt')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    : [];

  // Build game summary
  const gameSummary = games.map(g => ({
    type: g.gameType,
    rounds: g.rounds.map(r => ({
      prompt: r.prompt?.text,
      responses: r.responses.map(resp => ({
        userId: resp.userId.toString(),
        answer: resp.answer,
      })),
      isComplete: r.isComplete,
    })),
    completedAt: g.completedAt,
  }));

  // Build messaging summary
  const user1Id = req.user._id.toString();
  const user2Id = otherUserId.toString();
  const user1Msgs = messages.filter(m => m.senderId.toString() === user1Id).length;
  const user2Msgs = messages.filter(m => m.senderId.toString() === user2Id).length;
  const totalMessages = messages.length;

  const activeDays = new Set(messages.map(m => new Date(m.createdAt).toISOString().split('T')[0])).size;

  // Dimension scores
  const dimensionScores = match.dimensionScores ? Object.fromEntries(match.dimensionScores) : {};

  // Build the prompt for OpenAI
  const analysisData = {
    user1Name: user1?.firstName || 'User 1',
    user2Name: user2?.firstName || 'User 2',
    compatibilityScore: match.compatibilityScore,
    matchTier: match.matchTier,
    comfortScore: match.comfortScore,
    dimensionScores,
    stage: match.stage,
    gamesPlayed: games.length,
    gameSummary: gameSummary.slice(0, 5), // Last 5 games
    messagingStats: { total: totalMessages, user1: user1Msgs, user2: user2Msgs, activeDays },
    matchedAt: match.matchedAt,
  };

  // Try OpenAI, fallback to rule-based
  let insights;
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `You are a relationship psychologist analyzing a dating connection. Be warm, insightful, and specific. Use the users' first names. Return JSON with this exact structure:
{
  "overallSummary": "2-3 sentence overview of the connection",
  "strengths": [{"title": "short title", "detail": "1-2 sentence explanation"}],
  "growthAreas": [{"title": "short title", "detail": "1-2 sentence actionable advice"}],
  "gameInsights": "1-2 sentences about what their game answers reveal (or null if no games)",
  "communicationStyle": "1-2 sentences about their messaging patterns",
  "nextSteps": ["actionable suggestion 1", "actionable suggestion 2", "actionable suggestion 3"]
}`
        },
        {
          role: 'user',
          content: `Analyze this connection:\n${JSON.stringify(analysisData, null, 2)}`
        }
      ],
      response_format: { type: 'json_object' },
    });

    insights = JSON.parse(completion.choices[0].message.content);
    insights.source = 'ai';
  } catch (aiError) {
    const logger = require('../utils/logger');
    logger.error('AI insights generation failed, using rule-based fallback:', aiError.message);

    // Rule-based fallback
    const strengths = [];
    const growthAreas = [];

    // Analyze dimension scores
    const sortedDimensions = Object.entries(dimensionScores).sort((a, b) => b[1] - a[1]);
    const dimensionLabels = {
      emotional_vulnerability: 'Emotional openness',
      attachment_patterns: 'Attachment compatibility',
      life_vision: 'Shared life vision',
      conflict_resolution: 'Conflict handling',
      love_expression: 'Love language alignment',
      intimacy_comfort: 'Intimacy comfort',
      lifestyle_rhythm: 'Lifestyle compatibility',
      growth_mindset: 'Growth orientation',
    };

    sortedDimensions.slice(0, 3).forEach(([dim, score]) => {
      strengths.push({
        title: dimensionLabels[dim] || dim,
        detail: `You scored ${Math.round(score)}/100 here — this is a strong foundation for your connection.`,
      });
    });

    sortedDimensions.slice(-2).forEach(([dim, score]) => {
      growthAreas.push({
        title: dimensionLabels[dim] || dim,
        detail: `At ${Math.round(score)}/100, this area has room to grow. Try discussing topics related to ${dim.replace(/_/g, ' ')} to deepen understanding.`,
      });
    });

    // Messaging balance
    if (totalMessages > 0 && user1Msgs > 0 && user2Msgs > 0) {
      const ratio = Math.min(user1Msgs, user2Msgs) / Math.max(user1Msgs, user2Msgs);
      if (ratio > 0.7) {
        strengths.push({ title: 'Balanced communication', detail: 'You both contribute equally to conversations — a great sign of mutual interest.' });
      } else {
        growthAreas.push({ title: 'Communication balance', detail: 'One person is messaging more than the other. Try to match each other\'s energy.' });
      }
    }

    insights = {
      overallSummary: `${user1?.firstName || 'You'} and ${user2?.firstName || 'your match'} have a ${match.matchTier} connection with ${match.compatibilityScore}% compatibility. ${games.length > 0 ? `You've played ${games.length} game${games.length > 1 ? 's' : ''} together.` : 'Try playing some games to deepen the connection.'}`,
      strengths,
      growthAreas,
      gameInsights: games.length > 0 ? `You've completed ${games.length} game${games.length > 1 ? 's' : ''} together, which shows mutual engagement and willingness to be playful.` : null,
      communicationStyle: totalMessages > 0 ? `With ${totalMessages} messages over ${activeDays} active day${activeDays !== 1 ? 's' : ''}, you're ${totalMessages > 30 ? 'building solid momentum' : 'just getting started'}.` : 'Start chatting to build your connection!',
      nextSteps: [
        games.length === 0 ? 'Play your first game together' : 'Try a different game type you haven\'t played yet',
        match.comfortScore < 70 ? 'Keep building comfort through daily conversations' : 'Consider requesting a photo reveal',
        'Share a voice message to add warmth to the connection',
      ],
      source: 'rule_based',
    };
  }

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Relationship insights generated',
    data: {
      matchId: req.params.matchId,
      insights,
      scores: {
        compatibility: match.compatibilityScore,
        comfort: match.comfortScore,
        matchTier: match.matchTier,
      },
      generatedAt: new Date(),
    },
  });
});

/**
 * @desc    Get AI-powered conversation starters for a match
 * @route   GET /api/v1/matches/:matchId/conversation-starters
 * @access  Private (requires complete profile)
 */
const getConversationStarters = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;

    const Match = require('../models/Match');
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const otherUserId = match.users
      .find((u) => u.toString() !== userId)
      ?.toString();
    if (!otherUserId)
      return res.status(403).json({ error: 'Not part of this match' });

    const Answer = require('../models/Answer');
    const Question = require('../models/Question');

    const [userAnswers, otherAnswers] = await Promise.all([
      Answer.find({ userId }).limit(15).lean(),
      Answer.find({ userId: otherUserId }).limit(15).lean(),
    ]);

    // Get question texts for context
    const allQuestionNumbers = [
      ...userAnswers.map((a) => a.questionNumber),
      ...otherAnswers.map((a) => a.questionNumber),
    ];
    const questions = await Question.find({
      questionNumber: { $in: allQuestionNumbers },
    }).lean();
    const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

    const userContext = userAnswers
      .map((a) => {
        const q = questionMap.get(a.questionNumber);
        const answer =
          a.textAnswer ||
          a.selectedOption ||
          (a.selectedOptions || []).join(', ');
        return `Q: ${q?.questionText || 'Question'} A: ${answer}`;
      })
      .join('\n');
    const otherContext = otherAnswers
      .map((a) => {
        const q = questionMap.get(a.questionNumber);
        const answer =
          a.textAnswer ||
          a.selectedOption ||
          (a.selectedOptions || []).join(', ');
        return `Q: ${q?.questionText || 'Question'} A: ${answer}`;
      })
      .join('\n');

    // Get numerology compatibility as an icebreaker
    let numerologyIcebreaker = null;
    try {
      const PersonalityService = require('../services/personality.service');
      const numerologyCompat = await PersonalityService.getNumerologyCompatibility(userId, otherUserId);
      if (numerologyCompat.icebreaker) {
        numerologyIcebreaker = {
          text: numerologyCompat.icebreaker,
          category: 'numerology',
          compatibility: numerologyCompat.compatibility,
        };
      }
    } catch {
      // Numerology is optional — continue without it
    }

    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.85,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You generate conversation starters for two people who just matched on a dating app called Boop. The app is about genuine connection through personality. Generate 4 conversation starters that reference their shared answers, complementary views, or interesting differences. Each should be a question or prompt that sparks real conversation — not small talk. Return JSON: { "starters": [{ "text": "...", "category": "shared_interest" | "deeper_question" | "fun_hypothetical" | "about_their_answer" }] }`,
          },
          {
            role: 'user',
            content: `Person 1 answers:\n${userContext}\n\nPerson 2 answers:\n${otherContext}`,
          },
        ],
      });

      const result = JSON.parse(completion.choices[0].message.content);
      const starters = result.starters || [];
      if (numerologyIcebreaker) {
        starters.push(numerologyIcebreaker);
      }
      return res.json({ starters });
    } catch (aiError) {
      const fallbackStarters = [
          {
            text: "What's something you've been passionate about lately?",
            category: 'deeper_question',
          },
          {
            text: 'If we could do anything together this weekend, what would you pick?',
            category: 'fun_hypothetical',
          },
          {
            text: "What's the best conversation you've had recently?",
            category: 'deeper_question',
          },
          {
            text: "I'm curious — what made you swipe on Boop instead of other apps?",
            category: 'about_their_answer',
          },
        ];
      if (numerologyIcebreaker) {
        fallbackStarters.push(numerologyIcebreaker);
      }
      return res.json({ starters: fallbackStarters });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMatches,
  getMatchById,
  advanceStage,
  archiveMatch,
  requestReveal,
  getComfortScore,
  getDateReadiness,
  getScoreHistory,
  getRelationshipInsights,
  getConversationStarters,
};
