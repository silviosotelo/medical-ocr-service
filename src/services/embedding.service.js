const openai = require('../config/openai.config');
const logger = require('../config/logger.config');

class EmbeddingCache {
  constructor(maxSize = 500) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, ' ');
    const entry = this.cache.get(normalizedKey);
    if (entry) {
      entry.lastAccess = Date.now();
      entry.hits++;
      return entry.embedding;
    }
    return null;
  }

  set(key, embedding) {
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, ' ');

    if (this.cache.size >= this.maxSize) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache.entries()) {
        if (v.lastAccess < oldestTime) {
          oldestTime = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(normalizedKey, {
      embedding,
      lastAccess: Date.now(),
      hits: 0
    });
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  clear() {
    this.cache.clear();
  }
}

class EmbeddingService {
  constructor() {
    this.model = 'text-embedding-3-small';
    this.batchSize = 100;
    this.cache = new EmbeddingCache(500);
  }

  async generateEmbedding(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      const normalizedText = this.normalizeText(text);

      const cached = this.cache.get(normalizedText);
      if (cached) {
        logger.debug('Embedding cache hit', { textLength: text.length });
        return cached;
      }

      const response = await openai.embeddings.create({
        model: this.model,
        input: normalizedText,
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      this.cache.set(normalizedText, embedding);

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

  async generateBatchEmbeddings(texts) {
    try {
      if (!texts || texts.length === 0) return [];

      const validTexts = texts
        .filter(t => t && t.trim().length > 0)
        .map(t => this.normalizeText(t));

      if (validTexts.length === 0) return [];

      const results = new Array(validTexts.length);
      const uncachedIndices = [];
      const uncachedTexts = [];

      for (let i = 0; i < validTexts.length; i++) {
        const cached = this.cache.get(validTexts[i]);
        if (cached) {
          results[i] = cached;
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(validTexts[i]);
        }
      }

      if (uncachedTexts.length > 0) {
        const allEmbeddings = [];

        for (let i = 0; i < uncachedTexts.length; i += this.batchSize) {
          const batch = uncachedTexts.slice(i, i + this.batchSize);

          const response = await openai.embeddings.create({
            model: this.model,
            input: batch,
            encoding_format: 'float'
          });

          const batchEmbeddings = response.data.map(d => d.embedding);
          allEmbeddings.push(...batchEmbeddings);

          if (i + this.batchSize < uncachedTexts.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        for (let i = 0; i < uncachedIndices.length; i++) {
          const idx = uncachedIndices[i];
          results[idx] = allEmbeddings[i];
          this.cache.set(uncachedTexts[i], allEmbeddings[i]);
        }
      }

      logger.info('Batch embeddings processed', {
        total: validTexts.length,
        cached: validTexts.length - uncachedTexts.length,
        generated: uncachedTexts.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to generate batch embeddings', {
        error: error.message,
        textsCount: texts.length
      });
      throw error;
    }
  }

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

  normalizeText(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 8000);
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}

module.exports = new EmbeddingService();
