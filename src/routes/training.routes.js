const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/training.controller');

/**
 * GET /api/training/pending
 * Obtiene órdenes pendientes de validación
 * 
 * Query params:
 *   - limite: número de resultados (default: 50)
 */
router.get('/pending', trainingController.getOrdenesPendientes);

/**
 * GET /api/training/orden/:ordenId
 * Obtiene detalle completo de una orden para validación
 */
router.get('/orden/:ordenId', trainingController.getOrdenDetalle);

/**
 * POST /api/training/validate/:ordenId
 * Valida una orden como correcta (sin correcciones)
 * 
 * Body:
 *   {
 *     "validado_por": "nombre_usuario"
 *   }
 */
router.post('/validate/:ordenId', trainingController.validarOrden);

/**
 * POST /api/training/correct/:ordenId
 * Envía correcciones para una orden procesada
 * 
 * Body:
 *   {
 *     "usuario": "nombre_usuario",
 *     "correcciones": [
 *       {
 *         "tipo": "matricula|practica|diagnostico|paciente|medico",
 *         "campo": "cabecera.medico.matricula",
 *         "valorIA": "12345",
 *         "valorCorrecto": "54321",
 *         "razon": "Número de matrícula erróneo"
 *       }
 *     ]
 *   }
 */
router.post('/correct/:ordenId', trainingController.corregirOrden);

/**
 * GET /api/training/stats
 * Obtiene estadísticas de training y validación
 */
router.get('/stats', trainingController.getEstadisticas);

/**
 * POST /api/training/trigger
 * Trigger manual de training (requiere suficientes ejemplos validados)
 * 
 * Body (opcional):
 *   {
 *     "usuario": "nombre_usuario"
 *   }
 */
router.post('/trigger', trainingController.triggerTraining);

module.exports = router;
