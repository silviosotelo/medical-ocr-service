const usageService = require('../../services/usage.service');

async function getLogs(req, res, next) {
  try {
    const { page, limit, action, from, to } = req.query;
    const result = await usageService.getByTenant(req.tenantId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      action,
      from,
      to,
    });
    res.json({ status: 'ok', ...result });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const summary = await usageService.getSummary(req.tenantId, days);
    res.json({ status: 'ok', data: summary });
  } catch (err) {
    next(err);
  }
}

async function getDaily(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const daily = await usageService.getDailyBreakdown(req.tenantId, days);
    res.json({ status: 'ok', data: daily });
  } catch (err) {
    next(err);
  }
}

async function getQuota(req, res, next) {
  try {
    const quota = await usageService.checkQuota(req.tenantId);
    res.json({ status: 'ok', data: quota });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLogs, getSummary, getDaily, getQuota };
