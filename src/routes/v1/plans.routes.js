const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { PLAN_TIERS, getPlanDefaults } = require('../../config/plans.config');

router.use(authMiddleware);

// GET /api/v1/plans - List all available plans
router.get('/', (req, res) => {
  const plans = Object.entries(PLAN_TIERS).map(([key, plan]) => ({
    id: key,
    ...plan,
  }));

  res.json({ status: 'ok', data: plans });
});

// GET /api/v1/plans/:plan - Get plan details
router.get('/:plan', (req, res) => {
  const plan = PLAN_TIERS[req.params.plan];
  if (!plan) {
    return res.status(404).json({
      status: 'error',
      error: { code: 'NOT_FOUND', message: `Plan '${req.params.plan}' not found` },
    });
  }

  res.json({ status: 'ok', data: { id: req.params.plan, ...plan } });
});

module.exports = router;
