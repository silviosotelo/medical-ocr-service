const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const tenantRoutes = require('./tenant.routes');
const userRoutes = require('./user.routes');
const apikeyRoutes = require('./apikey.routes');
const usageRoutes = require('./usage.routes');
const dataRoutes = require('./data.routes');
const webhookRoutes = require('./webhook.routes');
const ordersRoutes = require('./orders.routes');

router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);
router.use('/api-keys', apikeyRoutes);
router.use('/usage', usageRoutes);
router.use('/data', dataRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/orders', ordersRoutes);

router.get('/version', (req, res) => {
  res.json({
    service: 'Medical OCR SaaS Platform',
    version: '5.0.0',
    apiVersion: 'v1',
    features: [
      'Multi-tenancy',
      'JWT + API Key Authentication',
      'Usage Metering',
      'Webhook Notifications',
      'Data Import/Export',
      'Auto-Embedding',
      'Pre-visacion',
      'Auto-Training',
      'RAG with pgvector',
    ],
  });
});

module.exports = router;
