const crypto = require('crypto');
const { nanoid } = require('nanoid');
const { query } = require('../config/database.config');
const logger = require('../config/logger.config');

class ApiKeyService {
  generateKey() {
    const prefix = 'moc_' + nanoid(8);
    const secret = nanoid(40);
    const full = `${prefix}_${secret}`;
    const hash = crypto.createHash('sha256').update(full).digest('hex');
    return { full, prefix, hash };
  }

  async create(tenantId, userId, { name, scopes = ['read', 'write'], expiresAt } = {}) {
    const countResult = await query(
      "SELECT COUNT(*) FROM api_keys WHERE tenant_id = $1 AND status = 'active'",
      [tenantId]
    );
    const tenantResult = await query('SELECT max_api_keys FROM tenants WHERE id = $1', [tenantId]);

    if (tenantResult.rows[0] && parseInt(countResult.rows[0].count) >= tenantResult.rows[0].max_api_keys) {
      const err = new Error('API key limit reached');
      err.statusCode = 403;
      throw err;
    }

    const { full, prefix, hash } = this.generateKey();

    const result = await query(
      `INSERT INTO api_keys (tenant_id, created_by, name, key_prefix, key_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, key_prefix, scopes, status, expires_at, created_at`,
      [tenantId, userId, name, prefix, hash, JSON.stringify(scopes), expiresAt || null]
    );

    logger.audit('API key created', { tenantId, keyId: result.rows[0].id, prefix });

    return {
      ...result.rows[0],
      key: full,
    };
  }

  async validateKey(rawKey) {
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const result = await query(
      `SELECT ak.*, t.status as tenant_status, t.slug as tenant_slug
       FROM api_keys ak
       JOIN tenants t ON t.id = ak.tenant_id
       WHERE ak.key_hash = $1`,
      [hash]
    );

    if (result.rowCount === 0) return null;

    const key = result.rows[0];

    if (key.status !== 'active') return null;
    if (key.tenant_status !== 'active') return null;
    if (key.expires_at && new Date(key.expires_at) < new Date()) return null;

    await query(
      'UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
      [key.id]
    );

    return key;
  }

  async list(tenantId) {
    const result = await query(
      `SELECT id, name, key_prefix, scopes, status, expires_at, last_used_at, usage_count, created_at
       FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async revoke(keyId, tenantId) {
    const result = await query(
      "UPDATE api_keys SET status = 'revoked' WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [keyId, tenantId]
    );

    if (result.rowCount === 0) {
      const err = new Error('API key not found');
      err.statusCode = 404;
      throw err;
    }

    logger.audit('API key revoked', { keyId, tenantId });
  }
}

module.exports = new ApiKeyService();
