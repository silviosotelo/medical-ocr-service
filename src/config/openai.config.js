const OpenAI = require('openai');
const logger = require('./logger.config');

if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY no está configurada en variables de entorno');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000'),
      maxRetries: 2,
    })
  : null;

if (openai) {
  openai.models.list()
    .then(() => {
      logger.info('OpenAI client initialized successfully');
    })
    .catch((error) => {
      logger.error('Failed to initialize OpenAI client', {
        error: error.message,
      });
    });
}

module.exports = openai;
