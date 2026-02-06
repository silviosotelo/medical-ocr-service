const { query, transaction } = require('../config/database.config');
const logger = require('../config/logger.config');
const cacheService = require('./cache.service');

class TenantService {
  async create({ name, slug, ruc, plan = 'starter', settings = {} }) {
    const existing = await query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rowCount > 0) {
      const err = new Error('Tenant slug already exists');
      err.statusCode = 409;
      throw err;
    }

    const result = await query(
      `INSERT INTO tenants (name, slug, ruc, plan, settings)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, slug, ruc, plan, JSON.stringify(settings)]
    );

    logger.audit('Tenant created', { tenantId: result.rows[0].id, slug });
    return result.rows[0];
  }

  async getById(id) {
    const cached = await cacheService.get(`tenant:${id}`);
    if (cached) return cached;

    const result = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    if (result.rowCount === 0) return null;

    await cacheService.set(`tenant:${id}`, result.rows[0], 600);
    return result.rows[0];
  }

  async getBySlug(slug) {
    const cached = await cacheService.get(`tenant:slug:${slug}`);
    if (cached) return cached;

    const result = await query('SELECT * FROM tenants WHERE slug = $1', [slug]);
    if (result.rowCount === 0) return null;

    await cacheService.set(`tenant:slug:${slug}`, result.rows[0], 600);
    return result.rows[0];
  }

  async list({ page = 1, limit = 20, status } = {}) {
    const offset = (page - 1) * limit;
    let sql = 'SELECT * FROM tenants';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` WHERE status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);

    const countSql = status
      ? 'SELECT COUNT(*) FROM tenants WHERE status = $1'
      : 'SELECT COUNT(*) FROM tenants';
    const countResult = await query(countSql, status ? [status] : []);

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  }

  async update(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = ['name', 'ruc', 'plan', 'status', 'settings', 'max_orders_month', 'max_api_keys', 'max_users', 'fine_tuned_model'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(key === 'settings' ? JSON.stringify(data[key]) : data[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      const err = new Error('No fields to update');
      err.statusCode = 400;
      throw err;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      const err = new Error('Tenant not found');
      err.statusCode = 404;
      throw err;
    }

    await cacheService.invalidateTenant(id);
    await cacheService.del(`tenant:${id}`);

    logger.audit('Tenant updated', { tenantId: id, fields: Object.keys(data) });
    return result.rows[0];
  }

  async getStats(tenantId) {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1) as user_count,
        (SELECT COUNT(*) FROM api_keys WHERE tenant_id = $1 AND status = 'active') as active_keys,
        (SELECT COUNT(*) FROM ordenes_procesadas WHERE tenant_id = $1) as total_orders,
        (SELECT COUNT(*) FROM ordenes_procesadas WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())) as orders_this_month,
        (SELECT COUNT(*) FROM prestadores WHERE tenant_id = $1) as prestadores_count,
        (SELECT COUNT(*) FROM nomencladores WHERE tenant_id = $1) as nomencladores_count,
        (SELECT COUNT(*) FROM acuerdos_prestador WHERE tenant_id = $1) as acuerdos_count
    `, [tenantId]);

    return result.rows[0];
  }

  async getDashboard(tenantId) {
    const [stats, recentOrders, usageMonth] = await Promise.all([
      this.getStats(tenantId),
      query(
        `SELECT id, archivo_nombre, confianza_promedio, validado, created_at
         FROM ordenes_procesadas
         WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT 10`,
        [tenantId]
      ),
      query(
        `SELECT
           DATE(created_at) as day,
           COUNT(*) as requests,
           SUM(tokens_used) as tokens,
           AVG(processing_ms) as avg_ms
         FROM usage_logs
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY day`,
        [tenantId]
      ),
    ]);

    return {
      stats,
      recentOrders: recentOrders.rows,
      dailyUsage: usageMonth.rows,
    };
  }
}

module.exports = new TenantService();
