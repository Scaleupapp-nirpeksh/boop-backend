const Answer = require('../models/Answer');
const EmbeddingService = require('../services/embedding.service');
const logger = require('../utils/logger');

/**
 * Bull job processor: generate and save an embedding for a text answer.
 * Job data: { answerId: string }
 */
module.exports = async (job) => {
  const { answerId } = job.data;

  const answer = await Answer.findById(answerId);
  if (!answer) {
    logger.warn(`Embedding job: Answer ${answerId} not found — skipping`);
    return;
  }

  if (!answer.textAnswer || answer.textAnswer.trim().length === 0) {
    logger.debug(`Embedding job: Answer ${answerId} has no text — skipping`);
    return;
  }

  const embedding = await EmbeddingService.generateEmbedding(answer.textAnswer);
  if (!embedding) {
    throw new Error(`Failed to generate embedding for answer ${answerId}`);
  }

  await Answer.updateOne({ _id: answerId }, { $set: { embedding } });
  logger.debug(`Embedding saved for answer ${answerId} (${embedding.length} dims)`);
};
