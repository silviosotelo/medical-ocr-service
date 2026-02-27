const express = require('express');
const router = express.Router();
const Joi = require('joi');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { query, transaction } = require('../../config/database.config');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const jobQueueService = require('../../services/job-queue.service');
const logger = require('../../config/logger.config');

// Rate limit: 10 req/min for batch data endpoints
const batchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Max 10 requests per minute for batch data endpoints' },
  },
});

// Auth middleware for all routes - supports Bearer JWT or X-Api-Key
function apiKeyOrBearerAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    req.headers.authorization = `Bearer ${apiKey}`;
  }
  return authMiddleware(req, res, next);
}

router.use(apiKeyOrBearerAuth, tenantMiddleware);

// =====================================================================
// Validation schemas
// =====================================================================

const prestadorSchema = Joi.object({
  id_externo: Joi.string().required(),
  ruc: Joi.string().allow(null, ''),
  nombre_fantasia: Joi.string().required(),
  razon_social: Joi.string().allow(null, ''),
  registro_profesional: Joi.string().allow(null, ''),
  tipo: Joi.string().allow(null, ''),
  ranking: Joi.number().allow(null),
  estado: Joi.string().default('ACTIVO'),
});

const prestadoresBatchSchema = Joi.object({
  source_ref: Joi.string().allow(null, ''),
  prestadores: Joi.array().items(prestadorSchema).min(1).max(5000).required(),
});

const nomencladorSchema = Joi.object({
  id_externo: Joi.string().required(),
  id_servicio: Joi.number().integer().allow(null),
  especialidad: Joi.string().allow(null, ''),
  descripcion: Joi.string().required(),
  desc_nomenclador: Joi.string().allow(null, ''),
  grupo: Joi.string().allow(null, ''),
  subgrupo: Joi.string().allow(null, ''),
  sinonimos: Joi.array().items(Joi.string()).default([]),
  palabras_clave: Joi.array().items(Joi.string()).default([]),
  estado: Joi.string().default('ACTIVO'),
});

const nomencladoresBatchSchema = Joi.object({
  source_ref: Joi.string().allow(null, ''),
  nomencladores: Joi.array().items(nomencladorSchema).min(1).max(5000).required(),
});

const acuerdoSchema = Joi.object({
  id_prestador_externo: Joi.string().required(),
  id_nomenclador_externo: Joi.string().required(),
  plan_id: Joi.number().integer().allow(null),
  precio: Joi.number().allow(null),
  precio_normal: Joi.number().allow(null),
  precio_diferenciado: Joi.number().allow(null),
  precio_internado: Joi.number().allow(null),
  vigente: Joi.string().default('SI'),
  fecha_vigencia: Joi.string().allow(null, ''),
});

const acuerdosBatchSchema = Joi.object({
  source_ref: Joi.string().allow(null, ''),
  acuerdos: Joi.array().items(acuerdoSchema).min(1).max(5000).required(),
});

// =====================================================================
// POST /v1/data/prestadores/batch
// =====================================================================
router.post('/prestadores/batch', batchRateLimit, async (req, res) => {
  try {
    const { error, value } = prestadoresBatchSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(422).json({
        status: 'error',
        errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
      });
    }

    const batchId = crypto.randomUUID();
    const tenantId = req.tenantId;
    const prestadores = value.prestadores;
    let totalInsertados = 0;
    let totalActualizados = 0;
    const insertedIds = [];

    await transaction(async (client) => {
      for (const p of prestadores) {
        const existing = await client.query(
          `SELECT id_prestador FROM prestadores WHERE id_externo = $1 AND tenant_id = $2`,
          [p.id_externo, tenantId]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE prestadores SET
               ruc = COALESCE($2, ruc),
               nombre_fantasia = COALESCE($3, nombre_fantasia),
               raz_soc_nombre = COALESCE($4, raz_soc_nombre),
               registro_profesional = COALESCE($5, registro_profesional),
               tipo = COALESCE($6, tipo),
               ranking = COALESCE($7, ranking),
               estado = COALESCE($8, estado)
             WHERE id_externo = $1 AND tenant_id = $9`,
            [p.id_externo, p.ruc, p.nombre_fantasia, p.razon_social, p.registro_profesional, p.tipo, p.ranking, p.estado, tenantId]
          );
          insertedIds.push(existing.rows[0].id_prestador);
          totalActualizados++;
        } else {
          const nextId = await client.query(`SELECT COALESCE(MAX(id_prestador), 0) + 1 as next_id FROM prestadores`);
          const newId = nextId.rows[0].next_id;

          await client.query(
            `INSERT INTO prestadores (id_prestador, id_externo, ruc, nombre_fantasia, raz_soc_nombre, registro_profesional, tipo, ranking, estado, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [newId, p.id_externo, p.ruc, p.nombre_fantasia, p.razon_social, p.registro_profesional, p.tipo, p.ranking, p.estado, tenantId]
          );
          insertedIds.push(newId);
          totalInsertados++;
        }
      }
    });

    // Enqueue embedding job
    const jobResult = await jobQueueService.enqueue('embedding_prestadores', { ids: insertedIds }, {
      batch_id: batchId,
      tenant_id: tenantId,
    });

    const estimadoSegundos = Math.ceil(insertedIds.length / 100) * 2;

    res.status(202).json({
      status: 'accepted',
      job_id: jobResult.job_id,
      batch_id: batchId,
      status_job: 'queued',
      total_recibidos: prestadores.length,
      total_insertados: totalInsertados,
      total_actualizados: totalActualizados,
      estimado_segundos: estimadoSegundos,
    });
  } catch (err) {
    logger.error('Error in POST /data/prestadores/batch', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// =====================================================================
// POST /v1/data/nomencladores/batch
// =====================================================================
router.post('/nomencladores/batch', batchRateLimit, async (req, res) => {
  try {
    const { error, value } = nomencladoresBatchSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(422).json({
        status: 'error',
        errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
      });
    }

    const batchId = crypto.randomUUID();
    const tenantId = req.tenantId;
    const nomencladores = value.nomencladores;
    let totalInsertados = 0;
    let totalActualizados = 0;
    const insertedIds = [];

    await transaction(async (client) => {
      for (const n of nomencladores) {
        const existing = await client.query(
          `SELECT id_nomenclador FROM nomencladores WHERE id_externo = $1 AND tenant_id = $2`,
          [n.id_externo, tenantId]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE nomencladores SET
               id_servicio = COALESCE($2, id_servicio),
               especialidad = COALESCE($3, especialidad),
               descripcion = COALESCE($4, descripcion),
               desc_nomenclador = COALESCE($5, desc_nomenclador),
               grupo = COALESCE($6, grupo),
               subgrupo = COALESCE($7, subgrupo),
               sinonimos = COALESCE($8, sinonimos),
               palabras_clave = COALESCE($9, palabras_clave),
               estado = COALESCE($10, estado)
             WHERE id_externo = $1 AND tenant_id = $11`,
            [n.id_externo, n.id_servicio, n.especialidad, n.descripcion, n.desc_nomenclador, n.grupo, n.subgrupo, n.sinonimos, n.palabras_clave, n.estado, tenantId]
          );
          insertedIds.push(existing.rows[0].id_nomenclador);
          totalActualizados++;
        } else {
          const nextId = await client.query(`SELECT COALESCE(MAX(id_nomenclador), 0) + 1 as next_id FROM nomencladores`);
          const newId = nextId.rows[0].next_id;

          await client.query(
            `INSERT INTO nomencladores (id_nomenclador, id_externo, id_servicio, especialidad, descripcion, desc_nomenclador, grupo, subgrupo, sinonimos, palabras_clave, estado, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [newId, n.id_externo, n.id_servicio, n.especialidad, n.descripcion, n.desc_nomenclador, n.grupo, n.subgrupo, n.sinonimos, n.palabras_clave, n.estado, tenantId]
          );
          insertedIds.push(newId);
          totalInsertados++;
        }
      }
    });

    const jobResult = await jobQueueService.enqueue('embedding_nomencladores', { ids: insertedIds }, {
      batch_id: batchId,
      tenant_id: tenantId,
    });

    const estimadoSegundos = Math.ceil(insertedIds.length / 100) * 3;

    res.status(202).json({
      status: 'accepted',
      job_id: jobResult.job_id,
      batch_id: batchId,
      status_job: 'queued',
      total_recibidos: nomencladores.length,
      total_insertados: totalInsertados,
      total_actualizados: totalActualizados,
      estimado_segundos: estimadoSegundos,
    });
  } catch (err) {
    logger.error('Error in POST /data/nomencladores/batch', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// =====================================================================
// POST /v1/data/acuerdos/batch
// =====================================================================
router.post('/acuerdos/batch', batchRateLimit, async (req, res) => {
  try {
    const { error, value } = acuerdosBatchSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(422).json({
        status: 'error',
        errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
      });
    }

    const tenantId = req.tenantId;
    const acuerdos = value.acuerdos;
    let totalInsertados = 0;
    let totalActualizados = 0;
    const errores = [];

    await transaction(async (client) => {
      for (let i = 0; i < acuerdos.length; i++) {
        const a = acuerdos[i];

        // Resolve external IDs to internal IDs - scoped by tenant
        const prestadorResult = await client.query(
          `SELECT id_prestador FROM prestadores WHERE id_externo = $1 AND tenant_id = $2`,
          [a.id_prestador_externo, tenantId]
        );
        const nomencladorResult = await client.query(
          `SELECT id_nomenclador FROM nomencladores WHERE id_externo = $1 AND tenant_id = $2`,
          [a.id_nomenclador_externo, tenantId]
        );

        if (prestadorResult.rows.length === 0) {
          errores.push({ index: i, id_prestador_externo: a.id_prestador_externo, error: 'Prestador not found' });
          continue;
        }
        if (nomencladorResult.rows.length === 0) {
          errores.push({ index: i, id_nomenclador_externo: a.id_nomenclador_externo, error: 'Nomenclador not found' });
          continue;
        }

        const prestadorId = prestadorResult.rows[0].id_prestador;
        const nomencladorId = nomencladorResult.rows[0].id_nomenclador;

        const existing = await client.query(
          `SELECT id_acuerdo FROM acuerdos_prestador
           WHERE prest_id_prestador = $1 AND id_nomenclador = $2 AND plan_id_plan = $3 AND tenant_id = $4`,
          [prestadorId, nomencladorId, a.plan_id, tenantId]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE acuerdos_prestador SET
               precio = COALESCE($4, precio),
               precio_normal = COALESCE($5, precio_normal),
               precio_diferenciado = COALESCE($6, precio_diferenciado),
               precio_internado = COALESCE($7, precio_internado),
               vigente = COALESCE($8, vigente),
               fecha_vigencia = COALESCE($9::date, fecha_vigencia)
             WHERE prest_id_prestador = $1 AND id_nomenclador = $2 AND plan_id_plan = $3 AND tenant_id = $10`,
            [prestadorId, nomencladorId, a.plan_id, a.precio, a.precio_normal, a.precio_diferenciado, a.precio_internado, a.vigente, a.fecha_vigencia || null, tenantId]
          );
          totalActualizados++;
        } else {
          await client.query(
            `INSERT INTO acuerdos_prestador (prest_id_prestador, id_nomenclador, plan_id_plan, precio, precio_normal, precio_diferenciado, precio_internado, vigente, fecha_vigencia, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [prestadorId, nomencladorId, a.plan_id, a.precio, a.precio_normal, a.precio_diferenciado, a.precio_internado, a.vigente, a.fecha_vigencia || null, tenantId]
          );
          totalInsertados++;
        }
      }
    });

    res.status(200).json({
      status: 'ok',
      total_recibidos: acuerdos.length,
      total_insertados: totalInsertados,
      total_actualizados: totalActualizados,
      total_errores: errores.length,
      errores,
    });
  } catch (err) {
    logger.error('Error in POST /data/acuerdos/batch', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// =====================================================================
// GET /v1/data/jobs/:job_id/status
// =====================================================================
router.get('/jobs/:job_id/status', async (req, res) => {
  try {
    const job = await jobQueueService.getJobStatus(req.params.job_id);
    if (!job) {
      return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    // Verify job belongs to this tenant
    if (job.tenant_id && job.tenant_id !== req.tenantId) {
      return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    res.json({
      status: 'ok',
      data: {
        job_id: job.id,
        tipo: job.tipo,
        estado: job.estado,
        intentos: job.intentos,
        max_intentos: job.max_intentos,
        error_message: job.error_message,
        resultado: job.resultado,
        created_at: job.created_at,
        updated_at: job.updated_at,
      },
    });
  } catch (err) {
    logger.error('Error in GET /data/jobs/:job_id/status', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// =====================================================================
// GET /v1/data/stats
// =====================================================================
router.get('/stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [prestadoresResult, nomencladoresResult, acuerdosResult] = await Promise.all([
      query(`SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE nombre_embedding IS NOT NULL)::int as con_embeddings
        FROM prestadores WHERE tenant_id = $1`, [tenantId]),
      query(`SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE descripcion_embedding IS NOT NULL)::int as con_embeddings
        FROM nomencladores WHERE tenant_id = $1`, [tenantId]),
      query(`SELECT COUNT(*)::int as total FROM acuerdos_prestador WHERE tenant_id = $1`, [tenantId]),
    ]);

    res.json({
      status: 'ok',
      data: {
        prestadores: prestadoresResult.rows[0],
        nomencladores: nomencladoresResult.rows[0],
        acuerdos: { total: acuerdosResult.rows[0].total },
      },
    });
  } catch (err) {
    logger.error('Error in GET /data/stats', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

module.exports = router;
