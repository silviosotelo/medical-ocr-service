const Redis = require('ioredis');
const logger = require('./logger.config');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis = null;

function getRedis() {
  if (redis) return redis;

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      },
      connectTimeout: 2000,
      lazyConnect: true,
    });

    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.warn('Redis error', { error: err.message }));

    redis.connect().catch(() => {
      logger.warn('Redis not available, running without cache');
      redis = null;
    });
  } catch (err) {
    logger.warn('Redis not configured, running without cache');
    redis = null;
  }

  return redis;
}

module.exports = { getRedis, REDIS_URL };
