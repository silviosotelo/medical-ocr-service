const logger = require('../config/logger.config');

let Queue, Worker;
try {
  const bullmq = require('bullmq');
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
} catch (e) {
  logger.warn('BullMQ not available, queue operations will be no-ops');
}

const { getRedis, REDIS_URL } = require('../config/redis.config');

const QUEUE_NAME = 'medical-ocr-jobs';

class QueueService {
  constructor() {
    this.queue = null;
    this.worker = null;
    this.handlers = {};
  }

  init() {
    if (!Queue || !getRedis()) {
      logger.warn('Queue service running in no-op mode (Redis not available)');
      return;
    }

    try {
      const connection = { url: REDIS_URL };

      this.queue = new Queue(QUEUE_NAME, { connection });

      this.worker = new Worker(QUEUE_NAME, async (job) => {
        const handler = this.handlers[job.name];
        if (!handler) {
          logger.warn('No handler for job', { name: job.name });
          return;
        }
        return handler(job.data);
      }, {
        connection,
        concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '3'),
      });

      this.worker.on('completed', (job) => {
        logger.info('Job completed', { id: job.id, name: job.name });
      });

      this.worker.on('failed', (job, err) => {
        logger.error('Job failed', { id: job?.id, name: job?.name, error: err.message });
      });

      logger.info('Queue service initialized');
    } catch (err) {
      logger.warn('Queue init failed, running without queue', { error: err.message });
    }
  }

  registerHandler(jobName, handler) {
    this.handlers[jobName] = handler;
  }

  async add(jobName, data, opts = {}) {
    if (!this.queue) {
      const handler = this.handlers[jobName];
      if (handler) {
        try {
          return await handler(data);
        } catch (err) {
          logger.error('Sync job execution failed', { jobName, error: err.message });
          throw err;
        }
      }
      return null;
    }

    const job = await this.queue.add(jobName, data, {
      attempts: opts.attempts || 3,
      backoff: { type: 'exponential', delay: 2000 },
      priority: opts.priority || 0,
      ...opts,
    });

    logger.info('Job queued', { id: job.id, name: jobName });
    return job;
  }

  async getJobCounts() {
    if (!this.queue) return { waiting: 0, active: 0, completed: 0, failed: 0 };
    return this.queue.getJobCounts();
  }

  async close() {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}

module.exports = new QueueService();
