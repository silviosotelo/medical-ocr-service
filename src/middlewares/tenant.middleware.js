const tenantService = require('../services/tenant.service');

async function tenantMiddleware(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'NO_TENANT', message: 'Tenant context required' },
    });
  }

  try {
    const tenant = await tenantService.getById(req.tenantId);
    if (!tenant) {
      return res.status(404).json({
        status: 'error',
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      });
    }

    if (tenant.status !== 'active') {
      return res.status(403).json({
        status: 'error',
        error: { code: 'TENANT_INACTIVE', message: 'Tenant is not active' },
      });
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantMiddleware };
