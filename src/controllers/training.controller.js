const autoTrainingService = require('../services/auto-training.service');
const feedbackService = require('../services/feedback.service');
const logger = require('../config/logger.config');

class TrainingController {
  /**
   * POST /api/training/validate/:ordenId
   * Valida una orden como correcta
   */
  async validarOrden(req, res) {
    try {
      const { ordenId } = req.params;
      const { validado_por } = req.body;

      if (!validado_por) {
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'MISSING_VALIDATOR',
            message: 'Se requiere el campo validado_por'
          }
        });
      }

      await feedbackService.validarOrden(parseInt(ordenId), validado_por);

      return res.status(200).json({
        status: 'success',
        message: 'Orden validada correctamente',
        ordenId: parseInt(ordenId)
      });

    } catch (error) {
      logger.error('Error validando orden', {
        ordenId: req.params.ordenId,
        error: error.message
      });

      return res.status(500).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message
        }
      });
    }
  }

  /**
   * POST /api/training/correct/:ordenId
   * Envía correcciones para una orden
   */
  async corregirOrden(req, res) {
    try {
      const { ordenId } = req.params;
      const { correcciones, usuario } = req.body;

      if (!correcciones || !Array.isArray(correcciones)) {
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'INVALID_CORRECTIONS',
            message: 'Se requiere un array de correcciones'
          }
        });
      }

      if (!usuario) {
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'MISSING_USER',
            message: 'Se requiere el campo usuario'
          }
        });
      }

      await feedbackService.enviarCorreccion(
        parseInt(ordenId),
        correcciones,
        usuario
      );

      return res.status(200).json({
        status: 'success',
        message: 'Correcciones aplicadas correctamente',
        ordenId: parseInt(ordenId),
        correcciones: correcciones.length
      });

    } catch (error) {
      logger.error('Error corrigiendo orden', {
        ordenId: req.params.ordenId,
        error: error.message
      });

      return res.status(500).json({
        status: 'error',
        error: {
          code: 'CORRECTION_ERROR',
          message: error.message
        }
      });
    }
  }

  /**
   * GET /api/training/pending
   * Obtiene órdenes pendientes de validación
   */
  async getOrdenesPendientes(req, res) {
    try {
      const limite = parseInt(req.query.limite || '50');

      const ordenes = await feedbackService.getOrdenesPendientes(limite);

      return res.status(200).json({
        status: 'success',
        count: ordenes.length,
        ordenes
      });

    } catch (error) {
      logger.error('Error obteniendo órdenes pendientes', {
        error: error.message
      });

      return res.status(500).json({
        status: 'error',
        error: {
          code: 'FETCH_ERROR',
          message: error.message
        }
      });
    }
  }

  /**
   * GET /api/training/orden/:ordenId
   * Obtiene detalle de una orden para validación
   */
  async getOrdenDetalle(req, res) {
    try {
      const { ordenId } = req.params;

      const orden = await feedbackService.getOrdenParaValidacion(parseInt(ordenId));

      return res.status(200).json({
        status: 'success',
        orden
      });

    } catch (error) {
      logger.error('Error obteniendo detalle de orden', {
        ordenId: req.params.ordenId,
        error: error.message
      });

      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
    }
  }

  /**
   * GET /api/training/stats
   * Obtiene estadísticas de training
   */
  async getEstadisticas(req, res) {
    try {
      const stats = await feedbackService.getEstadisticas();
      const trainingStats = await autoTrainingService.getTrainingStats();

      return res.status(200).json({
        status: 'success',
        estadisticas: {
          validacion: stats,
          training: trainingStats
        }
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas', {
        error: error.message
      });

      return res.status(500).json({
        status: 'error',
        error: {
          code: 'STATS_ERROR',
          message: error.message
        }
      });
    }
  }

  /**
   * POST /api/training/trigger
   * Trigger manual de training
   */
  async triggerTraining(req, res) {
    try {
      logger.info('Manual training triggered', {
        usuario: req.body.usuario || 'anonymous'
      });

      // Ejecutar training async
      autoTrainingService.triggerManualTraining()
        .then(jobId => {
          logger.info('Training job started', { jobId });
        })
        .catch(error => {
          logger.error('Training job failed', {
            error: error.message
          });
        });

      return res.status(202).json({
        status: 'success',
        message: 'Training iniciado. Recibirás notificación cuando complete.'
      });

    } catch (error) {
      logger.error('Error triggering training', {
        error: error.message
      });

      return res.status(500).json({
        status: 'error',
        error: {
          code: 'TRIGGER_ERROR',
          message: error.message
        }
      });
    }
  }
}

module.exports = new TrainingController();
