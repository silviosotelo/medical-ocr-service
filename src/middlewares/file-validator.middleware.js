const fs = require('fs-extra');
const logger = require('../config/logger.config');
const { ALLOWED_MIME_TYPES, ERROR_CODES } = require('../utils/constants');

/**
 * Lee los primeros bytes de un archivo para verificar magic numbers
 * @param {string} filePath - Ruta del archivo
 * @param {number} bytesCount - Cantidad de bytes a leer
 * @returns {Promise<Buffer>}
 */
async function readMagicNumbers(filePath, bytesCount = 10) {
  const buffer = Buffer.alloc(bytesCount);
  const fd = await fs.open(filePath, 'r');
  
  try {
    await fs.read(fd, buffer, 0, bytesCount, 0);
    return buffer;
  } finally {
    await fs.close(fd);
  }
}

/**
 * Verifica el tipo real del archivo usando magic numbers
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<string|null>} - MIME type detectado o null
 */
async function detectFileType(filePath) {
  try {
    const buffer = await readMagicNumbers(filePath);
    
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && 
        buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png';
    }
    
    // PDF: 25 50 44 46 (%PDF)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && 
        buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    
    return null;
  } catch (error) {
    logger.error('Failed to detect file type', {
      filePath,
      error: error.message
    });
    return null;
  }
}

/**
 * Middleware de validación de archivos
 */
async function fileValidatorMiddleware(req, res, next) {
  try {
    if (!req.file) {
      return next();
    }

    const { file } = req;

    logger.info('Validating uploaded file', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    // 1. Verificar tipo MIME declarado
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      logger.warn('Invalid MIME type', {
        filename: file.originalname,
        mimetype: file.mimetype,
        allowed: ALLOWED_MIME_TYPES
      });

      // Limpiar archivo rechazado
      await fs.remove(file.path);

      return res.status(400).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.INVALID_FILE_TYPE,
          message: `Tipo de archivo no permitido: ${file.mimetype}`,
          allowedTypes: ALLOWED_MIME_TYPES
        }
      });
    }

    // 2. Verificar magic numbers (prevenir spoofing)
    const detectedType = await detectFileType(file.path);
    
    if (!detectedType) {
      logger.warn('Could not detect file type from magic numbers', {
        filename: file.originalname,
        declaredType: file.mimetype
      });

      await fs.remove(file.path);

      return res.status(400).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.CORRUPTED_FILE,
          message: 'No se pudo determinar el tipo de archivo - posible archivo corrupto'
        }
      });
    }

    if (detectedType !== file.mimetype) {
      logger.warn('File type mismatch - possible spoofing attempt', {
        filename: file.originalname,
        declaredType: file.mimetype,
        detectedType: detectedType
      });

      await fs.remove(file.path);

      return res.status(400).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.INVALID_FILE_TYPE,
          message: `Tipo de archivo no coincide. Declarado: ${file.mimetype}, Detectado: ${detectedType}`
        }
      });
    }

    // 3. Validar que el archivo no esté vacío
    if (file.size === 0) {
      logger.warn('Empty file uploaded', {
        filename: file.originalname
      });

      await fs.remove(file.path);

      return res.status(400).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          code: ERROR_CODES.INVALID_IMAGE,
          message: 'El archivo está vacío'
        }
      });
    }

    logger.info('File validation passed', {
      filename: file.originalname,
      mimetype: file.mimetype,
      detectedType: detectedType,
      sizeKB: Math.round(file.size / 1024)
    });

    next();

  } catch (error) {
    logger.error('File validation error', {
      error: error.message,
      stack: error.stack,
      filename: req.file?.originalname
    });

    // Limpiar archivo en caso de error
    if (req.file?.path) {
      await fs.remove(req.file.path);
    }

    return res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: ERROR_CODES.PROCESSING_ERROR,
        message: 'Error validando el archivo'
      }
    });
  }
}

module.exports = fileValidatorMiddleware;
