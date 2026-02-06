const logger = require('../config/logger.config');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Middleware de manejo global de errores
 */
function errorMiddleware(err, req, res, next) {
  // Log del error
  logger.error('Global error handler', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Error de validación de Express Validator
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Error de validación',
        details: err.errors
      }
    });
  }

  // Error de JSON mal formado
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'JSON mal formado en el cuerpo de la solicitud'
      }
    });
  }

  // Error de archivo demasiado grande (ya manejado por Multer, pero por si acaso)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: ERROR_CODES.FILE_TOO_LARGE,
        message: 'El archivo excede el tamaño máximo permitido'
      }
    });
  }

  // Error desconocido - respuesta genérica
  const statusCode = err.statusCode || 500;
  
  return res.status(statusCode).json({
    status: 'error',
    timestamp: new Date().toISOString(),
    error: {
      code: err.code || ERROR_CODES.PROCESSING_ERROR,
      message: process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : err.message
    }
  });
}

module.exports = errorMiddleware;
