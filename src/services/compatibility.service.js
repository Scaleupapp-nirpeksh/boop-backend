const Answer = require('../models/Answer');
const Question = require('../models/Question');
const { DIMENSION_WEIGHTS, MATCH_TIERS } = require('../utils/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

// MARK: - Compatibility Service

/**
 * Compares two users' answers across 8 psychological dimensions
 * and produces a 0-100 compatibility score with tier classification.
 *
 * Similarity algorithms:
 * - single_choice: Exact match (1.0 or 0.0)
 * - multiple_choice: Jaccard similarity (intersection / union)
 * - text: Cosine similarity on embeddings (fallback: keyword overlap)
 */
class CompatibilityService {
  /**
   * Calculate compatibility score between two users.
   * @param {string} userIdA
   * @param {string} userIdB
   * @returns {{ score: number, tier: string, tierLabel: string, dimensions: Object }}
   */
  static async calculateCompatibility(userIdA, userIdB) {
    // Sorted key ensures A↔B and B↔A hit the same cache entry
    const sortedIds = [userIdA.toString(), userIdB.toString()].sort().join(':');
    return cache.getOrSet(`compat:${sortedIds}`, 600, () =>
      this._computeCompatibility(userIdA, userIdB)
    );
  }

  /**
   * Internal: compute compatibility without caching.
   * @private
   */
  static async _computeCompatibility(userIdA, userIdB) {
    // 1. Fetch all answers for both users (include embeddings for text scoring)
    const [answersA, answersB] = await Promise.all([
      Answer.find({ userId: userIdA }).select('+embedding').lean(),
      Answer.find({ userId: userIdB }).select('+embedding').lean(),
    ]);

    // 2. Build lookup maps: questionNumber -> answer
    const mapA = new Map(answersA.map((a) => [a.questionNumber, a]));
    const mapB = new Map(answersB.map((a) => [a.questionNumber, a]));

    // 3. Find commonly answered question numbers
    const commonQuestions = [...mapA.keys()].filter((qn) => mapB.has(qn));

    if (commonQuestions.length === 0) {
      // Cannot compute — return a neutral default
      return {
        score: 50,
        tier: 'bronze',
        tierLabel: MATCH_TIERS.BRONZE.label,
        dimensions: {},
      };
    }

    // 4. Fetch question metadata for common questions (dimension + weight)
    const questions = await Question.find({
      questionNumber: { $in: commonQuestions },
    }).lean();

    const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

    // 5. Score per dimension
    const dimensionScores = {};
    const dimensionCounts = {};

    for (const qn of commonQuestions) {
      const question = questionMap.get(qn);
      if (!question) continue;

      const ansA = mapA.get(qn);
      const ansB = mapB.get(qn);
      const dim = question.dimension;
      const weight = question.weight || 1.0;

      // Calculate similarity for this question
      const similarity = this._questionSimilarity(question, ansA, ansB);

      if (!dimensionScores[dim]) {
        dimensionScores[dim] = 0;
        dimensionCounts[dim] = 0;
      }

      dimensionScores[dim] += similarity * weight;
      dimensionCounts[dim] += weight;
    }

    // 6. Normalize per-dimension scores to 0-100
    const normalizedDimensions = {};
    for (const dim of Object.keys(dimensionScores)) {
      if (dimensionCounts[dim] > 0) {
        normalizedDimensions[dim] = Math.round(
          (dimensionScores[dim] / dimensionCounts[dim]) * 100
        );
      }
    }

    // 7. Compute weighted overall score
    let weightedSum = 0;
    let weightSum = 0;

    for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
      if (normalizedDimensions[dim] !== undefined) {
        weightedSum += normalizedDimensions[dim] * weight;
        weightSum += weight;
      }
    }

    // Normalize by actual weights used (handles missing dimensions)
    const overallScore =
      weightSum > 0 ? Math.round(weightedSum / weightSum) : 50;

    // 8. Determine tier
    const { tier, tierLabel } = this._scoreTier(overallScore);

    logger.debug(
      `Compatibility: ${userIdA} <-> ${userIdB} = ${overallScore} (${tier}), ${commonQuestions.length} common questions`
    );

    return {
      score: overallScore,
      tier,
      tierLabel,
      dimensions: normalizedDimensions,
    };
  }

  /**
   * Compute similarity (0.0 - 1.0) for a single question's answers.
   * @private
   */
  static _questionSimilarity(question, ansA, ansB) {
    switch (question.questionType) {
      case 'single_choice': {
        // Exact match = 1.0, else 0.0
        return ansA.selectedOption === ansB.selectedOption ? 1.0 : 0.0;
      }

      case 'multiple_choice': {
        // Jaccard similarity: intersection / union
        const setA = new Set(ansA.selectedOptions || []);
        const setB = new Set(ansB.selectedOptions || []);
        if (setA.size === 0 && setB.size === 0) return 1.0;
        const intersection = [...setA].filter((x) => setB.has(x)).length;
        const union = new Set([...setA, ...setB]).size;
        return union > 0 ? intersection / union : 0.0;
      }

      case 'text': {
        // Use embeddings if both answers have them (semantic similarity)
        if (ansA.embedding && ansB.embedding) {
          const EmbeddingService = require('./embedding.service');
          return EmbeddingService.cosineSimilarity(ansA.embedding, ansB.embedding);
        }
        // Fallback: keyword overlap (Jaccard similarity)
        const wordsA = this._extractKeywords(ansA.textAnswer || '');
        const wordsB = this._extractKeywords(ansB.textAnswer || '');
        if (wordsA.length === 0 && wordsB.length === 0) return 0.5;
        const setA = new Set(wordsA);
        const setB = new Set(wordsB);
        const intersection = [...setA].filter((x) => setB.has(x)).length;
        const union = new Set([...setA, ...setB]).size;
        return union > 0 ? intersection / union : 0.0;
      }

      default:
        return 0.5;
    }
  }

  /**
   * Extract lowercased keywords from text (remove stopwords, short words).
   * @private
   */
  static _extractKeywords(text) {
    const stopwords = new Set([
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
      'they', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'is', 'am', 'are', 'was', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'can', 'not', 'no', 'so', 'if', 'that',
      'this', 'just', 'very', 'really', 'also', 'too', 'more', 'much',
      'like', 'think', 'know', 'want', 'need', 'feel', 'make', 'get',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w));
  }

  /**
   * Map a score to a tier using MATCH_TIERS from constants.
   * @private
   */
  static _scoreTier(score) {
    if (score >= MATCH_TIERS.PLATINUM.min) {
      return { tier: 'platinum', tierLabel: MATCH_TIERS.PLATINUM.label };
    }
    if (score >= MATCH_TIERS.GOLD.min) {
      return { tier: 'gold', tierLabel: MATCH_TIERS.GOLD.label };
    }
    if (score >= MATCH_TIERS.SILVER.min) {
      return { tier: 'silver', tierLabel: MATCH_TIERS.SILVER.label };
    }
    // Bronze or below — label as bronze
    return { tier: 'bronze', tierLabel: MATCH_TIERS.BRONZE.label };
  }
}

module.exports = CompatibilityService;
