const Bull = require('bull');
const logger = require('../utils/logger');

// MARK: - Bull Queue Configuration

let embeddingQueue = null;
let notificationQueue = null;
let comfortQueue = null;
let personalityQueue = null;

/**
 * Initialize Bull queues backed by Redis.
 * Graceful: if Redis is unavailable, queues remain null and callers fall back to inline processing.
 */
const initializeQueues = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const defaultOpts = {
    redis: redisUrl,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  };

  try {
    embeddingQueue = new Bull('embedding-queue', defaultOpts);
    notificationQueue = new Bull('notification-queue', defaultOpts);
    comfortQueue = new Bull('comfort-queue', defaultOpts);
    personalityQueue = new Bull('personality-queue', defaultOpts);

    // Error handlers
    [embeddingQueue, notificationQueue, comfortQueue, personalityQueue].forEach((q) => {
      q.on('error', (err) => logger.error(`Queue ${q.name} error:`, err.message));
      q.on('failed', (job, err) =>
        logger.warn(`Queue ${q.name} job ${job.id} failed:`, err.message)
      );
    });

    logger.info('Bull queues initialized: embedding, notification, comfort, personality');
  } catch (err) {
    logger.warn('Failed to initialize Bull queues (non-fatal):', err.message);
    embeddingQueue = null;
    notificationQueue = null;
    comfortQueue = null;
    personalityQueue = null;
  }
};

/**
 * Register job processors for all queues.
 */
const registerProcessors = () => {
  if (embeddingQueue) {
    const processEmbedding = require('../jobs/embedding.processor');
    embeddingQueue.process(3, processEmbedding);
    logger.info('Registered embedding queue processor (concurrency: 3)');
  }

  if (notificationQueue) {
    const processNotification = require('../jobs/notification.processor');
    notificationQueue.process(3, processNotification);
    logger.info('Registered notification queue processor (concurrency: 3)');
  }

  if (comfortQueue) {
    const processComfort = require('../jobs/comfort.processor');
    comfortQueue.process(3, processComfort);
    logger.info('Registered comfort queue processor (concurrency: 3)');
  }

  if (personalityQueue) {
    const processPersonality = require('../jobs/personality.processor');
    personalityQueue.process(2, processPersonality);
    logger.info('Registered personality queue processor (concurrency: 2)');
  }
};

/**
 * Close all queues gracefully.
 */
const closeQueues = async () => {
  const queues = [embeddingQueue, notificationQueue, comfortQueue, personalityQueue].filter(Boolean);
  await Promise.all(queues.map((q) => q.close()));
  if (queues.length > 0) {
    logger.info('Bull queues closed gracefully');
  }
};

const getEmbeddingQueue = () => embeddingQueue;
const getNotificationQueue = () => notificationQueue;
const getComfortQueue = () => comfortQueue;
const getPersonalityQueue = () => personalityQueue;

module.exports = {
  initializeQueues,
  registerProcessors,
  closeQueues,
  getEmbeddingQueue,
  getNotificationQueue,
  getComfortQueue,
  getPersonalityQueue,
};
