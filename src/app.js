const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const apiRoutes = require('./routes/api.routes');
const v1Routes = require('./routes/v1/index');
const healthRoutes = require('./routes/health.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const requestLogger = require('./middlewares/request-logger.middleware');
const logger = require('./config/logger.config');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins === '*') {
      callback(null, true);
    } else {
      const origins = allowedOrigins.split(',').map(o => o.trim());
      if (!origin || origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Api-Key'],
  credentials: true,
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());
app.use(requestLogger);
app.disable('x-powered-by');

app.use('/api/v1', v1Routes);
app.use('/api', apiRoutes);
app.use('/health', healthRoutes);

app.get('/', (req, res) => {
  res.json({
    service: 'Medical OCR SaaS Platform',
    version: '6.0.0',
    architecture: 'API-First',
    status: 'running',
    endpoints: {
      v1: '/api/v1',
      legacy: '/api',
      health: '/health',
      portal: '/portal',
    },
  });
});

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use('/portal', express.static(frontendDist));

app.get('/portal*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) {
      res.status(200).json({ message: 'Frontend not built yet. Run: cd frontend && npm run build' });
    }
  });
});

app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path, ip: req.ip });
  res.status(404).json({
    status: 'error',
    error: { code: 'NOT_FOUND', message: 'Endpoint no encontrado' },
  });
});

app.use(errorMiddleware);

module.exports = app;
