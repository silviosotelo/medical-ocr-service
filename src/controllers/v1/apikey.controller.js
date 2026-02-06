const apikeyService = require('../../services/apikey.service');

async function list(req, res, next) {
  try {
    const keys = await apikeyService.list(req.tenantId);
    res.json({ status: 'ok', data: keys });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, scopes, expiresAt } = req.body;
    if (!name) {
      return res.status(400).json({ status: 'error', error: { message: 'name required' } });
    }
    const key = await apikeyService.create(req.tenantId, req.userId, { name, scopes, expiresAt });
    res.status(201).json({ status: 'ok', data: key });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function revoke(req, res, next) {
  try {
    await apikeyService.revoke(req.params.id, req.tenantId);
    res.json({ status: 'ok', message: 'API key revoked' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

module.exports = { list, create, revoke };
