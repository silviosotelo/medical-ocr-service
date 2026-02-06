const pdfService = require('./pdf.service');
const imageService = require('./image.service');
const aiService = require('./ai.service');
const validationService = require('./validation.service');
const logger = require('../config/logger.config');
const { cleanupFiles } = require('../utils/cleanup');

/**
 * Procesa múltiples órdenes médicas en paralelo
 */
class BatchService {
  constructor() {
    this.maxConcurrency = parseInt(process.env.BATCH_MAX_CONCURRENCY || '5');
    this.activeJobs = new Map();
  }

  /**
   * Procesa un array de archivos en batch
   * @param {Array} files - Array de archivos de multer
   * @param {Object} opciones - Opciones de procesamiento
   * @returns {Promise<Object>} - Resultados del batch
   */
  async processBatch(files, opciones = {}) {
    const batchId = this.generateBatchId();
    const startTime = Date.now();

    logger.info('Starting batch processing', {
      batchId,
      filesCount: files.length,
      opciones
    });

    // Registrar job
    this.activeJobs.set(batchId, {
      startTime,
      filesCount: files.length,
      status: 'processing'
    });

    try {
      // Dividir en chunks según concurrencia
      const chunks = this.chunkArray(files, this.maxConcurrency);
      const allResults = [];
      let processedCount = 0;

      for (const chunk of chunks) {
        logger.info(`Processing chunk of ${chunk.length} files`, { batchId });

        // Procesar chunk en paralelo
        const chunkResults = await Promise.allSettled(
          chunk.map(file => this.processFile(file, opciones, batchId))
        );

        // Agregar resultados
        for (const result of chunkResults) {
          processedCount++;
          if (result.status === 'fulfilled') {
            allResults.push({
              status: 'success',
              ...result.value
            });
          } else {
            allResults.push({
              status: 'error',
              error: {
                message: result.reason.message,
                filename: result.reason.filename || 'unknown'
              }
            });
          }

          // Log progreso
          logger.info(`Batch progress: ${processedCount}/${files.length}`, {
            batchId,
            percentage: Math.round((processedCount / files.length) * 100)
          });
        }
      }

      const totalTime = Date.now() - startTime;
      const summary = this.generateSummary(allResults, totalTime);

      // Actualizar job
      this.activeJobs.set(batchId, {
        ...this.activeJobs.get(batchId),
        status: 'completed',
        completedAt: Date.now(),
        summary
      });

      logger.info('Batch processing completed', {
        batchId,
        totalTimeMs: totalTime,
        summary
      });

      return {
        batchId,
        status: 'completed',
        processingTimeMs: totalTime,
        summary,
        results: allResults
      };

    } catch (error) {
      logger.error('Batch processing failed', {
        batchId,
        error: error.message,
        stack: error.stack
      });

      this.activeJobs.set(batchId, {
        ...this.activeJobs.get(batchId),
        status: 'failed',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Procesa un archivo individual
   * @private
   */
  async processFile(file, opciones, batchId) {
    const tempFiles = [];
    const startTime = Date.now();

    try {
      logger.debug('Processing individual file in batch', {
        batchId,
        filename: file.originalname
      });

      tempFiles.push(file.path);
      let imagePath = file.path;

      // Convertir PDF si es necesario
      if (file.mimetype === 'application/pdf') {
        imagePath = await pdfService.convertToImage(file.path);
        tempFiles.push(imagePath);
      }

      // Validar imagen
      const isValid = await imageService.validate(imagePath);
      if (!isValid) {
        throw new Error('Invalid or corrupted image file');
      }

      // Procesar imagen
      const { base64, originalSize, processedSize, dimensions } = 
        await imageService.toBase64(imagePath);

      // Analizar con IA
      const aiResult = await aiService.analyzeOrder(base64, opciones);

      // Validar
      const validatedData = await validationService.validate(aiResult.data);

      const processingTime = Date.now() - startTime;

      return {
        filename: file.originalname,
        processingTimeMs: processingTime,
        data: validatedData,
        archivo_procesado: {
          nombre_original: file.originalname,
          tipo: file.mimetype,
          tamaño_kb: Math.round(originalSize / 1024),
          dimensiones: dimensions
        },
        ia_metadata: {
          tokens_usados: aiResult.metadata.tokensUsed
        }
      };

    } catch (error) {
      logger.error('Failed to process file in batch', {
        batchId,
        filename: file.originalname,
        error: error.message
      });

      error.filename = file.originalname;
      throw error;

    } finally {
      // Limpiar archivos temporales
      await cleanupFiles(tempFiles);
    }
  }

  /**
   * Obtiene el estado de un batch job
   * @param {string} batchId
   * @returns {Object|null}
   */
  getBatchStatus(batchId) {
    return this.activeJobs.get(batchId) || null;
  }

  /**
   * Lista todos los batch jobs activos
   * @returns {Array}
   */
  listActiveBatches() {
    return Array.from(this.activeJobs.entries()).map(([id, job]) => ({
      batchId: id,
      ...job
    }));
  }

  /**
   * Genera resumen de resultados
   * @private
   */
  generateSummary(results, totalTimeMs) {
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    const totalTokens = results
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + (r.ia_metadata?.tokens_usados || 0), 0);

    return {
      total: results.length,
      successful,
      failed,
      successRate: ((successful / results.length) * 100).toFixed(2) + '%',
      totalTimeMs,
      averageTimeMs: Math.round(totalTimeMs / results.length),
      totalTokensUsed: totalTokens,
      averageTokensPerFile: successful > 0 ? Math.round(totalTokens / successful) : 0
    };
  }

  /**
   * Divide array en chunks
   * @private
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Genera ID único para batch
   * @private
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Limpia jobs completados antiguos (>1 hora)
   */
  cleanupOldJobs() {
    const oneHourAgo = Date.now() - 3600000;
    for (const [batchId, job] of this.activeJobs.entries()) {
      if (job.completedAt && job.completedAt < oneHourAgo) {
        this.activeJobs.delete(batchId);
      }
    }
  }
}

module.exports = new BatchService();
