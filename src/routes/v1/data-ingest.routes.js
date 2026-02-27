const express = require('express');
const router = express.Router();
const Joi = require('joi');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { query, transaction } = require('../../config/database.config');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { tenantMiddleware } = require('../../middlewares/tenant.middleware');
const jobQueueService = require('../../services/job-queue.service');
const logger = require('../../config/logger.config');

// Multer config for Excel uploads
const xlsxUpload = multer({
  dest: process.env.TEMP_DIR || './temp',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return cb(null, true);
    cb(new Error('Solo se permiten archivos .xlsx, .xls o .csv'));
  },
});

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

// =====================================================================
// POST /v1/data/import?type=prestadores|nomencladores|acuerdos
// Import from Excel/CSV file upload
// =====================================================================

// Column mappings: Excel header (lowercase, trimmed) → internal field
const COLUMN_MAPS = {
  prestadores: {
    'id_externo': 'id_externo',
    'codigo': 'id_externo',
    'ruc': 'ruc',
    'nombre_fantasia': 'nombre_fantasia',
    'nombre': 'nombre_fantasia',
    'razon_social': 'razon_social',
    'raz_soc_nombre': 'razon_social',
    'registro_profesional': 'registro_profesional',
    'matricula': 'registro_profesional',
    'tipo': 'tipo',
    'ranking': 'ranking',
    'estado': 'estado',
  },
  nomencladores: {
    'id_externo': 'id_externo',
    'codigo': 'id_externo',
    'id_servicio': 'id_servicio',
    'cod_servicio': 'id_servicio',
    'especialidad': 'especialidad',
    'descripcion': 'descripcion',
    'descripcion_corta': 'descripcion',
    'desc_nomenclador': 'desc_nomenclador',
    'descripcion_larga': 'desc_nomenclador',
    'grupo': 'grupo',
    'subgrupo': 'subgrupo',
    'sinonimos': 'sinonimos',
    'palabras_clave': 'palabras_clave',
    'estado': 'estado',
  },
  acuerdos: {
    'id_prestador_externo': 'id_prestador_externo',
    'prestador': 'id_prestador_externo',
    'cod_prestador': 'id_prestador_externo',
    'id_nomenclador_externo': 'id_nomenclador_externo',
    'nomenclador': 'id_nomenclador_externo',
    'cod_nomenclador': 'id_nomenclador_externo',
    'plan_id': 'plan_id',
    'plan': 'plan_id',
    'precio': 'precio',
    'precio_acordado': 'precio',
    'precio_normal': 'precio_normal',
    'precio_diferenciado': 'precio_diferenciado',
    'precio_internado': 'precio_internado',
    'vigente': 'vigente',
    'fecha_vigencia': 'fecha_vigencia',
    'vigencia_desde': 'fecha_vigencia',
  },
};

async function parseExcelFile(filePath, originalName) {
  const wb = new ExcelJS.Workbook();
  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext === '.csv') {
    await wb.csv.readFile(filePath);
  } else {
    await wb.xlsx.readFile(filePath);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El archivo no contiene hojas de datos');

  // Read headers from first row
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim().toLowerCase();
  });

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const header = headers[col - 1];
      if (header) {
        let val = cell.value;
        // ExcelJS returns rich text as object
        if (val && typeof val === 'object' && val.richText) {
          val = val.richText.map((r) => r.text).join('');
        }
        obj[header] = val;
      }
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });

  return rows;
}

function mapRow(rawRow, colMap) {
  const mapped = {};
  for (const [rawKey, rawVal] of Object.entries(rawRow)) {
    const key = String(rawKey).trim().toLowerCase();
    const targetField = colMap[key];
    if (targetField) {
      mapped[targetField] = rawVal;
    }
  }
  return mapped;
}

router.post('/import', xlsxUpload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const type = (req.query.type || req.body.type || '').toLowerCase();
    if (!['prestadores', 'nomencladores', 'acuerdos'].includes(type)) {
      return res.status(400).json({
        status: 'error',
        error: { code: 'INVALID_TYPE', message: 'type debe ser prestadores, nomencladores o acuerdos' },
      });
    }
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: { code: 'NO_FILE', message: 'Se requiere un archivo .xlsx, .xls o .csv' },
      });
    }

    const tenantId = req.tenantId;
    const colMap = COLUMN_MAPS[type];
    const rawRows = await parseExcelFile(filePath, req.file.originalname);
    const rows = rawRows.map((r) => mapRow(r, colMap));

    if (rows.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: { code: 'EMPTY_FILE', message: 'El archivo no contiene datos' },
      });
    }

    logger.info('Import file parsed', { type, rows: rows.length, tenantId });

    // Reuse batch insert logic inline
    const batchId = crypto.randomUUID();
    let totalInsertados = 0;
    let totalActualizados = 0;
    const errores = [];

    if (type === 'prestadores') {
      const insertedIds = [];
      await transaction(async (client) => {
        for (let i = 0; i < rows.length; i++) {
          const p = rows[i];
          if (!p.id_externo || !p.nombre_fantasia) {
            errores.push({ fila: i + 2, error: 'Faltan campos requeridos: id_externo, nombre_fantasia' });
            continue;
          }
          const existing = await client.query(
            `SELECT id_prestador FROM prestadores WHERE id_externo = $1 AND tenant_id = $2`,
            [String(p.id_externo), tenantId]
          );
          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE prestadores SET nombre_fantasia = COALESCE($3, nombre_fantasia),
               ruc = COALESCE($4, ruc), raz_soc_nombre = COALESCE($5, raz_soc_nombre),
               registro_profesional = COALESCE($6, registro_profesional),
               tipo = COALESCE($7, tipo), ranking = COALESCE($8, ranking),
               estado = COALESCE($9, estado)
               WHERE id_externo = $1 AND tenant_id = $2`,
              [String(p.id_externo), tenantId, p.nombre_fantasia || null, p.ruc || null,
               p.razon_social || null, p.registro_profesional || null, p.tipo || null,
               p.ranking ? Number(p.ranking) : null, p.estado || null]
            );
            insertedIds.push(existing.rows[0].id_prestador);
            totalActualizados++;
          } else {
            const nextId = await client.query(`SELECT COALESCE(MAX(id_prestador), 0) + 1 as next_id FROM prestadores`);
            const newId = nextId.rows[0].next_id;
            await client.query(
              `INSERT INTO prestadores (id_prestador, id_externo, nombre_fantasia, ruc, raz_soc_nombre, registro_profesional, tipo, ranking, estado, tenant_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [newId, String(p.id_externo), p.nombre_fantasia, p.ruc || null,
               p.razon_social || null, p.registro_profesional || null, p.tipo || null,
               p.ranking ? Number(p.ranking) : null, p.estado || 'ACTIVO', tenantId]
            );
            insertedIds.push(newId);
            totalInsertados++;
          }
        }
      });
      if (insertedIds.length > 0) {
        await jobQueueService.enqueue('embedding_prestadores', { ids: insertedIds }, { batch_id: batchId, tenant_id: tenantId });
      }
    } else if (type === 'nomencladores') {
      const insertedIds = [];
      await transaction(async (client) => {
        for (let i = 0; i < rows.length; i++) {
          const n = rows[i];
          if (!n.id_externo || !n.descripcion) {
            errores.push({ fila: i + 2, error: 'Faltan campos requeridos: id_externo, descripcion' });
            continue;
          }
          const sinonimos = n.sinonimos
            ? String(n.sinonimos).split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
            : [];
          const palabrasClave = n.palabras_clave
            ? String(n.palabras_clave).split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
            : [];
          const existing = await client.query(
            `SELECT id_nomenclador FROM nomencladores WHERE id_externo = $1 AND tenant_id = $2`,
            [String(n.id_externo), tenantId]
          );
          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE nomencladores SET descripcion = COALESCE($3, descripcion),
               especialidad = COALESCE($4, especialidad), desc_nomenclador = COALESCE($5, desc_nomenclador),
               grupo = COALESCE($6, grupo), subgrupo = COALESCE($7, subgrupo),
               sinonimos = $8, palabras_clave = $9, estado = COALESCE($10, estado)
               WHERE id_externo = $1 AND tenant_id = $2`,
              [String(n.id_externo), tenantId, n.descripcion || null, n.especialidad || null,
               n.desc_nomenclador || null, n.grupo || null, n.subgrupo || null,
               sinonimos, palabrasClave, n.estado || null]
            );
            insertedIds.push(existing.rows[0].id_nomenclador);
            totalActualizados++;
          } else {
            const nextId = await client.query(`SELECT COALESCE(MAX(id_nomenclador), 0) + 1 as next_id FROM nomencladores`);
            const newId = nextId.rows[0].next_id;
            await client.query(
              `INSERT INTO nomencladores (id_nomenclador, id_externo, id_servicio, especialidad, descripcion, desc_nomenclador, grupo, subgrupo, sinonimos, palabras_clave, estado, tenant_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [newId, String(n.id_externo), n.id_servicio ? Number(n.id_servicio) : null,
               n.especialidad || null, n.descripcion, n.desc_nomenclador || null,
               n.grupo || null, n.subgrupo || null, sinonimos, palabrasClave,
               n.estado || 'ACTIVO', tenantId]
            );
            insertedIds.push(newId);
            totalInsertados++;
          }
        }
      });
      if (insertedIds.length > 0) {
        await jobQueueService.enqueue('embedding_nomencladores', { ids: insertedIds }, { batch_id: batchId, tenant_id: tenantId });
      }
    } else if (type === 'acuerdos') {
      await transaction(async (client) => {
        for (let i = 0; i < rows.length; i++) {
          const a = rows[i];
          if (!a.id_prestador_externo || !a.id_nomenclador_externo) {
            errores.push({ fila: i + 2, error: 'Faltan campos: id_prestador_externo, id_nomenclador_externo' });
            continue;
          }
          const prestResult = await client.query(
            `SELECT id_prestador FROM prestadores WHERE id_externo = $1 AND tenant_id = $2`,
            [String(a.id_prestador_externo), tenantId]
          );
          const nomResult = await client.query(
            `SELECT id_nomenclador FROM nomencladores WHERE id_externo = $1 AND tenant_id = $2`,
            [String(a.id_nomenclador_externo), tenantId]
          );
          if (prestResult.rows.length === 0) {
            errores.push({ fila: i + 2, error: `Prestador no encontrado: ${a.id_prestador_externo}` });
            continue;
          }
          if (nomResult.rows.length === 0) {
            errores.push({ fila: i + 2, error: `Nomenclador no encontrado: ${a.id_nomenclador_externo}` });
            continue;
          }
          const prestId = prestResult.rows[0].id_prestador;
          const nomId = nomResult.rows[0].id_nomenclador;
          const planId = a.plan_id ? Number(a.plan_id) : null;
          const existing = await client.query(
            `SELECT id_acuerdo FROM acuerdos_prestador WHERE prest_id_prestador=$1 AND id_nomenclador=$2 AND plan_id_plan=$3 AND tenant_id=$4`,
            [prestId, nomId, planId, tenantId]
          );
          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE acuerdos_prestador SET precio=COALESCE($4,precio), precio_normal=COALESCE($5,precio_normal),
               precio_diferenciado=COALESCE($6,precio_diferenciado), precio_internado=COALESCE($7,precio_internado),
               vigente=COALESCE($8,vigente), fecha_vigencia=COALESCE($9::date,fecha_vigencia)
               WHERE prest_id_prestador=$1 AND id_nomenclador=$2 AND plan_id_plan=$3 AND tenant_id=$10`,
              [prestId, nomId, planId, a.precio ? Number(a.precio) : null, a.precio_normal ? Number(a.precio_normal) : null,
               a.precio_diferenciado ? Number(a.precio_diferenciado) : null, a.precio_internado ? Number(a.precio_internado) : null,
               a.vigente || null, a.fecha_vigencia || null, tenantId]
            );
            totalActualizados++;
          } else {
            await client.query(
              `INSERT INTO acuerdos_prestador (prest_id_prestador, id_nomenclador, plan_id_plan, precio, precio_normal, precio_diferenciado, precio_internado, vigente, fecha_vigencia, tenant_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [prestId, nomId, planId, a.precio ? Number(a.precio) : null, a.precio_normal ? Number(a.precio_normal) : null,
               a.precio_diferenciado ? Number(a.precio_diferenciado) : null, a.precio_internado ? Number(a.precio_internado) : null,
               a.vigente || 'SI', a.fecha_vigencia || null, tenantId]
            );
            totalInsertados++;
          }
        }
      });
    }

    res.json({
      status: 'ok',
      data: {
        imported: totalInsertados + totalActualizados,
        insertados: totalInsertados,
        actualizados: totalActualizados,
        errores,
        batch_id: batchId,
      },
    });
  } catch (err) {
    logger.error('Error in POST /data/import', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'IMPORT_ERROR', message: err.message } });
  } finally {
    // Clean up uploaded temp file
    if (filePath) fs.unlink(filePath, () => {});
  }
});

// =====================================================================
// POST /v1/data/embeddings
// Enqueue embedding jobs for all records without embeddings
// =====================================================================
router.post('/embeddings', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const batchId = crypto.randomUUID();

    const [prestResult, nomResult] = await Promise.all([
      query(
        `SELECT id_prestador FROM prestadores WHERE tenant_id = $1 AND nombre_embedding IS NULL`,
        [tenantId]
      ),
      query(
        `SELECT id_nomenclador FROM nomencladores WHERE tenant_id = $1 AND descripcion_embedding IS NULL`,
        [tenantId]
      ),
    ]);

    const prestIds = prestResult.rows.map((r) => r.id_prestador);
    const nomIds = nomResult.rows.map((r) => r.id_nomenclador);
    const jobs = [];

    if (prestIds.length > 0) {
      const job = await jobQueueService.enqueue('embedding_prestadores', { ids: prestIds }, {
        batch_id: batchId,
        tenant_id: tenantId,
      });
      jobs.push({ tipo: 'embedding_prestadores', job_id: job.job_id, count: prestIds.length });
    }

    if (nomIds.length > 0) {
      const job = await jobQueueService.enqueue('embedding_nomencladores', { ids: nomIds }, {
        batch_id: batchId,
        tenant_id: tenantId,
      });
      jobs.push({ tipo: 'embedding_nomencladores', job_id: job.job_id, count: nomIds.length });
    }

    if (jobs.length === 0) {
      return res.json({
        status: 'ok',
        data: { message: 'No hay registros sin embeddings', generated: 0, total: 0 },
      });
    }

    res.status(202).json({
      status: 'accepted',
      data: {
        batch_id: batchId,
        jobs,
        generated: 0,
        total: prestIds.length + nomIds.length,
      },
    });
  } catch (err) {
    logger.error('Error in POST /data/embeddings', { error: err.message });
    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

module.exports = router;
