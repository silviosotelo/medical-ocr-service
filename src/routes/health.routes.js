const express = require('express');
const router = express.Router();
const visacionController = require('../controllers/visacion.controller');
const { getMetrics, resetMetrics } = require('../utils/metrics');
const { getDirectorySize, cleanupOldFiles } = require('../utils/cleanup');

/**
 * GET /health
 * Health check básico del servicio
 */
router.get('/', visacionController.healthCheck);

/**
 * GET /health/metrics
 * Retorna métricas detalladas del servicio
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = getMetrics();
    const tempDirSize = await getDirectorySize();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      metrics: metrics,
      storage: {
        tempDirectory: process.env.TEMP_DIR || './temp',
        files: tempDirSize.files,
        sizeKB: tempDirSize.sizeKB,
        sizeMB: tempDirSize.sizeMB
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(process.memoryUsage().external / 1024 / 1024)}MB`
        },
        cpuUsage: process.cpuUsage()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error retrieving metrics',
      error: error.message
    });
  }
});

/**
 * POST /health/metrics/reset
 * Reinicia las métricas del servicio
 */
router.post('/metrics/reset', (req, res) => {
  resetMetrics();
  res.json({
    status: 'ok',
    message: 'Metrics reset successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /health/cleanup
 * Fuerza la limpieza de archivos temporales antiguos
 */
router.post('/cleanup', async (req, res) => {
  try {
    const maxAgeMinutes = parseInt(req.query.maxAge) || 60;
    const result = await cleanupOldFiles(null, maxAgeMinutes);

    res.json({
      status: 'ok',
      message: 'Cleanup completed',
      timestamp: new Date().toISOString(),
      result: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error during cleanup',
      error: error.message
    });
  }
});

/**
 * GET /health/storage
 * Retorna información del almacenamiento temporal
 */
router.get('/storage', async (req, res) => {
  try {
    const tempDirSize = await getDirectorySize();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      storage: {
        directory: process.env.TEMP_DIR || './temp',
        files: tempDirSize.files,
        sizeBytes: tempDirSize.sizeBytes,
        sizeKB: tempDirSize.sizeKB,
        sizeMB: tempDirSize.sizeMB
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error retrieving storage info',
      error: error.message
    });
  }
});

module.exports = router;
