const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    redisClient.on('end', () => {
      logger.info('Redis client connection closed');
    });

    await redisClient.connect();
    logger.info('Redis connected successfully');

    return redisClient;
  } catch (error) {
    logger.warn('Redis connection failed (non-fatal):', error.message);
    redisClient = null;
    return null;
  }
};

const getRedisClient = () => redisClient;

const closeRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

module.exports = { connectRedis, getRedisClient, closeRedis };
