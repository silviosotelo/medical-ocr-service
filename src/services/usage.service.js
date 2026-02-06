const { query } = require('../config/database.config');
const logger = require('../config/logger.config');

class UsageService {
  async log({ tenantId, userId, apiKeyId, action, endpoint, method, tokensUsed = 0, processingMs = 0, fileSizeBytes = 0, statusCode, errorMessage, metadata }) {
    try {
      await query(
        `INSERT INTO usage_logs
         (tenant_id, user_id, api_key_id, action, endpoint, method, tokens_used, processing_ms, file_size_bytes, status_code, error_message, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tenantId, userId || null, apiKeyId || null, action, endpoint, method, tokensUsed, processingMs, fileSizeBytes, statusCode, errorMessage || null, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (err) {
      logger.warn('Failed to log usage', { error: err.message });
    }
  }

  async getByTenant(tenantId, { page = 1, limit = 50, action, from, to } = {}) {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let where = 'WHERE tenant_id = $1';

    if (action) {
      params.push(action);
      where += ` AND action = $${params.length}`;
    }
    if (from) {
      params.push(from);
      where += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND created_at <= $${params.length}`;
    }

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM usage_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const countResult = await query(
      `SELECT COUNT(*) FROM usage_logs ${where}`,
      countParams
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  }

  async getSummary(tenantId, days = 30) {
    const result = await query(`
      SELECT
        COUNT(*) as total_requests,
        SUM(tokens_used) as total_tokens,
        AVG(processing_ms)::int as avg_processing_ms,
        SUM(file_size_bytes) as total_bytes,
        COUNT(DISTINCT DATE(created_at)) as active_days,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
        COUNT(*) FILTER (WHERE action = 'process_order') as orders_processed,
        COUNT(*) FILTER (WHERE action = 'pre_visacion') as pre_visaciones
      FROM usage_logs
      WHERE tenant_id = $1 AND created_at >= NOW() - make_interval(days => $2)
    `, [tenantId, days]);

    return result.rows[0];
  }

  async getDailyBreakdown(tenantId, days = 30) {
    const result = await query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as requests,
        SUM(tokens_used) as tokens,
        AVG(processing_ms)::int as avg_ms,
        COUNT(*) FILTER (WHERE status_code >= 400) as errors
      FROM usage_logs
      WHERE tenant_id = $1 AND created_at >= NOW() - make_interval(days => $2)
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [tenantId, days]);

    return result.rows;
  }

  async checkQuota(tenantId) {
    const tenantResult = await query(
      'SELECT max_orders_month FROM tenants WHERE id = $1',
      [tenantId]
    );
    if (tenantResult.rowCount === 0) return { allowed: false, reason: 'Tenant not found' };

    const maxOrders = tenantResult.rows[0].max_orders_month;

    const usageResult = await query(
      `SELECT COUNT(*) FROM usage_logs
       WHERE tenant_id = $1
       AND action = 'process_order'
       AND created_at >= date_trunc('month', NOW())`,
      [tenantId]
    );

    const used = parseInt(usageResult.rows[0].count);
    return {
      allowed: used < maxOrders,
      used,
      limit: maxOrders,
      remaining: Math.max(0, maxOrders - used),
    };
  }
}

module.exports = new UsageService();
