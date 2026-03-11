const logger = require('../utils/logger');

/**
 * Bull job processor for personality analysis.
 * Generates a personality profile using OpenAI GPT-4o based on user's answers + numerology.
 *
 * Job data: { userId: string, milestone: number }
 */
module.exports = async (job) => {
  const { userId, milestone } = job.data;

  if (!userId || !milestone) {
    logger.warn('Personality processor: missing userId or milestone, skipping');
    return;
  }

  logger.info(`Personality processor: generating analysis for user=${userId} at milestone=${milestone}`);

  const PersonalityService = require('../services/personality.service');

  try {
    const analysis = await PersonalityService.generateAnalysis(userId, milestone);
    logger.info(`Personality processor: completed for user=${userId}, type="${analysis.personalityType}"`);
    return { personalityType: analysis.personalityType, questionsAnalyzed: analysis.questionsAnalyzed };
  } catch (err) {
    logger.error(`Personality processor: failed for user=${userId}:`, err.message);
    throw err; // Bull will retry per backoff config
  }
};
