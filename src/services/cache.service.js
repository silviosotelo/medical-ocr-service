const { getRedis } = require('../config/redis.config');
const logger = require('../config/logger.config');

const DEFAULT_TTL = 300;

class CacheService {
  get redis() {
    return getRedis();
  }

  async get(key) {
    if (!this.redis) return null;
    try {
      const val = await this.redis.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      logger.warn('Cache get error', { key, error: err.message });
      return null;
    }
  }

  async set(key, value, ttl = DEFAULT_TTL) {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (err) {
      logger.warn('Cache set error', { key, error: err.message });
    }
  }

  async del(key) {
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.warn('Cache del error', { key, error: err.message });
    }
  }

  async delPattern(pattern) {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      logger.warn('Cache delPattern error', { pattern, error: err.message });
    }
  }

  async getTenantData(tenantId, subKey) {
    return this.get(`tenant:${tenantId}:${subKey}`);
  }

  async setTenantData(tenantId, subKey, value, ttl = DEFAULT_TTL) {
    return this.set(`tenant:${tenantId}:${subKey}`, value, ttl);
  }

  async invalidateTenant(tenantId) {
    return this.delPattern(`tenant:${tenantId}:*`);
  }

  async getEmbedding(text) {
    return this.get(`emb:${text.substring(0, 80)}`);
  }

  async setEmbedding(text, vector, ttl = 86400) {
    return this.set(`emb:${text.substring(0, 80)}`, vector, ttl);
  }
}

module.exports = new CacheService();
