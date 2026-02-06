const pdfService = require('../services/pdf.service');
const imageService = require('../services/image.service');
const aiService = require('../services/ai.service');
const validationService = require('../services/validation.service');
const logger = require('../config/logger.config');
const { cleanupFile, cleanupFiles } = require('../utils/cleanup');
const { trackSuccess, trackError } = require('../utils/metrics');
const { ERROR_CODES } = require('../utils/constants');

class VisacionController {
  /**
   * Procesa una orden médica
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  async processOrder(req, res) {
    const tempFiles = [];
    const startTime = Date.now();
    let processingStage = 'initialization';

    try {
      // PASO 0: Validar archivo subido
      const { file } = req;
      
      if (!file) {
        return res.status(400).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: {
            code: ERROR_CODES.NO_FILE,
            message: 'Debe enviar un archivo en el campo "archivo"'
          }
        });
      }

      // Parsear opciones
      let opciones = {};
      if (req.body.opciones) {
        try {
          opciones = JSON.parse(req.body.opciones);
        } catch (parseError) {
          logger.warn('Failed to parse opciones', {
            opcionesRaw: req.body.opciones,
            error: parseError.message
          });
        }
      }

      logger.info('Processing medical order', {
        filename: file.originalname,
        mimetype: file.mimetype,
        sizeKB: Math.round(file.size / 1024),
        opciones,
        ip: req.ip
      });

      // Auditar inicio de procesamiento
      logger.audit('Order processing started', {
        filename: file.originalname,
        fileType: file.mimetype,
        sizeBytes: file.size,
        opciones,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      tempFiles.push(file.path);
      let imagePath = file.path;

      // PASO 1: Normalizar a imagen (si es PDF)
      processingStage = 'pdf_conversion';
      if (file.mimetype === 'application/pdf') {
        logger.info('Converting PDF to image');
        imagePath = await pdfService.convertToImage(file.path);
        tempFiles.push(imagePath);
      }

      // PASO 2: Validar imagen
      processingStage = 'image_validation';
      const isValid = await imageService.validate(imagePath);
      if (!isValid) {
        throw new Error('Archivo de imagen corrupto o inválido');
      }

      // PASO 3: Convertir a Base64
      processingStage = 'image_processing';
      const {
        base64,
        originalSize,
        processedSize,
        dimensions,
        format,
        compressed
      } = await imageService.toBase64(imagePath);

      logger.info('Image processed', {
        dimensions: `${dimensions.width}x${dimensions.height}`,
        format,
        originalKB: Math.round(originalSize / 1024),
        processedKB: Math.round(processedSize / 1024),
        compressed
      });

      // PASO 4: Analizar con GPT-4o Vision
      processingStage = 'ai_analysis';
      const aiResult = await aiService.analyzeOrder(base64, opciones);

      // PASO 5: Validar y enriquecer respuesta
      processingStage = 'validation';
      const validatedData = await validationService.validate(aiResult.data);

      // PASO 6: Construir respuesta final
      const processingTime = Date.now() - startTime;

      const response = {
        status: 'success',
        timestamp: new Date().toISOString(),
        processingTime: (processingTime / 1000).toFixed(2), // En segundos
        data: validatedData,
        archivo_procesado: {
          nombre_original: file.originalname,
          tipo: file.mimetype,
          tamaño_kb: Math.round(originalSize / 1024),
          dimensiones: dimensions,
          formato: format,
          comprimido: compressed,
          paginas_procesadas: file.mimetype === 'application/pdf' ? 1 : null
        },
        ia_metadata: {
          modelo: aiResult.metadata.model,
          tokens_usados: aiResult.metadata.tokensUsed,
          tokens_prompt: aiResult.metadata.promptTokens,
          tokens_completion: aiResult.metadata.completionTokens,
          tiempo_ia_ms: aiResult.metadata.processingTimeMs,
          finish_reason: aiResult.metadata.finishReason
        }
      };

      // Tracking de métricas
      trackSuccess(processingTime);

      logger.info('Order processed successfully', {
        filename: file.originalname,
        totalTimeMs: processingTime,
        tokensUsed: aiResult.metadata.tokensUsed,
        tipoEscritura: validatedData.metadatos.tipo_escritura,
        legibilidad: validatedData.metadatos.legibilidad,
        practicasDetectadas: validatedData.detalle_practicas.length,
        requiereRevision: validatedData.metadatos.requiere_revision_humana
      });

      // Auditar procesamiento exitoso
      logger.audit('Order processed successfully', {
        filename: file.originalname,
        processingTimeMs: processingTime,
        tokensUsed: aiResult.metadata.tokensUsed,
        practicas: validatedData.detalle_practicas.length,
        urgente: validatedData.metadatos.es_urgente,
        requiereRevision: validatedData.metadatos.requiere_revision_humana
      });

      return res.status(200).json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Determinar código de error
      let errorCode = ERROR_CODES.PROCESSING_ERROR;
      if (processingStage === 'pdf_conversion') {
        errorCode = ERROR_CODES.PDF_CONVERSION_ERROR;
      } else if (processingStage === 'image_processing' || processingStage === 'image_validation') {
        errorCode = ERROR_CODES.IMAGE_PROCESSING_ERROR;
      } else if (processingStage === 'ai_analysis') {
        errorCode = ERROR_CODES.AI_SERVICE_ERROR;
      } else if (processingStage === 'validation') {
        errorCode = ERROR_CODES.VALIDATION_ERROR;
      }

      trackError(errorCode, error.message);

      logger.error('Error processing order', {
        error: error.message,
        stack: error.stack,
        stage: processingStage,
        filename: req.file?.originalname,
        processingTimeMs: processingTime
      });

      // Auditar error
      logger.audit('Order processing failed', {
        filename: req.file?.originalname,
        error: error.message,
        stage: processingStage,
        processingTimeMs: processingTime
      });

      return res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: errorCode,
          message: error.message,
          stage: processingStage
        }
      });

    } finally {
      // CRÍTICO: Limpiar archivos temporales SIEMPRE
      if (tempFiles.length > 0) {
        await cleanupFiles(tempFiles);
      }
    }
  }

  /**
   * Health check del servicio
   * @param {Object} req
   * @param {Object} res
   */
  async healthCheck(req, res) {
    try {
      const popplerInstalled = await pdfService.checkDependencies();
      const openaiHealthy = await aiService.healthCheck();
      
      const healthy = popplerInstalled && openaiHealthy && !!process.env.OPENAI_API_KEY;

      return res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        dependencies: {
          poppler: popplerInstalled,
          openai: openaiHealthy,
          apiKeyConfigured: !!process.env.OPENAI_API_KEY
        },
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      
      return res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
}

module.exports = new VisacionController();
