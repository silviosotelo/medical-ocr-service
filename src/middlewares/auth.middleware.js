const authService = require('../services/auth.service');
const apikeyService = require('../services/apikey.service');
const logger = require('../config/logger.config');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ status: 'error', error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } });
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    if (token.startsWith('moc_')) {
      try {
        const apiKey = await apikeyService.validateKey(token);
        if (!apiKey) {
          return res.status(401).json({ status: 'error', error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' } });
        }

        req.tenantId = apiKey.tenant_id;
        req.apiKeyId = apiKey.id;
        req.authType = 'apikey';
        req.scopes = apiKey.scopes || [];
        return next();
      } catch (err) {
        return res.status(401).json({ status: 'error', error: { code: 'INVALID_API_KEY', message: err.message } });
      }
    }

    try {
      const decoded = authService.verifyToken(token);
      req.userId = decoded.userId;
      req.tenantId = decoded.tenantId;
      req.userRole = decoded.role;
      req.authType = 'jwt';

      // Si es super_admin y no tiene tenant en el JWT, aceptar X-Tenant-ID header
      if (decoded.role === 'super_admin' && !decoded.tenantId) {
        const headerTenantId = req.headers['x-tenant-id'];
        if (headerTenantId) {
          req.tenantId = headerTenantId;
        }
      }

      return next();
    } catch (err) {
      return res.status(401).json({ status: 'error', error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
    }
  }

  return res.status(401).json({ status: 'error', error: { code: 'UNAUTHORIZED', message: 'Invalid authorization format' } });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.authType === 'apikey') {
      return next();
    }

    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ status: 'error', error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

function requireScope(...scopes) {
  return (req, res, next) => {
    if (req.authType === 'jwt') return next();

    const hasScope = scopes.some((s) => req.scopes.includes(s));
    if (!hasScope) {
      return res.status(403).json({ status: 'error', error: { code: 'FORBIDDEN', message: 'API key lacks required scope' } });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  authMiddleware(req, res, (err) => {
    if (err) return next();
    next();
  });
}

module.exports = { authMiddleware, requireRole, requireScope, optionalAuth };
