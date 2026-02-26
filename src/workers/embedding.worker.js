const { query } = require('../config/database.config');
const embeddingService = require('../services/embedding.service');
const jobQueueService = require('../services/job-queue.service');
const logger = require('../config/logger.config');

const BATCH_SIZE = 100;

class EmbeddingWorker {
  constructor() {
    jobQueueService.registerHandler('embedding_prestadores', this.processPrestadores.bind(this));
    jobQueueService.registerHandler('embedding_nomencladores', this.processNomencladores.bind(this));
    logger.info('EmbeddingWorker registered handlers');
  }

  async processPrestadores(job) {
    const startTime = Date.now();
    const ids = job.payload.ids || [];
    let totalProcessed = 0;
    let totalEmbeddings = 0;

    logger.info('Processing embedding_prestadores job', { jobId: job.id, totalIds: ids.length });

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);

      const result = await query(
        `SELECT id_prestador, nombre_fantasia, raz_soc_nombre, registro_profesional, tipo
         FROM prestadores WHERE id_prestador = ANY($1)`,
        [batchIds]
      );

      if (result.rows.length === 0) continue;

      const texts = result.rows.map(row => {
        return [
          row.nombre_fantasia || '',
          row.raz_soc_nombre || '',
          row.registro_profesional || '',
          row.tipo || '',
        ].filter(Boolean).join(' ');
      });

      const embeddings = await embeddingService.generateBatchEmbeddings(texts);
      totalEmbeddings += embeddings.filter(Boolean).length;

      for (let j = 0; j < result.rows.length; j++) {
        if (!embeddings[j]) continue;

        const row = result.rows[j];
        const embeddingStr = `[${embeddings[j].join(',')}]`;

        await query(
          `UPDATE prestadores
           SET nombre_embedding = $1::vector,
               nombre_normalizado = normalizar_texto($2)
           WHERE id_prestador = $3`,
          [embeddingStr, row.nombre_fantasia || '', row.id_prestador]
        );
      }

      totalProcessed += result.rows.length;
      logger.info('Embedding batch progress', {
        jobId: job.id,
        tipo: 'prestadores',
        processed: totalProcessed,
        total: ids.length,
      });
    }

    await this._checkAndCreatePrestadorIndex();

    const elapsed = Date.now() - startTime;
    logger.info('embedding_prestadores job completed', {
      jobId: job.id,
      totalProcessed,
      totalEmbeddings,
      elapsedMs: elapsed,
    });

    return { processed: totalProcessed, embeddings_generated: totalEmbeddings, elapsed_ms: elapsed };
  }

  async processNomencladores(job) {
    const startTime = Date.now();
    const ids = job.payload.ids || [];
    let totalProcessed = 0;
    let totalEmbeddings = 0;

    logger.info('Processing embedding_nomencladores job', { jobId: job.id, totalIds: ids.length });

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);

      const result = await query(
        `SELECT id_nomenclador, especialidad, descripcion, desc_nomenclador, sinonimos, palabras_clave
         FROM nomencladores WHERE id_nomenclador = ANY($1)`,
        [batchIds]
      );

      if (result.rows.length === 0) continue;

      const texts = result.rows.map(row => {
        const sinonimos = Array.isArray(row.sinonimos) ? row.sinonimos.join(' ') : '';
        const palabrasClave = Array.isArray(row.palabras_clave) ? row.palabras_clave.join(' ') : '';
        return [
          row.especialidad || '',
          row.descripcion || '',
          row.desc_nomenclador || '',
          sinonimos,
          palabrasClave,
        ].filter(Boolean).join(' ');
      });

      const embeddings = await embeddingService.generateBatchEmbeddings(texts);
      totalEmbeddings += embeddings.filter(Boolean).length;

      for (let j = 0; j < result.rows.length; j++) {
        if (!embeddings[j]) continue;

        const row = result.rows[j];
        const embeddingStr = `[${embeddings[j].join(',')}]`;

        await query(
          `UPDATE nomencladores
           SET descripcion_embedding = $1::vector,
               descripcion_normalizada = normalizar_texto($2)
           WHERE id_nomenclador = $3`,
          [embeddingStr, row.descripcion || '', row.id_nomenclador]
        );
      }

      totalProcessed += result.rows.length;
      logger.info('Embedding batch progress', {
        jobId: job.id,
        tipo: 'nomencladores',
        processed: totalProcessed,
        total: ids.length,
      });
    }

    await this._checkAndCreateNomencladorIndex();

    const elapsed = Date.now() - startTime;
    logger.info('embedding_nomencladores job completed', {
      jobId: job.id,
      totalProcessed,
      totalEmbeddings,
      elapsedMs: elapsed,
    });

    return { processed: totalProcessed, embeddings_generated: totalEmbeddings, elapsed_ms: elapsed };
  }

  async _checkAndCreatePrestadorIndex() {
    try {
      const countResult = await query(
        `SELECT COUNT(*)::int as count FROM prestadores WHERE nombre_embedding IS NOT NULL`
      );
      const count = countResult.rows[0].count;

      if (count > 300) {
        await query(
          `CREATE INDEX IF NOT EXISTS idx_prestadores_embedding
           ON prestadores USING ivfflat(nombre_embedding vector_cosine_ops) WITH (lists=50)`
        );
        logger.info('IVFFlat index created for prestadores', { rowsWithEmbeddings: count });
      }
    } catch (error) {
      logger.warn('Could not create prestadores IVFFlat index', { error: error.message });
    }
  }

  async _checkAndCreateNomencladorIndex() {
    try {
      const countResult = await query(
        `SELECT COUNT(*)::int as count FROM nomencladores WHERE descripcion_embedding IS NOT NULL`
      );
      const count = countResult.rows[0].count;

      if (count > 300) {
        await query(
          `CREATE INDEX IF NOT EXISTS idx_nomencladores_embedding
           ON nomencladores USING ivfflat(descripcion_embedding vector_cosine_ops) WITH (lists=100)`
        );
        logger.info('IVFFlat index created for nomencladores', { rowsWithEmbeddings: count });
      }
    } catch (error) {
      logger.warn('Could not create nomencladores IVFFlat index', { error: error.message });
    }
  }
}

module.exports = new EmbeddingWorker();
