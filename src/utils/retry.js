const logger = require('../config/logger.config');

/**
 * Ejecuta una función con retry y exponential backoff
 * @param {Function} fn - Función a ejecutar
 * @param {number} maxAttempts - Número máximo de intentos
 * @param {number} initialDelay - Delay inicial en ms
 * @param {number} maxDelay - Delay máximo en ms
 * @returns {Promise<any>}
 */
async function retryWithBackoff(
  fn,
  maxAttempts = 3,
  initialDelay = 1000,
  maxDelay = 10000
) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug(`Attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (error) {
      lastError = error;
      
      // No reintentar en ciertos errores
      if (
        error.status === 400 || // Bad request
        error.status === 401 || // Unauthorized
        error.status === 403    // Forbidden
      ) {
        logger.warn('Non-retryable error detected', {
          status: error.status,
          message: error.message
        });
        throw error;
      }

      if (attempt < maxAttempts) {
        // Calcular delay con exponential backoff
        const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
        
        logger.warn(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`, {
          error: error.message,
          status: error.status
        });

        await sleep(delay);
      }
    }
  }

  logger.error('All retry attempts failed', {
    maxAttempts,
    lastError: lastError.message
  });

  throw lastError;
}

/**
 * Sleep helper
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  retryWithBackoff,
  sleep
};
