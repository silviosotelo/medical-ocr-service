const logger = require('../config/logger.config');

/**
 * Middleware para loggear todas las solicitudes HTTP
 */
function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();

  // Capturar el método original de res.json para loggear la respuesta
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Datos de la solicitud
  const requestData = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.method !== 'GET' && req.body && Object.keys(req.body).length > 0
      ? { ...req.body, opciones: req.body.opciones ? '[present]' : undefined }
      : undefined,
    file: req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : undefined
  };

  // Log de solicitud entrante
  logger.info('Incoming request', requestData);

  // Override res.json para capturar respuesta
  res.json = function(data) {
    const duration = Date.now() - start;
    
    logger.info('Outgoing response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      contentType: res.get('Content-Type'),
      success: data.status === 'success'
    });

    // Loggear a nivel específico según status
    if (res.statusCode >= 500) {
      logger.error('Server error response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        error: data.error
      });
    } else if (res.statusCode >= 400) {
      logger.warn('Client error response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        error: data.error
      });
    }

    return originalJson(data);
  };

  // Override res.send para otros tipos de respuesta
  res.send = function(data) {
    const duration = Date.now() - start;
    
    logger.info('Outgoing response (send)', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration
    });

    return originalSend(data);
  };

  // Handler para cuando la respuesta termine
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Solo loggear si no se loggeó antes (por ejemplo, archivos estáticos)
    if (!res.headersSent || res.get('X-Already-Logged')) {
      return;
    }

    logger.debug('Response finished', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration
    });
  });

  next();
}

module.exports = requestLoggerMiddleware;
