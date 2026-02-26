const crypto = require('crypto');
const { query } = require('../config/database.config');
const logger = require('../config/logger.config');

class WebhookService {
  async getConfigs(tenantId) {
    const result = await query(
      "SELECT * FROM webhook_configs WHERE tenant_id = $1 AND status = 'active'",
      [tenantId]
    );
    return result.rows;
  }

  async create(tenantId, { url, secret, events }) {
    const result = await query(
      `INSERT INTO webhook_configs (tenant_id, url, secret, events)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, url, secret || crypto.randomBytes(32).toString('hex'), JSON.stringify(events)]
    );
    logger.audit('Webhook created', { tenantId, url });
    return result.rows[0];
  }

  async update(id, tenantId, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of ['url', 'secret', 'events', 'status']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(key === 'events' ? JSON.stringify(data[key]) : data[key]);
        idx++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id, tenantId);
    const result = await query(
      `UPDATE webhook_configs SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async remove(id, tenantId) {
    await query('DELETE FROM webhook_configs WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  }

  async dispatch(tenantId, event, payload) {
    const configs = await this.getConfigs(tenantId);
    const matching = configs.filter((c) => {
      const events = Array.isArray(c.events) ? c.events : [];
      return events.includes(event) || events.includes('*');
    });

    const timestamp = Math.floor(Date.now() / 1000);

    for (const config of matching) {
      try {
        const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
        const signature = crypto.createHmac('sha256', config.secret || '').update(body).digest('hex');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': event,
            'X-Webhook-Timestamp': String(timestamp),
            'X-Webhook-Retry': '0',
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        await query(
          'UPDATE webhook_configs SET last_triggered_at = NOW(), failure_count = 0 WHERE id = $1',
          [config.id]
        );

        logger.info('Webhook delivered', { configId: config.id, event, status: res.status });
      } catch (err) {
        await query(
          'UPDATE webhook_configs SET failure_count = failure_count + 1, last_error = $1 WHERE id = $2',
          [err.message, config.id]
        );
        logger.warn('Webhook delivery failed', { configId: config.id, event, error: err.message });
      }
    }
  }

  async dispatchWithRetry(tenantId, event, payload, options = {}) {
    const maxRetries = options.maxRetries || 5;
    const backoffSchedule = [5000, 15000, 30000, 60000, 120000];

    const configs = await this.getConfigs(tenantId);
    const matching = configs.filter((c) => {
      const events = Array.isArray(c.events) ? c.events : [];
      return events.includes(event) || events.includes('*');
    });

    for (const config of matching) {
      let delivered = false;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const timestamp = Math.floor(Date.now() / 1000);
          const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
          const signature = crypto.createHmac('sha256', config.secret || '').update(body).digest('hex');

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const res = await fetch(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Event': event,
              'X-Webhook-Timestamp': String(timestamp),
              'X-Webhook-Signature': `sha256=${signature}`,
              'X-Webhook-Retry': String(attempt),
            },
            body,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          logger.info('Webhook delivery attempt', {
            configId: config.id,
            event,
            attempt,
            status: res.status,
          });

          if (res.ok) {
            await query(
              'UPDATE webhook_configs SET last_triggered_at = NOW(), failure_count = 0 WHERE id = $1',
              [config.id]
            );
            delivered = true;
            break;
          }

          // Non-retryable status codes
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            logger.warn('Webhook non-retryable error', {
              configId: config.id,
              event,
              status: res.status,
            });
            break;
          }
        } catch (err) {
          logger.warn('Webhook delivery attempt failed', {
            configId: config.id,
            event,
            attempt,
            error: err.message,
          });
        }

        // Wait before retry (except on last attempt)
        if (attempt < maxRetries) {
          const delay = backoffSchedule[attempt] || 120000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!delivered) {
        // Record failure after exhausting all retries
        await query(
          'UPDATE webhook_configs SET failure_count = failure_count + 1, last_error = $1 WHERE id = $2',
          [`All ${maxRetries + 1} attempts failed for event: ${event}`, config.id]
        );

        try {
          await query(
            `INSERT INTO webhook_failures (tenant_id, event, payload, url, last_error, intentos)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, event, JSON.stringify(payload), config.url, `Exhausted ${maxRetries + 1} retries`, maxRetries + 1]
          );
        } catch (dbErr) {
          logger.error('Failed to record webhook failure', { error: dbErr.message });
        }

        logger.error('Webhook delivery failed after all retries', {
          configId: config.id,
          event,
          tenantId,
          totalAttempts: maxRetries + 1,
        });
      }
    }
  }
}

module.exports = new WebhookService();
