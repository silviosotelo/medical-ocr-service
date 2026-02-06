const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const apiRoutes = require('./routes/api.routes');
const healthRoutes = require('./routes/health.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const requestLogger = require('./middlewares/request-logger.middleware');
const logger = require('./config/logger.config');

const app = express();

// Configuración de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 horas
};
app.use(cors(corsOptions));

// Compresión de respuestas
app.use(compression());

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Logging de requests
app.use(requestLogger);

// Deshabilitar header X-Powered-By
app.disable('x-powered-by');

// Rutas
app.use('/api', apiRoutes);
app.use('/health', healthRoutes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    service: 'Medical OCR Microservice',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      visar: 'POST /api/visar',
      health: 'GET /health',
      metrics: 'GET /health/metrics'
    }
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  res.status(404).json({
    status: 'error',
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint no encontrado'
    }
  });
});

// Error handler global
app.use(errorMiddleware);

module.exports = app;
