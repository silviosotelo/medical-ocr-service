const userService = require('../../services/user.service');

async function list(req, res, next) {
  try {
    const { page, limit, role } = req.query;
    const result = await userService.list(req.tenantId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      role,
    });
    res.json({ status: 'ok', ...result });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const user = await userService.getById(req.params.id, req.tenantId);
    if (!user) return res.status(404).json({ status: 'error', error: { message: 'User not found' } });
    res.json({ status: 'ok', data: user });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ status: 'error', error: { message: 'email, password, name required' } });
    }
    const user = await userService.create(req.tenantId, { email, password, name, role });
    res.status(201).json({ status: 'ok', data: user });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const user = await userService.update(req.params.id, req.tenantId, req.body);
    res.json({ status: 'ok', data: user });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await userService.remove(req.params.id, req.tenantId);
    res.json({ status: 'ok', message: 'User deleted' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', error: { message: err.message } });
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
