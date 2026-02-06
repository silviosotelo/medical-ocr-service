const tenantService = require('../../services/tenant.service');

async function create(req, res, next) {
  try {
    const tenant = await tenantService.create(req.body);
    res.status(201).json({ status: 'ok', data: tenant });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    const result = await tenantService.list({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
    });
    res.json({ status: 'ok', ...result });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const tenant = await tenantService.getById(req.params.id);
    if (!tenant) return res.status(404).json({ status: 'error', error: { message: 'Tenant not found' } });
    res.json({ status: 'ok', data: tenant });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const tenant = await tenantService.update(req.params.id, req.body);
    res.json({ status: 'ok', data: tenant });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const stats = await tenantService.getStats(req.tenantId);
    res.json({ status: 'ok', data: stats });
  } catch (err) {
    next(err);
  }
}

async function getDashboard(req, res, next) {
  try {
    const dashboard = await tenantService.getDashboard(req.tenantId);
    res.json({ status: 'ok', data: dashboard });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, update, getStats, getDashboard };
