const webhookService = require('../../services/webhook.service');

async function list(req, res, next) {
  try {
    const configs = await webhookService.getConfigs(req.tenantId);
    res.json({ status: 'ok', data: configs });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { url, events } = req.body;
    if (!url) {
      return res.status(400).json({ status: 'error', error: { message: 'url required' } });
    }
    const config = await webhookService.create(req.tenantId, { url, events: events || ['order.completed'] });
    res.status(201).json({ status: 'ok', data: config });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const config = await webhookService.update(req.params.id, req.tenantId, req.body);
    if (!config) return res.status(404).json({ status: 'error', error: { message: 'Webhook not found' } });
    res.json({ status: 'ok', data: config });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await webhookService.remove(req.params.id, req.tenantId);
    res.json({ status: 'ok', message: 'Webhook deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
