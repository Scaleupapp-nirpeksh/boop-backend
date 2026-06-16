const Answer = require('../models/Answer');
const Question = require('../models/Question');
const CompatibilityService = require('./compatibility.service');

// MARK: - Answer Sync Service

/**
 * Privacy-safe "how two users answer the same questions" analysis.
 *
 * Reuses CompatibilityService._questionSimilarity per common question, buckets
 * each by sync level, and (in summarize/getSync) adds a batched, cached,
 * privacy-safe LLM summary layer. The wire payload NEVER includes a user's raw
 * answer text/options — only synthesized one-line summaries.
 */

// Ordered sync buckets, strongest first. Thresholds tunable.
const BUCKETS = [
  { key: 'highly_in_sync', label: 'Highly in sync', min: 0.85 },
  { key: 'in_sync',        label: 'In sync',        min: 0.6 },
  { key: 'neutral_ground', label: 'Neutral ground', min: 0.4 },
  { key: 'different_views',label: 'Different views', min: 0.2 },
  { key: 'poles_apart',    label: 'Poles apart',     min: -1 },
];

function bucketFor(similarity) {
  return BUCKETS.find((b) => similarity >= b.min) || BUCKETS[BUCKETS.length - 1];
}

class AnswerSyncService {
  /**
   * Compute the per-question sync level for every question BOTH users answered.
   * Pure of LLM — returns questionNumber, dimension, similarity, syncLevel.
   */
  static async computeBuckets(userIdA, userIdB) {
    const [ansA, ansB] = await Promise.all([
      Answer.find({ userId: userIdA }).select('+embedding').lean(),
      Answer.find({ userId: userIdB }).select('+embedding').lean(),
    ]);
    const mapA = new Map(ansA.map((a) => [a.questionNumber, a]));
    const mapB = new Map(ansB.map((a) => [a.questionNumber, a]));
    const common = [...mapA.keys()].filter((qn) => mapB.has(qn));

    const questions = await Question.find({ questionNumber: { $in: common } }).lean();
    const qMap = new Map(questions.map((q) => [q.questionNumber, q]));

    const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0]));
    const perQuestion = [];
    for (const qn of common) {
      const q = qMap.get(qn);
      if (!q) continue;
      const sim = CompatibilityService._questionSimilarity(q, mapA.get(qn), mapB.get(qn));
      const bucket = bucketFor(sim);
      counts[bucket.key] += 1;
      perQuestion.push({ questionNumber: qn, dimension: q.dimension, similarity: sim, syncLevel: bucket.key });
    }

    return {
      totalCommon: perQuestion.length,
      buckets: BUCKETS.map((b) => ({ key: b.key, label: b.label, count: counts[b.key] })),
      questions: perQuestion,
    };
  }
}

module.exports = AnswerSyncService;
