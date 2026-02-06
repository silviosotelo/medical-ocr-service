const logger = require('../config/logger.config');

// Almacenamiento en memoria de métricas (en producción usar Redis o DB)
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalTokensUsed: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalProcessingTimeMs: 0,
  averageProcessingTimeMs: 0,
  estimatedCostUSD: 0,
  requestsByHour: {},
  errorsByType: {},
  startTime: Date.now()
};

/**
 * Registra el uso de tokens de OpenAI
 * @param {Object} data - Datos de uso de tokens
 */
function trackTokenUsage(data) {
  const {
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    model = 'gpt-4o',
    processingTimeMs = 0
  } = data;

  metrics.totalTokensUsed += totalTokens;
  metrics.totalPromptTokens += promptTokens;
  metrics.totalCompletionTokens += completionTokens;
  metrics.totalProcessingTimeMs += processingTimeMs;

  // Calcular costo estimado (precios aproximados de GPT-4o)
  const COST_PER_1K_PROMPT = 0.005;
  const COST_PER_1K_COMPLETION = 0.015;
  
  const requestCost = 
    (promptTokens / 1000) * COST_PER_1K_PROMPT +
    (completionTokens / 1000) * COST_PER_1K_COMPLETION;
  
  metrics.estimatedCostUSD += requestCost;

  // Tracking por hora
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  if (!metrics.requestsByHour[hour]) {
    metrics.requestsByHour[hour] = {
      count: 0,
      tokens: 0,
      costUSD: 0
    };
  }
  metrics.requestsByHour[hour].count++;
  metrics.requestsByHour[hour].tokens += totalTokens;
  metrics.requestsByHour[hour].costUSD += requestCost;

  logger.info('Token usage tracked', {
    promptTokens,
    completionTokens,
    totalTokens,
    costUSD: requestCost.toFixed(6),
    processingTimeMs
  });
}

/**
 * Registra una solicitud exitosa
 * @param {number} processingTimeMs
 */
function trackSuccess(processingTimeMs = 0) {
  metrics.totalRequests++;
  metrics.successfulRequests++;
  metrics.totalProcessingTimeMs += processingTimeMs;
  metrics.averageProcessingTimeMs = 
    metrics.totalProcessingTimeMs / metrics.totalRequests;

  logger.debug('Success tracked', {
    totalRequests: metrics.totalRequests,
    successRate: ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2) + '%'
  });
}

/**
 * Registra un error
 * @param {string} errorType - Tipo de error
 * @param {string} errorMessage - Mensaje de error
 */
function trackError(errorType, errorMessage) {
  metrics.totalRequests++;
  metrics.failedRequests++;

  if (!metrics.errorsByType[errorType]) {
    metrics.errorsByType[errorType] = {
      count: 0,
      lastMessage: '',
      lastOccurrence: null
    };
  }

  metrics.errorsByType[errorType].count++;
  metrics.errorsByType[errorType].lastMessage = errorMessage;
  metrics.errorsByType[errorType].lastOccurrence = new Date().toISOString();

  logger.debug('Error tracked', {
    errorType,
    totalErrors: metrics.failedRequests,
    errorRate: ((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(2) + '%'
  });
}

/**
 * Obtiene las métricas actuales
 * @returns {Object}
 */
function getMetrics() {
  const uptime = Date.now() - metrics.startTime;
  const uptimeMinutes = Math.floor(uptime / 60000);
  const uptimeHours = Math.floor(uptimeMinutes / 60);

  return {
    uptime: {
      ms: uptime,
      minutes: uptimeMinutes,
      hours: uptimeHours,
      formatted: `${uptimeHours}h ${uptimeMinutes % 60}m`
    },
    requests: {
      total: metrics.totalRequests,
      successful: metrics.successfulRequests,
      failed: metrics.failedRequests,
      successRate: metrics.totalRequests > 0 
        ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    },
    tokens: {
      total: metrics.totalTokensUsed,
      prompt: metrics.totalPromptTokens,
      completion: metrics.totalCompletionTokens,
      averagePerRequest: metrics.successfulRequests > 0
        ? Math.round(metrics.totalTokensUsed / metrics.successfulRequests)
        : 0
    },
    performance: {
      totalProcessingTimeMs: metrics.totalProcessingTimeMs,
      averageProcessingTimeMs: Math.round(metrics.averageProcessingTimeMs),
      averageProcessingTimeSec: (metrics.averageProcessingTimeMs / 1000).toFixed(2)
    },
    cost: {
      estimatedUSD: metrics.estimatedCostUSD.toFixed(4),
      averagePerRequest: metrics.successfulRequests > 0
        ? (metrics.estimatedCostUSD / metrics.successfulRequests).toFixed(6)
        : '0.000000'
    },
    errors: metrics.errorsByType,
    hourly: metrics.requestsByHour
  };
}

/**
 * Reinicia las métricas
 */
function resetMetrics() {
  logger.info('Resetting metrics', { currentMetrics: getMetrics() });
  
  metrics.totalRequests = 0;
  metrics.successfulRequests = 0;
  metrics.failedRequests = 0;
  metrics.totalTokensUsed = 0;
  metrics.totalPromptTokens = 0;
  metrics.totalCompletionTokens = 0;
  metrics.totalProcessingTimeMs = 0;
  metrics.averageProcessingTimeMs = 0;
  metrics.estimatedCostUSD = 0;
  metrics.requestsByHour = {};
  metrics.errorsByType = {};
  metrics.startTime = Date.now();
}

module.exports = {
  trackTokenUsage,
  trackSuccess,
  trackError,
  getMetrics,
  resetMetrics
};
