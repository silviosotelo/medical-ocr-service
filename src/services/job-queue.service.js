const { query } = require('../config/database.config');
const logger = require('../config/logger.config');
const crypto = require('crypto');

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');

class JobQueueService {
  constructor() {
    this.queues = {
      embedding_prestadores: [],
      embedding_nomencladores: [],
      previsacion: [],
    };
    this.processing = new Set();
    this.handlers = {};
    this.started = false;
  }

  registerHandler(tipo, handler) {
    this.handlers[tipo] = handler;
  }

  async enqueue(tipo, payload, options = {}) {
    const batchId = options.batch_id || crypto.randomUUID();
    const idExterno = options.id_externo || null;
    const tenantId = options.tenant_id || null;
    const maxIntentos = options.max_intentos || 3;

    const result = await query(
      `INSERT INTO ingestion_jobs (tipo, batch_id, id_externo, tenant_id, payload, estado, max_intentos)
       VALUES ($1, $2, $3, $4, $5, 'QUEUED', $6)
       RETURNING id`,
      [tipo, batchId, idExterno, tenantId, JSON.stringify(payload), maxIntentos]
    );

    const jobId = result.rows[0].id;

    if (!this.queues[tipo]) {
      this.queues[tipo] = [];
    }

    this.queues[tipo].push({
      id: jobId,
      tipo,
      batch_id: batchId,
      id_externo: idExterno,
      tenant_id: tenantId,
      payload,
      intentos: 0,
      max_intentos: maxIntentos,
    });

    logger.info('Job enqueued', { jobId, tipo, batchId });

    if (this.started) {
      this._processNext();
    }

    return { job_id: jobId, batch_id: batchId };
  }

  async getStats() {
    const result = await query(
      `SELECT tipo, estado, COUNT(*)::int as count
       FROM ingestion_jobs
       GROUP BY tipo, estado
       ORDER BY tipo, estado`
    );

    const stats = {};
    for (const row of result.rows) {
      if (!stats[row.tipo]) stats[row.tipo] = {};
      stats[row.tipo][row.estado] = row.count;
    }
    return stats;
  }

  async getJobStatus(jobId) {
    const result = await query(
      `SELECT id, tipo, batch_id, id_externo, tenant_id, estado, intentos, max_intentos,
              error_message, resultado, created_at, updated_at
       FROM ingestion_jobs WHERE id = $1`,
      [jobId]
    );
    return result.rows[0] || null;
  }

  async getBatchStatus(batchId) {
    const result = await query(
      `SELECT id, tipo, id_externo, estado, intentos, error_message, created_at, updated_at
       FROM ingestion_jobs WHERE batch_id = $1
       ORDER BY created_at`,
      [batchId]
    );

    const jobs = result.rows;
    const summary = {
      batch_id: batchId,
      total: jobs.length,
      queued: jobs.filter(j => j.estado === 'QUEUED').length,
      processing: jobs.filter(j => j.estado === 'PROCESSING').length,
      done: jobs.filter(j => j.estado === 'DONE').length,
      failed: jobs.filter(j => j.estado === 'FAILED').length,
      jobs: jobs.map(j => ({
        job_id: j.id,
        id_externo: j.id_externo,
        tipo: j.tipo,
        estado: j.estado,
        intentos: j.intentos,
        error: j.error_message,
        created_at: j.created_at,
        updated_at: j.updated_at,
      })),
    };

    return summary;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    logger.info('Job queue started', { concurrency: WORKER_CONCURRENCY });
    await this._recoverPendingJobs();
    this._processNext();
  }

  async _recoverPendingJobs() {
    try {
      // Mark stale PROCESSING jobs back to QUEUED (from a previous crash/restart)
      await query(
        `UPDATE ingestion_jobs SET estado = 'QUEUED' WHERE estado = 'PROCESSING'`
      );

      // Re-load QUEUED jobs into memory
      const result = await query(
        `SELECT id, tipo, batch_id, id_externo, tenant_id, payload, intentos, max_intentos
         FROM ingestion_jobs WHERE estado = 'QUEUED' ORDER BY created_at ASC`
      );

      let recovered = 0;
      for (const row of result.rows) {
        if (!this.queues[row.tipo]) this.queues[row.tipo] = [];
        this.queues[row.tipo].push({
          id: row.id,
          tipo: row.tipo,
          batch_id: row.batch_id,
          id_externo: row.id_externo,
          tenant_id: row.tenant_id,
          payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
          intentos: row.intentos,
          max_intentos: row.max_intentos,
        });
        recovered++;
      }

      if (recovered > 0) {
        logger.info('Recovered pending jobs from DB', { count: recovered });
      }
    } catch (err) {
      logger.warn('Could not recover pending jobs', { error: err.message });
    }
  }

  stop() {
    this.started = false;
    logger.info('Job queue stopped');
  }

  async _processNext() {
    if (!this.started) return;
    if (this.processing.size >= WORKER_CONCURRENCY) return;

    // Previsacion jobs have priority over embedding jobs
    const priorityOrder = ['previsacion', 'embedding_prestadores', 'embedding_nomencladores'];

    for (const tipo of priorityOrder) {
      const queue = this.queues[tipo];
      if (!queue || queue.length === 0) continue;

      const job = queue.shift();
      if (!job) continue;

      this.processing.add(job.id);
      this._executeJob(job).finally(() => {
        this.processing.delete(job.id);
        this._processNext();
      });

      if (this.processing.size >= WORKER_CONCURRENCY) return;
    }
  }

  async _executeJob(job) {
    const handler = this.handlers[job.tipo];
    if (!handler) {
      logger.error('No handler registered for job type', { tipo: job.tipo });
      await this._markFailed(job.id, 'No handler registered for type: ' + job.tipo);
      return;
    }

    try {
      await query(
        `UPDATE ingestion_jobs SET estado = 'PROCESSING', intentos = intentos + 1 WHERE id = $1`,
        [job.id]
      );

      logger.info('Processing job', { jobId: job.id, tipo: job.tipo, intento: job.intentos + 1 });

      const resultado = await handler(job);

      await query(
        `UPDATE ingestion_jobs SET estado = 'DONE', resultado = $2 WHERE id = $1`,
        [job.id, JSON.stringify(resultado || {})]
      );

      logger.info('Job completed', { jobId: job.id, tipo: job.tipo });
    } catch (error) {
      job.intentos += 1;
      logger.error('Job failed', { jobId: job.id, tipo: job.tipo, intento: job.intentos, error: error.message });

      if (job.intentos >= job.max_intentos) {
        await this._markFailed(job.id, error.message);
      } else {
        // Retry with exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, job.intentos - 1) * 1000;
        await query(
          `UPDATE ingestion_jobs SET estado = 'QUEUED', intentos = $2, error_message = $3 WHERE id = $1`,
          [job.id, job.intentos, error.message]
        );

        setTimeout(() => {
          if (this.started) {
            this.queues[job.tipo].push(job);
            this._processNext();
          }
        }, delay);
      }
    }
  }

  async _markFailed(jobId, errorMessage) {
    await query(
      `UPDATE ingestion_jobs SET estado = 'FAILED', error_message = $2 WHERE id = $1`,
      [jobId, errorMessage]
    );
    logger.warn('Job marked as FAILED', { jobId, error: errorMessage });
  }
}

module.exports = new JobQueueService();
