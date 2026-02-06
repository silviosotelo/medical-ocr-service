const fs = require('fs-extra');
const path = require('path');
const logger = require('../config/logger.config');

/**
 * Limpia un archivo específico
 * @param {string} filePath - Ruta del archivo a limpiar
 * @returns {Promise<boolean>}
 */
async function cleanupFile(filePath) {
  try {
    if (!filePath) return false;
    
    const exists = await fs.pathExists(filePath);
    if (!exists) return false;

    await fs.remove(filePath);
    logger.debug('File cleaned up', { filePath });
    return true;
  } catch (error) {
    logger.warn('Failed to cleanup file', {
      filePath,
      error: error.message
    });
    return false;
  }
}

/**
 * Limpia múltiples archivos
 * @param {string[]} filePaths - Array de rutas de archivos
 * @returns {Promise<Object>}
 */
async function cleanupFiles(filePaths) {
  const results = {
    total: filePaths.length,
    cleaned: 0,
    failed: 0
  };

  for (const filePath of filePaths) {
    const success = await cleanupFile(filePath);
    if (success) {
      results.cleaned++;
    } else {
      results.failed++;
    }
  }

  logger.info('Multiple files cleanup completed', results);
  return results;
}

/**
 * Limpia archivos temporales antiguos
 * @param {string} directory - Directorio a limpiar
 * @param {number} maxAgeMinutes - Edad máxima en minutos
 * @returns {Promise<Object>}
 */
async function cleanupOldFiles(directory, maxAgeMinutes = 60) {
  try {
    const tempDir = directory || process.env.TEMP_DIR || './temp';
    const exists = await fs.pathExists(tempDir);
    
    if (!exists) {
      logger.warn('Temp directory does not exist', { tempDir });
      return { cleaned: 0, failed: 0 };
    }

    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    let cleaned = 0;
    let failed = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      
      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await fs.remove(filePath);
          cleaned++;
          logger.debug('Old file removed', {
            file,
            ageMinutes: Math.round(age / 60000)
          });
        }
      } catch (error) {
        failed++;
        logger.warn('Failed to remove old file', {
          file,
          error: error.message
        });
      }
    }

    logger.info('Old files cleanup completed', {
      directory: tempDir,
      totalFiles: files.length,
      cleaned,
      failed,
      maxAgeMinutes
    });

    return { cleaned, failed, total: files.length };
  } catch (error) {
    logger.error('Cleanup old files failed', {
      directory,
      error: error.message
    });
    return { cleaned: 0, failed: 0, total: 0 };
  }
}

/**
 * Limpia todo el directorio temporal
 * @param {string} directory - Directorio a limpiar
 * @returns {Promise<boolean>}
 */
async function cleanupDirectory(directory) {
  try {
    const tempDir = directory || process.env.TEMP_DIR || './temp';
    const exists = await fs.pathExists(tempDir);
    
    if (!exists) {
      logger.warn('Directory does not exist', { directory: tempDir });
      return false;
    }

    const files = await fs.readdir(tempDir);
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      await fs.remove(filePath);
    }

    logger.info('Directory cleaned', {
      directory: tempDir,
      filesRemoved: files.length
    });

    return true;
  } catch (error) {
    logger.error('Failed to cleanup directory', {
      directory,
      error: error.message
    });
    return false;
  }
}

/**
 * Obtiene el tamaño total del directorio temporal
 * @param {string} directory - Directorio a analizar
 * @returns {Promise<Object>}
 */
async function getDirectorySize(directory) {
  try {
    const tempDir = directory || process.env.TEMP_DIR || './temp';
    const exists = await fs.pathExists(tempDir);
    
    if (!exists) {
      return { files: 0, sizeBytes: 0, sizeMB: 0 };
    }

    const files = await fs.readdir(tempDir);
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }

    return {
      files: files.length,
      sizeBytes: totalSize,
      sizeKB: Math.round(totalSize / 1024),
      sizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    logger.error('Failed to get directory size', {
      directory,
      error: error.message
    });
    return { files: 0, sizeBytes: 0, sizeMB: 0 };
  }
}

module.exports = {
  cleanupFile,
  cleanupFiles,
  cleanupOldFiles,
  cleanupDirectory,
  getDirectorySize
};
