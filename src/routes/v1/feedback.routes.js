const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../../config/database.config');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const preVisacionService = require('../../services/pre-visacion.service');
const webhookService = require('../../services/webhook.service');
const logger = require('../../config/logger.config');

// Auth middleware - supports Bearer JWT or X-Api-Key
function apiKeyOrBearerAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    req.headers.authorization = `Bearer ${apiKey}`;
  }
  return authMiddleware(req, res, next);
}

router.use(apiKeyOrBearerAuth);

// =====================================================================
// Validation schemas
// =====================================================================

const correccionSchema = Joi.object({
  item: Joi.number().integer().required(),
  id_nomenclador_correcto: Joi.number().integer().allow(null),
  id_prestador_correcto: Joi.number().integer().allow(null),
  cantidad_correcta: Joi.number().allow(null),
  razon: Joi.string().allow(null, ''),
});

const feedbackSchema = Joi.object({
  accion: Joi.string().valid('APROBAR', 'RECHAZAR', 'CORREGIR').required(),
  usuario: Joi.string().required(),
  motivo: Joi.string().allow(null, ''),
  correcciones: Joi.array().items(correccionSchema).when('accion', {
    is: 'CORREGIR',
    then: Joi.array().min(1).required(),
    otherwise: Joi.array().optional(),
  }),
});

// =====================================================================
// POST /v1/ordenes/:id_visacion/feedback
// =====================================================================
router.post('/:id_visacion/feedback', async (req, res) => {
  try {
    const { error, value } = feedbackSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(422).json({
        status: 'error',
        errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
      });
    }

    const idVisacion = parseInt(req.params.id_visacion);
    const { accion, usuario, motivo, correcciones } = value;

    let result;
    let estadoFinal;
    let correccionesAplicadas = 0;
    let usadoEnTraining = false;

    if (accion === 'APROBAR') {
      result = await preVisacionService.aprobarPreVisacion(idVisacion, usuario);
      estadoFinal = 'APROBADA';

      // Register positive feedback in feedback_matching
      try {
        const detalles = await query(
          `SELECT id_det_previa, descripcion_original, nomenclador_id_sugerido
           FROM det_visacion_previa WHERE visacion_previa_id = $1`,
          [idVisacion]
        );

        for (const det of detalles.rows) {
          if (det.nomenclador_id_sugerido) {
            await query(
              `INSERT INTO feedback_matching (visacion_previa_id, det_previa_id, tipo, descripcion_original, id_sugerido_ia, id_correcto, razon, usuario)
               VALUES ($1, $2, 'aprobado', $3, $4, $4, 'Aprobado por usuario', $5)`,
              [idVisacion, det.id_det_previa, det.descripcion_original, det.nomenclador_id_sugerido, usuario]
            );
          }
        }
        usadoEnTraining = true;
      } catch (feedbackErr) {
        logger.warn('Could not register approval feedback', { error: feedbackErr.message });
      }
    } else if (accion === 'RECHAZAR') {
      result = await preVisacionService.rechazarPreVisacion(idVisacion, usuario, motivo);
      estadoFinal = 'RECHAZADA';
    } else if (accion === 'CORREGIR') {
      // Get detalles to find det_previa_id by item number
      const detalles = await query(
        `SELECT id_det_previa, item FROM det_visacion_previa WHERE visacion_previa_id = $1`,
        [idVisacion]
      );

      const detalleMap = {};
      for (const d of detalles.rows) {
        detalleMap[d.item] = d.id_det_previa;
      }

      for (const correccion of correcciones) {
        const idDetPrevia = detalleMap[correccion.item];
        if (!idDetPrevia) {
          logger.warn('Item not found for correction', { item: correccion.item, idVisacion });
          continue;
        }

        if (correccion.id_nomenclador_correcto) {
          await preVisacionService.corregirNomenclador(
            idDetPrevia,
            correccion.id_nomenclador_correcto,
            usuario,
            correccion.razon || motivo || 'Corrección manual'
          );
          correccionesAplicadas++;
        }

        if (correccion.cantidad_correcta !== null && correccion.cantidad_correcta !== undefined) {
          await query(
            `UPDATE det_visacion_previa SET cantidad_corregida = $2 WHERE id_det_previa = $1`,
            [idDetPrevia, correccion.cantidad_correcta]
          );
          correccionesAplicadas++;
        }

        if (correccion.id_prestador_correcto) {
          await query(
            `UPDATE det_visacion_previa SET prestador_id_corregido = $2 WHERE id_det_previa = $1`,
            [idDetPrevia, correccion.id_prestador_correcto]
          );
          correccionesAplicadas++;
        }
      }

      estadoFinal = 'APROBADA';
      usadoEnTraining = true;
      result = { success: true, message: `${correccionesAplicadas} correcciones aplicadas` };
    }

    // Dispatch webhook: previsacion.feedback_recibido
    const webhookPayload = {
      id_visacion_previa: idVisacion,
      accion,
      usuario,
      estado_final: estadoFinal,
      correcciones_aplicadas: correccionesAplicadas,
      usado_en_training: usadoEnTraining,
    };

    if (req.tenantId) {
      try {
        if (webhookService.dispatchWithRetry) {
          await webhookService.dispatchWithRetry(req.tenantId, 'previsacion.feedback_recibido', webhookPayload);
        } else {
          await webhookService.dispatch(req.tenantId, 'previsacion.feedback_recibido', webhookPayload);
        }
      } catch (webhookErr) {
        logger.warn('Failed to dispatch feedback webhook', { error: webhookErr.message });
      }
    }

    res.json({
      status: 'ok',
      data: {
        id_visacion_previa: idVisacion,
        accion,
        estado_final: estadoFinal,
        correcciones_aplicadas: correccionesAplicadas,
        usado_en_training: usadoEnTraining,
        ...result,
      },
    });
  } catch (err) {
    logger.error('Error in POST /ordenes/:id_visacion/feedback', { error: err.message });

    if (err.message.includes('no encontrada') || err.message.includes('ya procesada')) {
      return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: err.message } });
    }

    res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

module.exports = router;
