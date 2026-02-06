const express = require('express');
const router = express.Router();
const { uploadSingle, handleMulterError } = require('../config/multer.config');
const preVisacionController = require('../controllers/pre-visacion.controller');

// POST /api/visar/preview - Con upload de archivo
router.post(
  '/preview',
  uploadSingle.single('archivo'),
  handleMulterError,
  preVisacionController.procesarOrdenYPreVisar
);

// POST /api/visar/preview-url - Desde URL (Oracle)
router.post('/preview-url', preVisacionController.procesarOrdenDesdeURL);

// GET /api/visar/preview/pendientes
router.get('/preview/pendientes', preVisacionController.listarPendientes);

// GET /api/visar/preview/:id
router.get('/preview/:id', preVisacionController.obtenerPreVisacion);

// POST /api/visar/preview/:id/aprobar
router.post('/preview/:id/aprobar', preVisacionController.aprobar);

// POST /api/visar/preview/:id/rechazar
router.post('/preview/:id/rechazar', preVisacionController.rechazar);

// POST /api/visar/preview/detalle/:idDetalle/corregir
router.post('/preview/detalle/:idDetalle/corregir', preVisacionController.corregirNomenclador);

// GET /api/visar/preview/estadisticas
router.get('/preview/estadisticas', preVisacionController.obtenerEstadisticas);

module.exports = router;