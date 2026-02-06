const batchService = require('../services/batch.service');
const logger = require('../config/logger.config');
const { ERROR_CODES } = require('../utils/constants');

class BatchController {
  /**
   * Procesa múltiples órdenes médicas en batch
   * @param {Object} req
   * @param {Object} res
   */
  async processBatch(req, res) {
    try {
      const { files } = req;

      if (!files || files.length === 0) {
        return res.status(400).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: {
            code: ERROR_CODES.NO_FILE,
            message: 'Debe enviar al menos un archivo'
          }
        });
      }

      // Validar límite de archivos
      const maxFiles = parseInt(process.env.BATCH_MAX_FILES || '20');
      if (files.length > maxFiles) {
        return res.status(400).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: {
            code: 'TOO_MANY_FILES',
            message: `Máximo ${maxFiles} archivos permitidos. Recibidos: ${files.length}`
          }
        });
      }

      // Parsear opciones
      let opciones = {};
      if (req.body.opciones) {
        try {
          opciones = JSON.parse(req.body.opciones);
        } catch (parseError) {
          logger.warn('Failed to parse opciones in batch', {
            opcionesRaw: req.body.opciones,
            error: parseError.message
          });
        }
      }

      logger.info('Starting batch processing request', {
        filesCount: files.length,
        filenames: files.map(f => f.originalname),
        opciones,
        ip: req.ip
      });

      // Auditar inicio de batch
      logger.audit('Batch processing started', {
        filesCount: files.length,
        totalSizeKB: files.reduce((sum, f) => sum + f.size, 0) / 1024,
        opciones,
        ip: req.ip
      });

      // Procesar batch
      const result = await batchService.processBatch(files, opciones);

      // Auditar completado
      logger.audit('Batch processing completed', {
        batchId: result.batchId,
        summary: result.summary
      });

      return res.status(200).json({
        status: 'success',
        timestamp: new Date().toISOString(),
        ...result
      });

    } catch (error) {
      logger.error('Batch processing error', {
        error: error.message,
        stack: error.stack,
        filesCount: req.files?.length
      });

      return res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.PROCESSING_ERROR,
          message: error.message
        }
      });
    }
  }

  /**
   * Obtiene el estado de un batch
   * @param {Object} req
   * @param {Object} res
   */
  async getBatchStatus(req, res) {
    try {
      const { batchId } = req.params;

      const status = batchService.getBatchStatus(batchId);

      if (!status) {
        return res.status(404).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: {
            code: 'BATCH_NOT_FOUND',
            message: `Batch con ID ${batchId} no encontrado`
          }
        });
      }

      return res.status(200).json({
        status: 'success',
        timestamp: new Date().toISOString(),
        batchId,
        ...status
      });

    } catch (error) {
      logger.error('Error getting batch status', {
        error: error.message,
        batchId: req.params.batchId
      });

      return res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.PROCESSING_ERROR,
          message: error.message
        }
      });
    }
  }

  /**
   * Lista todos los batches activos
   * @param {Object} req
   * @param {Object} res
   */
  async listActiveBatches(req, res) {
    try {
      const batches = batchService.listActiveBatches();

      return res.status(200).json({
        status: 'success',
        timestamp: new Date().toISOString(),
        count: batches.length,
        batches
      });

    } catch (error) {
      logger.error('Error listing active batches', {
        error: error.message
      });

      return res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.PROCESSING_ERROR,
          message: error.message
        }
      });
    }
  }
}

module.exports = new BatchController();
