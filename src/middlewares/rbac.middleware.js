const ROLES = {
  super_admin: {
    level: 100,
    label: 'Super Admin',
    permissions: [
      'tenants:read', 'tenants:write', 'tenants:delete',
      'users:read', 'users:write', 'users:delete',
      'api_keys:read', 'api_keys:write', 'api_keys:delete',
      'orders:read', 'orders:write', 'orders:validate',
      'data:read', 'data:import', 'data:export', 'data:embeddings',
      'usage:read',
      'webhooks:read', 'webhooks:write', 'webhooks:delete',
      'training:read', 'training:write',
      'settings:read', 'settings:write',
      'dashboard:global', 'dashboard:tenant',
    ],
  },
  admin: {
    level: 80,
    label: 'Administrador',
    permissions: [
      'users:read', 'users:write',
      'api_keys:read', 'api_keys:write', 'api_keys:delete',
      'orders:read', 'orders:write', 'orders:validate',
      'data:read', 'data:import', 'data:export', 'data:embeddings',
      'usage:read',
      'webhooks:read', 'webhooks:write', 'webhooks:delete',
      'training:read', 'training:write',
      'settings:read',
      'dashboard:tenant',
    ],
  },
  operator: {
    level: 50,
    label: 'Operador',
    permissions: [
      'orders:read', 'orders:write', 'orders:validate',
      'data:read',
      'usage:read',
      'dashboard:tenant',
    ],
  },
  viewer: {
    level: 10,
    label: 'Visor',
    permissions: [
      'orders:read',
      'data:read',
      'dashboard:tenant',
    ],
  },
};

function hasPermission(role, permission) {
  const roleDef = ROLES[role];
  if (!roleDef) return false;
  return roleDef.permissions.includes(permission);
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    if (req.authType === 'apikey') {
      const hasScope = permissions.some((p) => {
        const action = p.split(':')[1];
        return req.scopes.includes(action) || req.scopes.includes('admin');
      });
      if (!hasScope) {
        return res.status(403).json({
          status: 'error',
          error: { code: 'FORBIDDEN', message: 'API key lacks required scope' },
        });
      }
      return next();
    }

    const role = req.userRole;
    const allowed = permissions.some((p) => hasPermission(role, p));
    if (!allowed) {
      return res.status(403).json({
        status: 'error',
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions for this action' },
      });
    }
    next();
  };
}

function isSuperAdmin(req, res, next) {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      error: { code: 'FORBIDDEN', message: 'Super admin access required' },
    });
  }
  next();
}

function isAdminOrAbove(req, res, next) {
  const level = ROLES[req.userRole]?.level || 0;
  if (level < ROLES.admin.level) {
    return res.status(403).json({
      status: 'error',
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }
  next();
}

module.exports = {
  ROLES,
  hasPermission,
  requirePermission,
  isSuperAdmin,
  isAdminOrAbove,
};
