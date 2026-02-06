const rateLimit = require('express-rate-limit');
const logger = require('../config/logger.config');
const { RATE_LIMIT, ERROR_CODES } = require('../utils/constants');

// Configuración de rate limiter
const limiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 'error',
    error: {
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      message: `Demasiadas solicitudes. Límite: ${RATE_LIMIT.MAX_REQUESTS} requests por ${RATE_LIMIT.WINDOW_MS / 1000} segundos`
    }
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']
    });

    res.status(429).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: `Demasiadas solicitudes desde esta IP. Límite: ${RATE_LIMIT.MAX_REQUESTS} requests por ${RATE_LIMIT.WINDOW_MS / 1000} segundos`,
        retryAfter: res.getHeader('Retry-After')
      }
    });
  },
  skip: (req) => {
    // Skip rate limiting para health checks
    return req.path === '/health' || req.path === '/health/metrics';
  },
  keyGenerator: (req) => {
    // Usar IP del cliente como key
    return req.ip;
  }
});

module.exports = limiter;
