const OpenAI = require('openai');
const logger = require('./logger.config');

if (!process.env.OPENAI_API_KEY) {
  logger.error('OPENAI_API_KEY no está configurada en variables de entorno');
  throw new Error('OPENAI_API_KEY is required');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000'),
  maxRetries: 2
});

// Verificar conexión al inicializar
openai.models.list()
  .then(() => {
    logger.info('OpenAI client initialized successfully');
  })
  .catch((error) => {
    logger.error('Failed to initialize OpenAI client', {
      error: error.message
    });
  });

module.exports = openai;
