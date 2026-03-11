const logger = require('../utils/logger');

/**
 * Bull job processor: recalculate comfort score for a match.
 * Job data: { matchId: string }
 */
module.exports = async (job) => {
  const { matchId } = job.data;

  try {
    const ComfortService = require('../services/comfort.service');
    const result = await ComfortService.calculateComfortScore(matchId);
    logger.debug(`Comfort score recalculated for match ${matchId}: ${result.score}`);
  } catch (err) {
    logger.error(`Comfort job failed for match ${matchId}:`, err.message);
    throw err; // Let Bull handle retries
  }
};
