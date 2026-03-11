const PersonalityAnalysis = require('../models/PersonalityAnalysis');
const Answer = require('../models/Answer');
const Question = require('../models/Question');
const User = require('../models/User');
const logger = require('../utils/logger');

// Analysis milestones — personality is recalculated at each of these
const MILESTONES = [6, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

// Facet keys for the analysis
const FACET_KEYS = [
  'emotional_style',
  'communication',
  'love_language',
  'conflict_approach',
  'lifestyle',
  'growth_orientation',
  'social_energy',
];

class PersonalityService {
  // ─── Check & Trigger ──────────────────────────────────────────────────

  /**
   * Check if a personality analysis should be triggered based on answer count.
   * Called after each answer submission.
   *
   * @param {string} userId
   * @param {number} questionsAnswered - current total answered count
   */
  static async checkAndTriggerAnalysis(userId, questionsAnswered) {
    if (!MILESTONES.includes(questionsAnswered)) return;

    // Check if analysis already exists for this milestone
    const existing = await PersonalityAnalysis.findOne({
      userId,
      triggeredAtCount: questionsAnswered,
      status: { $in: ['pending', 'completed'] },
    });

    if (existing) {
      logger.debug(`Personality analysis already exists for user=${userId} at milestone=${questionsAnswered}`);
      return;
    }

    // Try to enqueue via Bull queue, fallback to inline
    try {
      const { getPersonalityQueue } = require('../config/queue');
      const queue = getPersonalityQueue();
      if (queue) {
        await queue.add({ userId: userId.toString(), milestone: questionsAnswered });
        logger.info(`Personality analysis queued for user=${userId} at milestone=${questionsAnswered}`);
        return;
      }
    } catch (err) {
      logger.warn('Personality queue unavailable, running inline:', err.message);
    }

    // Fallback: run inline (non-blocking)
    this.generateAnalysis(userId, questionsAnswered).catch((err) => {
      logger.error(`Inline personality analysis failed for user=${userId}:`, err.message);
    });
  }

  // ─── Generate Analysis ────────────────────────────────────────────────

  /**
   * Generate a personality analysis using OpenAI GPT-4o.
   *
   * @param {string} userId
   * @param {number} milestone - the answer count that triggered this
   * @returns {PersonalityAnalysis} the completed analysis document
   */
  static async generateAnalysis(userId, milestone) {
    // Create pending record
    const analysis = await PersonalityAnalysis.create({
      userId,
      triggeredAtCount: milestone,
      status: 'pending',
      isPreliminary: milestone < 15,
    });

    try {
      // Fetch user data
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Fetch all answers with question data
      const answers = await Answer.find({ userId }).sort({ questionNumber: 1 }).lean();
      const questionNumbers = answers.map((a) => a.questionNumber);
      const questions = await Question.find({ questionNumber: { $in: questionNumbers } }).lean();
      const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

      // Calculate numerology
      const numerology = this._calculateNumerology(user.dateOfBirth, user.firstName);

      // Build prompt and call OpenAI
      const prompt = this._buildAnalysisPrompt(user, answers, questionMap, numerology, milestone);
      const result = await this._callOpenAI(prompt);

      // Update analysis with results
      analysis.facets = result.facets || [];
      analysis.summary = result.summary || '';
      analysis.personalityType = result.personalityType || 'Unique Individual';
      analysis.numerology = {
        lifePathNumber: numerology.lifePathNumber,
        expressionNumber: numerology.expressionNumber,
        traits: result.numerologyInsights?.traits || numerology.traits,
        description: result.numerologyInsights?.description || '',
      };
      analysis.questionsAnalyzed = answers.length;
      analysis.modelUsed = 'gpt-4o';
      analysis.status = 'completed';
      await analysis.save();

      logger.info(`Personality analysis completed for user=${userId}, type="${analysis.personalityType}"`);
      return analysis;
    } catch (err) {
      analysis.status = 'failed';
      analysis.errorMessage = err.message;
      await analysis.save();
      logger.error(`Personality analysis failed for user=${userId}:`, err.message);
      throw err;
    }
  }

  // ─── Get Latest Analysis ──────────────────────────────────────────────

  /**
   * Get the latest completed personality analysis for a user.
   *
   * @param {string} userId
   * @returns {{ analysis, nextMilestone, questionsUntilNext, isPreliminary }}
   */
  static async getLatestAnalysis(userId) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const analysis = await PersonalityAnalysis.findOne({
      userId,
      status: 'completed',
    })
      .sort({ triggeredAtCount: -1 })
      .lean();

    const answered = user.questionsAnswered || 0;

    // Find next milestone
    const nextMilestone = MILESTONES.find((m) => m > answered) || 60;
    const questionsUntilNext = Math.max(0, nextMilestone - answered);

    return {
      analysis: analysis || null,
      nextMilestone,
      questionsUntilNext,
      isPreliminary: analysis ? analysis.isPreliminary : true,
      totalAnswered: answered,
    };
  }

  // ─── Numerology Calculation ───────────────────────────────────────────

  /**
   * Calculate Life Path Number and Expression Number.
   * @private
   */
  static _calculateNumerology(dateOfBirth, firstName) {
    const result = {
      lifePathNumber: 1,
      expressionNumber: null,
      traits: [],
    };

    // Life Path Number from DOB
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      const month = dob.getMonth() + 1;
      const day = dob.getDate();
      const year = dob.getFullYear();
      result.lifePathNumber = this._reduceToSingleDigit(month + day + year);
    }

    // Expression Number from name
    if (firstName) {
      const pythagorean = {
        a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9,
        j: 1, k: 2, l: 3, m: 4, n: 5, o: 6, p: 7, q: 8, r: 9,
        s: 1, t: 2, u: 3, v: 4, w: 5, x: 6, y: 7, z: 8,
      };
      const sum = firstName
        .toLowerCase()
        .split('')
        .reduce((acc, char) => acc + (pythagorean[char] || 0), 0);
      result.expressionNumber = this._reduceToSingleDigit(sum);
    }

    // Assign traits based on Life Path Number
    const traitMap = {
      1: ['Independent', 'Ambitious', 'Natural leader'],
      2: ['Diplomatic', 'Intuitive', 'Peacemaker'],
      3: ['Creative', 'Expressive', 'Optimistic'],
      4: ['Practical', 'Disciplined', 'Builder'],
      5: ['Adventurous', 'Freedom-loving', 'Dynamic'],
      6: ['Nurturing', 'Responsible', 'Harmonious'],
      7: ['Analytical', 'Introspective', 'Seeker'],
      8: ['Powerful', 'Achievement-oriented', 'Strategic'],
      9: ['Compassionate', 'Humanitarian', 'Wise'],
      11: ['Visionary', 'Inspirational', 'Highly intuitive'],
      22: ['Master builder', 'Visionary planner', 'Transformative'],
      33: ['Master healer', 'Selfless', 'Spiritually elevated'],
    };
    result.traits = traitMap[result.lifePathNumber] || ['Unique', 'Complex', 'Multifaceted'];

    return result;
  }

  /**
   * Reduce a number to a single digit (preserving master numbers 11, 22, 33).
   * @private
   */
  static _reduceToSingleDigit(num) {
    // Sum all digits
    let n = Math.abs(num);
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
      n = String(n)
        .split('')
        .reduce((sum, d) => sum + parseInt(d, 10), 0);
    }
    return n;
  }

  // ─── OpenAI Integration ───────────────────────────────────────────────

  /**
   * Build the GPT-4o prompt for personality analysis.
   * @private
   */
  static _buildAnalysisPrompt(user, answers, questionMap, numerology, milestone) {
    const firstName = user.firstName || 'User';
    const age = user.dateOfBirth
      ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;

    // Build answer context
    const answerLines = answers.map((a) => {
      const q = questionMap.get(a.questionNumber);
      const qText = q ? q.questionText : `Question ${a.questionNumber}`;
      const dim = q ? q.dimension : 'unknown';
      let answerText = '';
      if (a.textAnswer) answerText = a.textAnswer;
      else if (a.selectedOption) answerText = a.selectedOption;
      else if (a.selectedOptions?.length) answerText = a.selectedOptions.join(', ');
      return `[${dim}] Q: "${qText}" → A: "${answerText}"`;
    });

    const isPreliminary = milestone < 15;

    return `You are a personality psychologist and numerologist analyzing a dating app user's responses to build their personality profile.

## User Info
- Name: ${firstName}${age ? `, Age: ${age}` : ''}
- Life Path Number: ${numerology.lifePathNumber}${numerology.expressionNumber ? `, Expression Number: ${numerology.expressionNumber}` : ''}
- Numerology traits: ${numerology.traits.join(', ')}
- Total questions answered: ${answers.length}${isPreliminary ? ' (preliminary analysis — fewer than 15 answers)' : ''}

## Their Answers (${answers.length} total)
${answerLines.join('\n')}

## Your Task
Analyze this person's answers along with their numerological profile to create a personality report. ${isPreliminary ? 'Note: This is a preliminary analysis based on limited data. Be clear about confidence levels.' : 'This is a full analysis.'}

Respond with ONLY valid JSON in this exact format:
{
  "personalityType": "The [Adjective] [Noun]",
  "summary": "A warm, insightful 2-3 sentence summary of who this person is in relationships. Make it feel personal and mirror-like — they should feel seen. Reference specific patterns from their answers without quoting them directly.",
  "facets": [
    {
      "key": "emotional_style",
      "title": "Emotional Style",
      "score": <0-100>,
      "description": "1-2 sentences about how they handle emotions in relationships",
      "emoji": "<single relevant emoji>"
    },
    {
      "key": "communication",
      "title": "Communication",
      "score": <0-100>,
      "description": "1-2 sentences about their communication patterns",
      "emoji": "<single relevant emoji>"
    },
    {
      "key": "love_language",
      "title": "Love Language",
      "score": <0-100>,
      "description": "1-2 sentences about how they express and receive love",
      "emoji": "<single relevant emoji>"
    },
    {
      "key": "conflict_approach",
      "title": "Conflict Style",
      "score": <0-100>,
      "description": "1-2 sentences about how they handle disagreements",
      "emoji": "<single relevant emoji>"
    },
    {
      "key": "lifestyle",
      "title": "Lifestyle & Rhythm",
      "score": <0-100>,
      "description": "1-2 sentences about their daily life and energy",
      "emoji": "<single relevant emoji>"
    },
    {
      "key": "growth_orientation",
      "title": "Growth Mindset",
      "score": <0-100>,
      "description": "1-2 sentences about their openness to change and growth",
      "emoji": "<single relevant emoji>"
    },
    {
      "key": "social_energy",
      "title": "Social Energy",
      "score": <0-100>,
      "description": "1-2 sentences about their social preferences and energy",
      "emoji": "<single relevant emoji>"
    }
  ],
  "numerologyInsights": {
    "description": "2-3 sentences connecting their Life Path Number ${numerology.lifePathNumber} to patterns you see in their answers. Make it feel meaningful, not generic.",
    "traits": ["trait1", "trait2", "trait3", "trait4", "trait5"]
  }
}

IMPORTANT:
- Scores represent how strongly this facet defines them (not good/bad)
- Keep descriptions warm, specific, and insightful — avoid clinical language
- The personalityType should be memorable and positive (e.g., "The Gentle Adventurer", "The Thoughtful Flame")
- Numerology insights should connect their number to observed answer patterns
- Every emoji should be unique across facets`;
  }

  /**
   * Call OpenAI GPT-4o and parse JSON response.
   * @private
   */
  static async _callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a personality psychologist. Always respond with valid JSON only, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`Failed to parse OpenAI response as JSON: ${content.slice(0, 200)}`);
    }
  }

  // ─── Numerology Compatibility (for icebreakers) ───────────────────────

  /**
   * Get numerology compatibility between two users for icebreaker suggestions.
   *
   * @param {string} userIdA
   * @param {string} userIdB
   * @returns {{ compatibility: string, icebreaker: string }}
   */
  static async getNumerologyCompatibility(userIdA, userIdB) {
    const [analysisA, analysisB] = await Promise.all([
      PersonalityAnalysis.findOne({ userId: userIdA, status: 'completed' }).sort({ triggeredAtCount: -1 }).lean(),
      PersonalityAnalysis.findOne({ userId: userIdB, status: 'completed' }).sort({ triggeredAtCount: -1 }).lean(),
    ]);

    if (!analysisA?.numerology || !analysisB?.numerology) {
      return {
        compatibility: 'Not enough data for numerology compatibility yet.',
        icebreaker: null,
      };
    }

    const lpA = analysisA.numerology.lifePathNumber;
    const lpB = analysisB.numerology.lifePathNumber;

    // Simplified compatibility matrix
    const compatibilityDescriptions = {
      same: `Both Life Path ${lpA}s — you share the same core energy and natural understanding.`,
      complementary: `Life Path ${lpA} meets ${lpB} — complementary energies that balance each other beautifully.`,
      dynamic: `Life Path ${lpA} and ${lpB} — a dynamic pairing that sparks growth and excitement.`,
      challenging: `Life Path ${lpA} and ${lpB} — different perspectives that can create deep learning.`,
    };

    let type = 'dynamic';
    if (lpA === lpB) type = 'same';
    else if (Math.abs(lpA - lpB) <= 2) type = 'complementary';
    else if (lpA + lpB === 10 || Math.abs(lpA - lpB) >= 5) type = 'challenging';

    const icebreaker = `"Did you know your Life Path Number is ${lpB}? I'm a ${lpA} — ${type === 'same' ? 'we share the same number!' : 'together our numbers suggest ' + type + ' energy.'} What do you think?"`;

    return {
      compatibility: compatibilityDescriptions[type],
      icebreaker,
    };
  }
}

module.exports = PersonalityService;
