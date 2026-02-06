require('dotenv').config();
const app = require('./src/app');
const logger = require('./src/config/logger.config');
const pdfService = require('./src/services/pdf.service');
const fs = require('fs-extra');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Crear directorios necesarios
async function initializeDirectories() {
  const directories = [
    process.env.TEMP_DIR || './temp',
    './logs'
  ];

  for (const dir of directories) {
    await fs.ensureDir(dir);
    logger.info(`Directory initialized: ${dir}`);
  }
}

// Verificar dependencias del sistema
async function checkSystemDependencies() {
  logger.info('Checking system dependencies...');
  
  const popplerInstalled = await pdfService.checkDependencies();
  
  if (!popplerInstalled) {
    logger.error('CRITICAL: poppler-utils not installed. Run: sudo apt-get install poppler-utils');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    logger.error('CRITICAL: OPENAI_API_KEY not configured in .env');
    process.exit(1);
  }

  logger.info('All system dependencies verified ✓');
}

// Iniciar servidor
async function startServer() {
  try {
    await initializeDirectories();
    await checkSystemDependencies();

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Medical OCR Service running on port ${PORT}`);
      logger.info(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Missing ✗'}`);
      logger.info(`📂 Temp directory: ${process.env.TEMP_DIR || './temp'}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Limpiar archivos temporales
        try {
          const tempDir = process.env.TEMP_DIR || './temp';
          const files = await fs.readdir(tempDir);
          for (const file of files) {
            await fs.remove(path.join(tempDir, file));
          }
          logger.info('Temporary files cleaned up');
        } catch (error) {
          logger.error('Error cleaning temp files', { error: error.message });
        }

        logger.info('Shutdown complete');
        process.exit(0);
      });

      // Forzar cierre después de 10 segundos
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Manejo de errores no capturados
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason,
        promise: promise
      });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

startServer();
