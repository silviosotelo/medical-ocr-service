const express = require('express');
const router = express.Router();
const { uploadSingle, uploadBatch, handleMulterError } = require('../config/multer.config');
const visacionController = require('../controllers/visacion.controller');
const batchController = require('../controllers/batch.controller');
const preVisacionRoutes = require('./pre-visacion.routes');
const trainingRoutes = require('./training.routes');
const fileValidatorMiddleware = require('../middlewares/file-validator.middleware');
const rateLimiter = require('../middlewares/rate-limiter.middleware');

// =====================================================================
// MONTAR SUB-RUTAS PRIMERO
// =====================================================================
router.use('/visar', preVisacionRoutes);
router.use('/training', trainingRoutes);

// =====================================================================
// RUTAS LEGACY
// =====================================================================

router.post(
  '/visar',
  rateLimiter,
  uploadSingle.single('archivo'),
  handleMulterError,
  fileValidatorMiddleware,
  visacionController.processOrder
);

router.post(
  '/visar/batch',
  rateLimiter,
  uploadBatch.array('archivos', parseInt(process.env.BATCH_MAX_FILES || '20')),
  handleMulterError,
  batchController.processBatch
);

router.get('/batch/:batchId', batchController.getBatchStatus);
router.get('/batch', batchController.listActiveBatches);

router.get('/version', (req, res) => {
  res.json({
    service: 'Medical OCR Microservice',
    version: '4.0.0',
    model: 'gpt-4o',
    features: [
      'PDF to Image conversion',
      'Handwritten text recognition',
      'Medical terminology extraction',
      'Practice code suggestion',
      'Urgency detection',
      'Batch processing',
      'Fine-tuning support',
      'RAG with pgvector',
      'Auto-training',
      'Pre-visación automática (NEW)',
      'Matching de nomencladores (NEW)',
      'Oracle APEX integration (NEW)'
    ]
  });
});

module.exports = router;