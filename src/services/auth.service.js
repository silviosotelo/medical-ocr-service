const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database.config');
const logger = require('../config/logger.config');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';
const BCRYPT_ROUNDS = 12;

class AuthService {
  generateTokens(user) {
    const payload = {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    return { accessToken, refreshToken };
  }

  verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  async hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  async register({ email, password, name, tenantId, role = 'viewer' }) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      const err = new Error('Email already registered');
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await this.hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, tenant_id, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, tenant_id, role, status, created_at`,
      [email, passwordHash, name, tenantId, role]
    );

    const user = result.rows[0];
    const tokens = this.generateTokens(user);

    logger.audit('User registered', { userId: user.id, email, tenantId });
    return { user, ...tokens };
  }

  async login(email, password) {
    const result = await query(
      `SELECT id, email, password_hash, name, tenant_id, role, status
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      const err = new Error('Account suspended');
      err.statusCode = 403;
      throw err;
    }

    const valid = await this.comparePassword(password, user.password_hash);
    if (!valid) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      throw err;
    }

    await query(
      `UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = $1`,
      [user.id]
    );

    delete user.password_hash;
    const tokens = this.generateTokens(user);

    logger.audit('User login', { userId: user.id, email });
    return { user, ...tokens };
  }

  async refreshToken(token) {
    const decoded = this.verifyToken(token);
    if (decoded.type !== 'refresh') {
      const err = new Error('Invalid refresh token');
      err.statusCode = 401;
      throw err;
    }

    const result = await query(
      `SELECT id, email, name, tenant_id, role, status FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rowCount === 0 || result.rows[0].status !== 'active') {
      const err = new Error('User not found or inactive');
      err.statusCode = 401;
      throw err;
    }

    return this.generateTokens(result.rows[0]);
  }

  async changePassword(userId, currentPassword, newPassword) {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const valid = await this.comparePassword(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      const err = new Error('Current password is incorrect');
      err.statusCode = 401;
      throw err;
    }

    const hash = await this.hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);

    logger.audit('Password changed', { userId });
  }
}

module.exports = new AuthService();
