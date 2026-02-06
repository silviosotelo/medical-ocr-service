const authService = require('../../services/auth.service');

async function register(req, res, next) {
  try {
    const { email, password, name, tenantId } = req.body;
    if (!email || !password || !name || !tenantId) {
      return res.status(400).json({ status: 'error', error: { code: 'VALIDATION', message: 'email, password, name, tenantId required' } });
    }
    const result = await authService.register({ email, password, name, tenantId });
    res.status(201).json({ status: 'ok', data: result });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'error', error: { code: 'VALIDATION', message: 'email and password required' } });
    }
    const result = await authService.login(email, password);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ status: 'error', error: { message: 'refreshToken required' } });
    }
    const tokens = await authService.refreshToken(refreshToken);
    res.json({ status: 'ok', data: tokens });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const { query: dbQuery } = require('../../config/database.config');
    const result = await dbQuery(
      'SELECT id, email, name, tenant_id, role, status, last_login, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', error: { message: 'User not found' } });
    }
    res.json({ status: 'ok', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: 'error', error: { message: 'currentPassword and newPassword required' } });
    }
    await authService.changePassword(req.userId, currentPassword, newPassword);
    res.json({ status: 'ok', message: 'Password changed' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

module.exports = { register, login, refresh, me, changePassword };
