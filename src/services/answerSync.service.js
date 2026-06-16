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

  /**
   * Verdict phrase from the bucket distribution.
   */
  static verdict(buckets) {
    const c = Object.fromEntries(buckets.map((b) => [b.key, b.count]));
    const total = buckets.reduce((s, b) => s + b.count, 0) || 1;
    const aligned = ((c.highly_in_sync || 0) + (c.in_sync || 0)) / total;
    if (aligned >= 0.7) return 'Mostly in sync';
    if (aligned >= 0.4) return 'Partly in sync';
    return 'You see things differently';
  }

  /**
   * Produce a 1-line neutral summary of EACH person's answer per question.
   * Privacy: returns only synthesized summaries — never the raw answer text.
   * Batched single LLM call; rule-based fallback when llm is disabled/fails.
   */
  static async summarize(perQuestion, questionDocs, mapA, mapB, opts = {}) {
    const qMap = new Map(questionDocs.map((q) => [q.questionNumber, q]));
    const useLLM = opts.llm !== false && process.env.OPENAI_API_KEY;

    const fallback = () => perQuestion.map((p) => {
      const sameSide = p.syncLevel === 'highly_in_sync' || p.syncLevel === 'in_sync';
      return {
        ...p,
        category: qMap.get(p.questionNumber)?.dimension || 'general',
        summaryYou: sameSide ? 'You lean the same way here.' : 'You take your own angle on this.',
        summaryThem: sameSide ? 'They land in the same place.' : 'They see it a little differently.',
      };
    });

    if (!useLLM) return fallback();

    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const items = perQuestion.map((p) => {
        const a = mapA.get(p.questionNumber) || {};
        const b = mapB.get(p.questionNumber) || {};
        const txt = (x) => x.textAnswer || x.selectedOption || (x.selectedOptions || []).join(', ') || '';
        return { n: p.questionNumber, q: qMap.get(p.questionNumber)?.questionText || '', you: txt(a), them: txt(b) };
      });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', temperature: 0.5, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You summarize how two people answered the same question. For each item return a SHORT (max 90 chars) neutral, warm one-liner for "you" and for "them" — paraphrase the gist, NEVER quote them verbatim. Return JSON: { "items": [{ "n": number, "summaryYou": string, "summaryThem": string }] }' },
          { role: 'user', content: JSON.stringify({ items }) },
        ],
      });
      const parsed = JSON.parse(completion.choices[0].message.content);
      const byN = new Map((parsed.items || []).map((i) => [i.n, i]));
      return perQuestion.map((p) => ({
        ...p,
        category: qMap.get(p.questionNumber)?.dimension || 'general',
        summaryYou: byN.get(p.questionNumber)?.summaryYou || 'You shared your take.',
        summaryThem: byN.get(p.questionNumber)?.summaryThem || 'They shared theirs.',
      }));
    } catch (err) {
      return fallback();
    }
  }
}

module.exports = AnswerSyncService;
