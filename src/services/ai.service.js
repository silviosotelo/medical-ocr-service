const openai = require('../config/openai.config');
const logger = require('../config/logger.config');
const { retryWithBackoff } = require('../utils/retry');
const { trackTokenUsage } = require('../utils/metrics');
const SYSTEM_PROMPT = require('../prompts/system.prompt');
const generateUserPrompt = require('../prompts/user.prompt.template');
const { OPENAI } = require('../utils/constants');

class AIService {
  /**
   * Analiza orden médica con GPT-4o Vision
   * @param {string} base64Image - Imagen en base64
   * @param {Object} opciones - Opciones de procesamiento
   * @returns {Promise<Object>} - Datos estructurados extraídos
   */
  async analyzeOrder(base64Image, opciones = {}) {
    const startTime = Date.now();

    try {
      logger.info('Initiating GPT-4o Vision analysis', {
        opciones,
        imageSizeKB: Math.round(base64Image.length / 1024)
      });

      // Construir prompt de usuario dinámico
      const userPrompt = generateUserPrompt(opciones);

      // Llamada a OpenAI con retry logic
      const response = await retryWithBackoff(
        async () => {
          return await openai.chat.completions.create({
            model: OPENAI.MODEL,
            messages: [
              {
                role: 'system',
                content: SYSTEM_PROMPT
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: userPrompt
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`,
                      detail: OPENAI.DETAIL_LEVEL // 'high' para letra manuscrita
                    }
                  }
                ]
              }
            ],
            max_tokens: OPENAI.MAX_TOKENS,
            temperature: OPENAI.TEMPERATURE,
            response_format: { type: 'json_object' }
          });
        },
        OPENAI.RETRY_ATTEMPTS,
        OPENAI.RETRY_DELAY_MS
      );

      const processingTime = Date.now() - startTime;

      // Extraer respuesta
      const content = response.choices[0].message.content;
      
      // Validar que sea JSON válido
      let parsedData;
      try {
        parsedData = JSON.parse(content);
      } catch (parseError) {
        logger.error('GPT-4o returned invalid JSON', {
          content,
          parseError: parseError.message
        });
        throw new Error('IA devolvió respuesta inválida - no es JSON válido');
      }

      // Tracking de métricas
      trackTokenUsage({
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        model: OPENAI.MODEL,
        processingTimeMs: processingTime
      });

      logger.info('GPT-4o analysis completed successfully', {
        processingTimeMs: processingTime,
        tokensUsed: response.usage.total_tokens,
        finishReason: response.choices[0].finish_reason,
        confianza: parsedData?.metadatos?.confianza_ia
      });

      // Auditar análisis
      logger.audit('Medical order analyzed', {
        processingTimeMs: processingTime,
        tokensUsed: response.usage.total_tokens,
        tipoEscritura: parsedData?.metadatos?.tipo_escritura,
        legibilidad: parsedData?.metadatos?.legibilidad,
        practicasDetectadas: parsedData?.detalle_practicas?.length || 0,
        esUrgente: parsedData?.metadatos?.es_urgente,
        requiereRevision: parsedData?.metadatos?.requiere_revision_humana
      });

      return {
        data: parsedData,
        metadata: {
          processingTimeMs: processingTime,
          tokensUsed: response.usage.total_tokens,
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          model: OPENAI.MODEL,
          finishReason: response.choices[0].finish_reason
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('GPT-4o API call failed', {
        error: error.message,
        stack: error.stack,
        processingTimeMs: processingTime,
        opciones
      });

      // Manejo de errores específicos de OpenAI
      if (error.status === 429) {
        throw new Error('Rate limit excedido en OpenAI - intente nuevamente en unos segundos');
      }

      if (error.status === 400) {
        throw new Error('Imagen inválida para OpenAI API - verifique el formato');
      }

      if (error.status === 401) {
        throw new Error('API Key de OpenAI inválida o expirada');
      }

      if (error.status === 500 || error.status === 503) {
        throw new Error('Servicio de OpenAI temporalmente no disponible');
      }

      if (error.message && error.message.includes('timeout')) {
        throw new Error('Timeout en análisis de IA - imagen muy compleja o servicio lento');
      }

      throw new Error(`Error en análisis con IA: ${error.message}`);
    }
  }

  /**
   * Verifica la conexión con OpenAI
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await openai.models.retrieve(OPENAI.MODEL);
      logger.info('OpenAI health check: OK');
      return true;
    } catch (error) {
      logger.error('OpenAI health check failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Obtiene el costo estimado de un análisis
   * @param {number} promptTokens
   * @param {number} completionTokens
   * @returns {Object}
   */
  calculateCost(promptTokens, completionTokens) {
    // Precios aproximados de GPT-4o (actualizar según pricing de OpenAI)
    const COST_PER_1K_PROMPT = 0.005; // USD
    const COST_PER_1K_COMPLETION = 0.015; // USD

    const promptCost = (promptTokens / 1000) * COST_PER_1K_PROMPT;
    const completionCost = (completionTokens / 1000) * COST_PER_1K_COMPLETION;
    const totalCost = promptCost + completionCost;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      promptCostUSD: promptCost.toFixed(6),
      completionCostUSD: completionCost.toFixed(6),
      totalCostUSD: totalCost.toFixed(6)
    };
  }
}

module.exports = new AIService();
