const Question = require('../models/Question');
const Answer = require('../models/Answer');
const User = require('../models/User');
const { DIMENSIONS } = require('../utils/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class QuestionService {
  // ─── Get Available Questions ──────────────────────────────────────────

  /**
   * Returns questions that are unlocked for this user and not yet answered.
   * Unlock logic: questions where dayAvailable <= daysSinceRegistration.
   *
   * @param {string} userId
   * @returns {{ questions: Question[], meta: object }}
   */
  static async getAvailableQuestions(userId) {
    return cache.getOrSet(`questions:available:${userId}`, 120, async () => {
      const user = await User.findById(userId);
      if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      const daysSinceRegistration = this._calculateDaysSinceRegistration(user.createdAt);

      const answeredDocs = await Answer.find({ userId }, { questionNumber: 1 });
      const answeredNumbers = new Set(answeredDocs.map((a) => a.questionNumber));

      const questions = await Question.find({
        dayAvailable: { $lte: daysSinceRegistration },
        questionNumber: { $nin: Array.from(answeredNumbers) },
      }).sort({ dayAvailable: 1, order: 1 });

      return {
        questions,
        meta: {
          daysSinceRegistration,
          totalUnlocked: questions.length + answeredNumbers.size,
          totalAnswered: answeredNumbers.size,
          totalRemaining: questions.length,
        },
      };
    });
  }

  // ─── Submit Answer ────────────────────────────────────────────────────

  /**
   * Submit an answer to a question.
   * Validates the answer matches the question type, creates the Answer document,
   * increments the user's questionsAnswered count, and checks for stage advancement.
   *
   * @param {string} userId
   * @param {number} questionNumber
   * @param {object} answerData - { textAnswer?, selectedOption?, selectedOptions?, followUpAnswer?, timeSpent? }
   * @returns {{ answer: Answer, user: User }}
   */
  static async submitAnswer(userId, questionNumber, answerData) {
    // 1. Find the question
    const question = await Question.findOne({ questionNumber });
    if (!question) {
      const error = new Error(`Question ${questionNumber} not found`);
      error.statusCode = 404;
      throw error;
    }

    // 2. Check if user has already answered
    const existing = await Answer.findOne({ userId, questionNumber });
    if (existing) {
      const error = new Error(`You've already answered question ${questionNumber}`);
      error.statusCode = 409;
      throw error;
    }

    // 3. Check if question is unlocked for this user
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const daysSinceRegistration = this._calculateDaysSinceRegistration(user.createdAt);
    if (question.dayAvailable > daysSinceRegistration) {
      const error = new Error(`Question ${questionNumber} is not yet available. Come back on day ${question.dayAvailable}!`);
      error.statusCode = 403;
      throw error;
    }

    // 4. Validate answer matches question type
    this._validateAnswer(question, answerData);

    // 5. Create Answer document
    const answer = await Answer.create({
      userId,
      questionId: question._id,
      questionNumber,
      textAnswer: answerData.textAnswer || null,
      selectedOption: answerData.selectedOption || null,
      selectedOptions: answerData.selectedOptions || [],
      followUpAnswer: answerData.followUpAnswer || null,
      voiceAnswerUrl: answerData.voiceAnswerUrl || null,
      voiceAnswerS3Key: answerData.voiceAnswerS3Key || null,
      transcriptionPending: answerData.transcriptionPending || false,
      timeSpent: answerData.timeSpent || 0,
      submittedAt: new Date(),
    });

    // 6. Increment user's question count and check stage
    user.questionsAnswered = (user.questionsAnswered || 0) + 1;

    // Stage advancement: questions_pending → ready at 15+ answers
    if (user.profileStage === 'questions_pending' && user.questionsAnswered >= 15) {
      user.profileStage = 'ready';
      logger.info(`User ${userId} stage: questions_pending → ready (${user.questionsAnswered} answers)`);
    }

    await user.save();

    // Invalidate caches affected by new answer
    cache.invalidate(`questions:available:${userId}`);
    cache.invalidate(`showcase:${userId}:3`);
    cache.invalidate(`showcase:${userId}:6`);
    cache.invalidatePattern(`compat:*${userId}*`);

    // Enqueue embedding generation for text answers
    if (answerData.textAnswer && answerData.textAnswer.trim().length > 0) {
      try {
        const { getEmbeddingQueue } = require('../config/queue');
        const queue = getEmbeddingQueue();
        if (queue) {
          await queue.add({ answerId: answer._id.toString() });
        } else {
          // Fallback: generate inline if queue unavailable
          const EmbeddingService = require('./embedding.service');
          const embedding = await EmbeddingService.generateEmbedding(answerData.textAnswer);
          if (embedding) {
            await Answer.updateOne({ _id: answer._id }, { $set: { embedding } });
          }
        }
      } catch (err) {
        logger.warn('Embedding generation skipped:', err.message);
      }
    }

    // Trigger personality analysis at milestones
    try {
      const PersonalityService = require('./personality.service');
      PersonalityService.checkAndTriggerAnalysis(userId, user.questionsAnswered);
    } catch (err) {
      logger.warn('Personality analysis trigger skipped:', err.message);
    }

    // Proactive match recalculation at milestones
    const recalcMilestones = [6, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
    if (recalcMilestones.includes(user.questionsAnswered)) {
      try {
        const Match = require('../models/Match');
        const CompatibilityService = require('./compatibility.service');
        const activeMatches = await Match.find({
          users: userId,
          isActive: true,
        }).select('users').lean();

        for (const match of activeMatches) {
          const otherId = match.users.find((u) => u.toString() !== userId.toString());
          if (otherId) {
            // Fire-and-forget: recalculate in background
            CompatibilityService.calculateCompatibility(userId, otherId).catch(() => {});
          }
        }
        logger.info(`Match recalculation triggered for user=${userId} at milestone=${user.questionsAnswered}, ${activeMatches.length} matches`);
      } catch (err) {
        logger.warn('Match recalculation skipped:', err.message);
      }
    }

    logger.debug(`Answer submitted: user=${userId}, q=${questionNumber}, total=${user.questionsAnswered}`);
    return { answer, user };
  }

  // ─── Get User Progress ────────────────────────────────────────────────

  /**
   * Returns the user's question-answering progress with dimension breakdown.
   *
   * @param {string} userId
   * @returns {object} Progress data
   */
  static async getUserProgress(userId) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const daysSinceRegistration = this._calculateDaysSinceRegistration(user.createdAt);

    // Total questions unlocked so far
    const totalUnlocked = await Question.countDocuments({
      dayAvailable: { $lte: daysSinceRegistration },
    });

    // Total answered
    const totalAnswered = await Answer.countDocuments({ userId });

    // Breakdown by dimension
    const dimensionProgress = {};
    const dimensionKeys = Object.values(DIMENSIONS);

    for (const dim of dimensionKeys) {
      const totalForDim = await Question.countDocuments({
        dimension: dim,
        dayAvailable: { $lte: daysSinceRegistration },
      });

      // Get answered question IDs for this dimension
      const dimQuestions = await Question.find({
        dimension: dim,
        dayAvailable: { $lte: daysSinceRegistration },
      }, { questionNumber: 1 });

      const dimQuestionNumbers = dimQuestions.map((q) => q.questionNumber);

      const answeredForDim = await Answer.countDocuments({
        userId,
        questionNumber: { $in: dimQuestionNumbers },
      });

      dimensionProgress[dim] = {
        answered: answeredForDim,
        unlocked: totalForDim,
        total: await Question.countDocuments({ dimension: dim }),
      };
    }

    return {
      totalAnswered,
      totalUnlocked,
      totalQuestions: 60,
      daysSinceRegistration,
      profileStage: user.profileStage,
      readyThreshold: 15,
      isReady: totalAnswered >= 15,
      dimensions: dimensionProgress,
    };
  }

  // ─── Answer History ──────────────────────────────────────────────────

  /**
   * Returns all answered questions for a user, joined with question data.
   * Grouped by dimension, sorted by submittedAt desc.
   *
   * @param {string} userId
   * @returns {{ history: object[], groupedByDimension: object }}
   */
  static async getAnswerHistory(userId) {
    const answers = await Answer.find({ userId })
      .sort({ submittedAt: -1 })
      .lean();

    if (answers.length === 0) {
      return { history: [], groupedByDimension: {} };
    }

    // Fetch question metadata for all answered questions
    const questionNumbers = answers.map((a) => a.questionNumber);
    const questions = await Question.find({
      questionNumber: { $in: questionNumbers },
    }).lean();
    const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

    const history = answers.map((answer) => {
      const question = questionMap.get(answer.questionNumber) || {};
      return {
        id: answer._id,
        questionNumber: answer.questionNumber,
        questionText: question.questionText || '',
        dimension: question.dimension || 'unknown',
        questionType: question.questionType || 'text',
        textAnswer: answer.textAnswer,
        selectedOption: answer.selectedOption,
        selectedOptions: answer.selectedOptions,
        followUpAnswer: answer.followUpAnswer,
        submittedAt: answer.submittedAt,
      };
    });

    // Group by dimension
    const groupedByDimension = {};
    for (const item of history) {
      if (!groupedByDimension[item.dimension]) {
        groupedByDimension[item.dimension] = [];
      }
      groupedByDimension[item.dimension].push(item);
    }

    return { history, groupedByDimension };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Calculate days since registration (Day 1 = registration day).
   * Uses IST timezone (Asia/Kolkata, UTC+5:30) for consistent midnight boundary.
   * @private
   */
  static _calculateDaysSinceRegistration(createdAt) {
    // Use IST (UTC+5:30) for consistent midnight calculation
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

    const nowIST = new Date(Date.now() + IST_OFFSET_MS);
    const createdIST = new Date(new Date(createdAt).getTime() + IST_OFFSET_MS);

    // Floor to midnight IST using UTC methods (since we've already shifted)
    const nowMidnight = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()));
    const createdMidnight = new Date(Date.UTC(createdIST.getUTCFullYear(), createdIST.getUTCMonth(), createdIST.getUTCDate()));

    const diffMs = nowMidnight - createdMidnight;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Day 1 = registration day, Day 2 = next day, etc.
    return diffDays + 1;
  }

  /**
   * Validate that the answer data matches the question type
   * @private
   */
  static _validateAnswer(question, answerData) {
    switch (question.questionType) {
      case 'text':
        if (!answerData.textAnswer || answerData.textAnswer.trim().length === 0) {
          const error = new Error('A text answer is required for this question');
          error.statusCode = 400;
          throw error;
        }
        if (answerData.textAnswer.length > (question.characterLimit || 500)) {
          const error = new Error(`Answer exceeds the ${question.characterLimit || 500} character limit`);
          error.statusCode = 400;
          throw error;
        }
        break;

      case 'single_choice':
        if (!answerData.selectedOption) {
          const error = new Error('Please select an option');
          error.statusCode = 400;
          throw error;
        }
        if (question.options.length > 0 && !question.options.includes(answerData.selectedOption)) {
          const error = new Error('Selected option is not valid for this question');
          error.statusCode = 400;
          throw error;
        }
        break;

      case 'multiple_choice':
        if (!answerData.selectedOptions || answerData.selectedOptions.length === 0) {
          const error = new Error('Please select at least one option');
          error.statusCode = 400;
          throw error;
        }
        if (question.options.length > 0) {
          const invalid = answerData.selectedOptions.filter(
            (opt) => !question.options.includes(opt)
          );
          if (invalid.length > 0) {
            const error = new Error(`Invalid options: ${invalid.join(', ')}`);
            error.statusCode = 400;
            throw error;
          }
        }
        break;

      default:
        break;
    }
  }
}

module.exports = QuestionService;
