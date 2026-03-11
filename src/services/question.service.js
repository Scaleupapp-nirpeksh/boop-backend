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

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Calculate days since registration (Day 1 = registration day)
   * @private
   */
  static _calculateDaysSinceRegistration(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);

    // Set both to midnight for accurate day calculation
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const createdMidnight = new Date(created.getFullYear(), created.getMonth(), created.getDate());

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
