const express = require('express');
const router = express.Router();
const Joi = require('joi');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const jobQueueService = require('../../services/job-queue.service');
const logger = require('../../config/logger.config');

// Rate limit: 10 req/min
const batchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Max 10 requests per minute for batch endpoints' },
  },
});

// Auth middleware - supports Bearer JWT or X-Api-Key
function apiKeyOrBearerAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    req.headers.authorization = `Bearer ${apiKey}`;
  }
  return authMiddleware(req, res, next);
}

router.use(apiKeyOrBearerAuth);

// =====================================================================
// Validation schemas
// =====================================================================

const ordenSchema = Joi.object({
  id_externo: Joi.string().required(),
  archivo_base64: Joi.string().max(Math.ceil(10 * 1024 * 1024 * 1.37)).required(), // ~10MB in base64
  archivo_nombre: Joi.string().required(),
  archivo_tipo: Joi.string().allow(null, ''),
  metadata: Joi.object({
    plan_id: Joi.number().integer().allow(null),
    ci_paciente: Joi.string().allow(null, ''),
    prioridad: Joi.string().valid('NORMAL', 'URGENTE').default('NORMAL'),
  }).default({}),
});

const ordenesBatchSchema = Joi.object({
  ordenes: Joi.array().items(ordenSchema).min(1).max(50).required(),
  webhook_url: Joi.string().uri().allow(null, ''),
});

// =====================================================================
// POST /v1/ordenes/batch
// =====================================================================
router.post('/batch', batchRateLimit, async (req, res) => {
  try {
    const { error, value } = ordenesBatchSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(422).json({
        status: 'error',
        errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
      });
    }

    const batchId = crypto.randomUUID();
    const ordenes = value.ordenes;
    const jobs = [];

    for (const orden of ordenes) {
      const jobPayload = {
        id_externo: orden.id_externo,
        archivo_base64: orden.archivo_base64,
        archivo_nombre: orden.archivo_nombre,
        archivo_tipo: orden.archivo_tipo,
        metadata: orden.metadata,
        tenant_id: req.tenantId,
        webhook_url: value.webhook_url || null,
      };

      const jobResult = await jobQueueService.enqueue('previsacion', jobPayload, {
        batch_id: batchId,
        id_externo: orden.id_externo,
        tenant_id: req.tenantId,
        max_intentos: 3,
      });

      jobs.push({
        id_externo: orden.id_externo,
        job_id: jobResult.job_id,
        status: 'queued',
      });
    }

    res.status(202).json({
      status: 'accepted',
      batch_id: batchId,
      total: ordenes.length,
      jobs,
    });
  } catch (err) {
    logger.error('Error in POST /ordenes/batch', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// =====================================================================
// GET /v1/ordenes/batch/:batch_id/status
// =====================================================================
router.get('/batch/:batch_id/status', async (req, res) => {
  try {
    const batchStatus = await jobQueueService.getBatchStatus(req.params.batch_id);

    if (!batchStatus || batchStatus.total === 0) {
      return res.status(404).json({
        status: 'error',
        error: { code: 'NOT_FOUND', message: 'Batch not found' },
      });
    }

    res.json({
      status: 'ok',
      data: batchStatus,
    });
  } catch (err) {
    logger.error('Error in GET /ordenes/batch/:batch_id/status', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

module.exports = router;
