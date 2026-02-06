const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } = require('../utils/constants');
const logger = require('./logger.config');

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = process.env.TEMP_DIR || './temp';
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Sanitizar nombre de archivo
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 100);
    
    const uniqueName = `${uuidv4()}-${sanitizedName}`;
    cb(null, uniqueName);
  }
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
  logger.info('File upload attempt', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  // Validar tipo MIME
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error(`Tipo de archivo no permitido: ${file.mimetype}`);
    error.code = 'INVALID_FILE_TYPE';
    logger.warn('File rejected - invalid MIME type', {
      originalname: file.originalname,
      mimetype: file.mimetype
    });
    return cb(error, false);
  }

  // Validar extensión
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf'];
  
  if (!allowedExts.includes(ext)) {
    const error = new Error(`Extensión no permitida: ${ext}`);
    error.code = 'INVALID_FILE_EXTENSION';
    logger.warn('File rejected - invalid extension', {
      originalname: file.originalname,
      extension: ext
    });
    return cb(error, false);
  }

  cb(null, true);
};

// Configuración de Multer para archivo único
const uploadSingle = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  }
});

// Configuración de Multer para batch (múltiples archivos)
const uploadBatch = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: parseInt(process.env.BATCH_MAX_FILES || '20')
  }
});

// Manejador de errores de Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.error('Multer error', {
      code: err.code,
      message: err.message,
      field: err.field
    });

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        status: 'error',
        error: {
          code: 'FILE_TOO_LARGE',
          message: `El archivo excede el tamaño máximo permitido de ${MAX_FILE_SIZE / 1024 / 1024}MB`
        }
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'UNEXPECTED_FILE',
          message: 'Campo de archivo inesperado'
        }
      });
    }

    return res.status(400).json({
      status: 'error',
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message
      }
    });
  }

  if (err && err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'INVALID_FILE_TYPE',
        message: err.message
      }
    });
  }

  next(err);
};

module.exports = {
  uploadSingle,
  uploadBatch,
  handleMulterError,
  // Mantener compatibilidad con código existente
  upload: uploadSingle
};
