const openai = require('../config/openai.config');
const logger = require('../config/logger.config');

class EmbeddingService {
  constructor() {
    this.model = 'text-embedding-3-small'; // 1536 dimensiones, $0.020 / 1M tokens
    this.batchSize = 100; // Procesar en lotes
  }

  /**
   * Genera embedding para un texto
   * @param {string} text - Texto a vectorizar
   * @returns {Promise<Array<number>>} - Vector de 1536 dimensiones
   */
  async generateEmbedding(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      const response = await openai.embeddings.create({
        model: this.model,
        input: text.substring(0, 8000), // Límite de tokens
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;

      logger.debug('Embedding generated', {
        textLength: text.length,
        dimensions: embedding.length,
        tokensUsed: response.usage.total_tokens
      });

      return embedding;

    } catch (error) {
      logger.error('Failed to generate embedding', {
        error: error.message,
        textPreview: text.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Genera embeddings para múltiples textos en batch
   * @param {string[]} texts - Array de textos
   * @returns {Promise<Array<Array<number>>>} - Array de vectors
   */
  async generateBatchEmbeddings(texts) {
    try {
      if (!texts || texts.length === 0) {
        return [];
      }

      // Filtrar textos vacíos
      const validTexts = texts
        .filter(t => t && t.trim().length > 0)
        .map(t => t.substring(0, 8000));

      if (validTexts.length === 0) {
        return [];
      }

      // Procesar en chunks si hay muchos
      const allEmbeddings = [];
      
      for (let i = 0; i < validTexts.length; i += this.batchSize) {
        const batch = validTexts.slice(i, i + this.batchSize);
        
        logger.info(`Processing embedding batch ${Math.floor(i / this.batchSize) + 1}`, {
          batchSize: batch.length,
          total: validTexts.length
        });

        const response = await openai.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float'
        });

        const batchEmbeddings = response.data.map(d => d.embedding);
        allEmbeddings.push(...batchEmbeddings);

        logger.info('Batch embeddings generated', {
          count: batchEmbeddings.length,
          tokensUsed: response.usage.total_tokens
        });

        // Pequeña pausa entre batches para no sobrecargar API
        if (i + this.batchSize < validTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return allEmbeddings;

    } catch (error) {
      logger.error('Failed to generate batch embeddings', {
        error: error.message,
        textsCount: texts.length
      });
      throw error;
    }
  }

  /**
   * Calcula similitud coseno entre dos vectores
   * @param {Array<number>} vec1
   * @param {Array<number>} vec2
   * @returns {number} - Similitud (0-1)
   */
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Encuentra los K vectores más similares
   * @param {Array<number>} queryVector
   * @param {Array<{id: any, vector: Array<number>}>} candidates
   * @param {number} k - Número de resultados
   * @returns {Array<{id: any, similarity: number}>}
   */
  findTopK(queryVector, candidates, k = 10) {
    const similarities = candidates.map(candidate => ({
      id: candidate.id,
      similarity: this.cosineSimilarity(queryVector, candidate.vector),
      ...candidate.metadata
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  /**
   * Normaliza texto para embedding
   * @param {string} text
   * @returns {string}
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 8000);
  }
}

module.exports = new EmbeddingService();
