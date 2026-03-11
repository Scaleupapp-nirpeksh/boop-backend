const { getRedisClient } = require('../config/redis');
const logger = require('./logger');

// MARK: - Cache Utility

/**
 * Redis-backed cache with graceful fallback.
 * If Redis is unavailable, always calls the fetch function directly.
 */

/**
 * Get a cached value or compute and store it.
 * @param {string} key - Cache key
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @param {Function} fetchFn - Async function to compute the value if not cached
 * @returns {*} The cached or freshly computed value
 */
const getOrSet = async (key, ttlSeconds, fetchFn) => {
  const client = getRedisClient();

  if (!client) {
    return fetchFn();
  }

  try {
    const cached = await client.get(key);
    if (cached !== null) {
      logger.debug(`Cache HIT: ${key}`);
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn(`Cache GET error for ${key}:`, err.message);
    return fetchFn();
  }

  logger.debug(`Cache MISS: ${key}`);
  const value = await fetchFn();

  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn(`Cache SET error for ${key}:`, err.message);
  }

  return value;
};

/**
 * Delete a specific cache key.
 * @param {string} key - Cache key to invalidate
 */
const invalidate = async (key) => {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
    logger.debug(`Cache INVALIDATED: ${key}`);
  } catch (err) {
    logger.warn(`Cache DEL error for ${key}:`, err.message);
  }
};

/**
 * Delete all keys matching a pattern.
 * Uses SCAN for production safety (non-blocking).
 * @param {string} pattern - Glob pattern (e.g. "discover:stats:*")
 */
const invalidatePattern = async (pattern) => {
  const client = getRedisClient();
  if (!client) return;

  try {
    let cursor = 0;
    let deleted = 0;
    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await client.del(result.keys);
        deleted += result.keys.length;
      }
    } while (cursor !== 0);

    if (deleted > 0) {
      logger.debug(`Cache INVALIDATED pattern "${pattern}": ${deleted} keys`);
    }
  } catch (err) {
    logger.warn(`Cache pattern DEL error for ${pattern}:`, err.message);
  }
};

module.exports = { getOrSet, invalidate, invalidatePattern };
