const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const tenantRoutes = require('./tenant.routes');
const userRoutes = require('./user.routes');
const apikeyRoutes = require('./apikey.routes');
const usageRoutes = require('./usage.routes');
const dataIngestRoutes = require('./data-ingest.routes');
const webhookRoutes = require('./webhook.routes');
const ordersRoutes = require('./orders.routes');
const ordenesBatchRoutes = require('./ordenes-batch.routes');
const feedbackRoutes = require('./feedback.routes');

router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);
router.use('/api-keys', apikeyRoutes);
router.use('/usage', usageRoutes);
router.use('/data', dataIngestRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/orders', ordersRoutes);
router.use('/ordenes', ordenesBatchRoutes);
router.use('/ordenes', feedbackRoutes);

router.get('/version', (req, res) => {
  res.json({
    service: 'Medical OCR SaaS Platform',
    version: '6.0.0',
    apiVersion: 'v1',
    architecture: 'API-First',
    features: [
      'Multi-tenancy',
      'JWT + API Key Authentication',
      'Usage Metering',
      'Webhook Notifications',
      'Batch Data Ingestion',
      'Auto-Embedding (OpenAI text-embedding-3-small)',
      'Pre-visacion with AI Matching',
      'Auto-Training',
      'RAG with pgvector',
      'Async Job Queue',
      'Webhook with Retry',
    ],
  });
});

module.exports = router;
