require('dotenv').config();
const { cleanupOldFiles } = require('./src/utils/cleanup');
const logger = require('./src/config/logger.config');

/**
 * Script para ejecutar limpieza automática de archivos temporales
 * Puede ser ejecutado como cron job o manualmente
 */
async function runCleanup() {
  try {
    logger.info('Starting scheduled cleanup of temporary files');

    const maxAgeMinutes = parseInt(process.env.TEMP_FILE_CLEANUP_INTERVAL || '60');
    const result = await cleanupOldFiles(null, maxAgeMinutes);

    logger.info('Cleanup completed successfully', {
      filesRemoved: result.cleaned,
      failedRemovals: result.failed,
      totalFiles: result.total,
      maxAgeMinutes
    });

    process.exit(0);
  } catch (error) {
    logger.error('Cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runCleanup();
}

module.exports = runCleanup;
