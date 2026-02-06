const { query } = require('../config/database.config');
const logger = require('../config/logger.config');
const authService = require('./auth.service');

class UserService {
  async list(tenantId, { page = 1, limit = 20, role } = {}) {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let where = 'WHERE tenant_id = $1';

    if (role) {
      params.push(role);
      where += ` AND role = $${params.length}`;
    }

    params.push(limit, offset);
    const result = await query(
      `SELECT id, email, name, role, status, last_login, login_count, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM users ${where}`,
      role ? [tenantId, role] : [tenantId]
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  }

  async getById(userId, tenantId) {
    const result = await query(
      `SELECT id, email, name, role, status, last_login, login_count, created_at, updated_at
       FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rows[0] || null;
  }

  async create(tenantId, { email, password, name, role = 'viewer' }) {
    const tenantUsers = await query('SELECT COUNT(*) FROM users WHERE tenant_id = $1', [tenantId]);
    const tenantResult = await query('SELECT max_users FROM tenants WHERE id = $1', [tenantId]);

    if (tenantResult.rows[0] && parseInt(tenantUsers.rows[0].count) >= tenantResult.rows[0].max_users) {
      const err = new Error('User limit reached for this tenant');
      err.statusCode = 403;
      throw err;
    }

    const result = await authService.register({ email, password, name, tenantId, role });
    return result.user;
  }

  async update(userId, tenantId, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = ['name', 'role', 'status'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      const err = new Error('No fields to update');
      err.statusCode = 400;
      throw err;
    }

    fields.push('updated_at = NOW()');
    values.push(userId, tenantId);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${idx} AND tenant_id = $${idx + 1}
       RETURNING id, email, name, role, status`,
      values
    );

    if (result.rowCount === 0) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    logger.audit('User updated', { userId, tenantId, fields: Object.keys(data) });
    return result.rows[0];
  }

  async remove(userId, tenantId) {
    const result = await query(
      'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [userId, tenantId]
    );

    if (result.rowCount === 0) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    logger.audit('User deleted', { userId, tenantId });
  }
}

module.exports = new UserService();
