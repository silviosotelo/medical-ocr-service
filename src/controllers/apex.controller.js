const preVisacionService = require('../services/pre-visacion.service');
const matchingService = require('../services/matching.service');
const ragService = require('../services/rag.service');
const { query } = require('../config/database.config');
const logger = require('../config/logger.config');

class ApexController {
  async sincronizarAprobada(req, res) {
    try {
      const { id } = req.params;
      const { id_visacion_oracle, usuario_apex } = req.body;

      if (!id_visacion_oracle) {
        return res.status(400).json({
          status: 'error',
          message: 'id_visacion_oracle es requerido'
        });
      }

      await query(`
        UPDATE visacion_previa
        SET id_visacion_oracle = $2,
            sincronizado_oracle = true,
            fecha_sincronizacion = CURRENT_TIMESTAMP
        WHERE id_visacion_previa = $1
      `, [parseInt(id), id_visacion_oracle]);

      logger.info('Pre-visación sincronizada con Oracle', {
        id_previsacion: id,
        id_visacion_oracle,
        usuario_apex
      });

      return res.status(200).json({
        status: 'success',
        data: { sincronizado: true }
      });

    } catch (error) {
      logger.error('Error sincronizando con Oracle', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async obtenerPendientesSinc(req, res) {
    try {
      const result = await query(`
        SELECT
          vp.id_visacion_previa,
          vp.ci_paciente,
          vp.nombre_paciente,
          vp.fecha_orden,
          vp.prestador_id_sugerido,
          vp.prestador_nombre_original,
          p.nombre_fantasia as prestador_nombre,
          p.ruc as prestador_ruc,
          vp.medico_nombre,
          vp.medico_matricula,
          vp.medico_id_prestador,
          vp.diagnostico_texto,
          vp.diagnostico_codigo_cie,
          vp.confianza_general,
          vp.estado,
          vp.aprobada_por,
          vp.aprobada_en,
          vp.created_at
        FROM visacion_previa vp
        LEFT JOIN prestadores p ON p.id_prestador = vp.prestador_id_sugerido
        WHERE vp.estado = 'APROBADA'
        AND vp.sincronizado_oracle = false
        ORDER BY vp.aprobada_en ASC
        LIMIT 50
      `);

      const previsaciones = [];
      for (const row of result.rows) {
        const detalles = await query(`
          SELECT
            dvp.id_det_previa,
            dvp.item,
            dvp.descripcion_original,
            dvp.cantidad,
            COALESCE(dvp.nomenclador_id_corregido, dvp.nomenclador_id_sugerido) as nomenclador_id_final,
            COALESCE(nc.descripcion, dvp.nomenclador_descripcion) as nomenclador_descripcion_final,
            COALESCE(nc.especialidad, n.especialidad) as nomenclador_especialidad,
            dvp.prestador_ejecutor_id,
            dvp.prestador_ejecutor_nombre,
            dvp.tiene_acuerdo,
            dvp.id_acuerdo,
            dvp.precio_acuerdo,
            dvp.estado as estado_item
          FROM det_visacion_previa dvp
          LEFT JOIN nomencladores n ON n.id_nomenclador = dvp.nomenclador_id_sugerido
          LEFT JOIN nomencladores nc ON nc.id_nomenclador = dvp.nomenclador_id_corregido
          WHERE dvp.visacion_previa_id = $1
          ORDER BY dvp.item
        `, [row.id_visacion_previa]);

        previsaciones.push({
          ...row,
          detalles: detalles.rows
        });
      }

      return res.status(200).json({
        status: 'success',
        data: previsaciones,
        total: previsaciones.length
      });

    } catch (error) {
      logger.error('Error obteniendo pendientes de sincronización', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async sincronizarBulk(req, res) {
    try {
      const { sincronizaciones } = req.body;

      if (!Array.isArray(sincronizaciones) || sincronizaciones.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'sincronizaciones debe ser un array no vacío'
        });
      }

      const resultados = [];
      for (const sinc of sincronizaciones) {
        try {
          await query(`
            UPDATE visacion_previa
            SET id_visacion_oracle = $2,
                sincronizado_oracle = true,
                fecha_sincronizacion = CURRENT_TIMESTAMP
            WHERE id_visacion_previa = $1
          `, [sinc.id_previsacion, sinc.id_visacion_oracle]);

          resultados.push({ id_previsacion: sinc.id_previsacion, success: true });
        } catch (err) {
          resultados.push({ id_previsacion: sinc.id_previsacion, success: false, error: err.message });
        }
      }

      return res.status(200).json({
        status: 'success',
        data: resultados,
        total: resultados.length,
        exitosos: resultados.filter(r => r.success).length
      });

    } catch (error) {
      logger.error('Error en sincronización bulk', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async buscarNomenclador(req, res) {
    try {
      const { descripcion, limite } = req.query;

      if (!descripcion) {
        return res.status(400).json({
          status: 'error',
          message: 'descripcion es requerido'
        });
      }

      const resultados = await matchingService.buscarNomencladores(descripcion, parseInt(limite) || 10);

      return res.status(200).json({
        status: 'success',
        data: resultados
      });

    } catch (error) {
      logger.error('Error buscando nomenclador', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async buscarPrestador(req, res) {
    try {
      const { nombre, ruc } = req.query;

      if (!nombre && !ruc) {
        return res.status(400).json({
          status: 'error',
          message: 'nombre o ruc es requerido'
        });
      }

      const resultados = await matchingService.buscarPrestador(nombre || '', ruc);

      return res.status(200).json({
        status: 'success',
        data: resultados
      });

    } catch (error) {
      logger.error('Error buscando prestador', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async verificarAcuerdo(req, res) {
    try {
      const { prestador_id, nomenclador_id, plan_id } = req.query;

      if (!prestador_id || !nomenclador_id) {
        return res.status(400).json({
          status: 'error',
          message: 'prestador_id y nomenclador_id son requeridos'
        });
      }

      const acuerdo = await matchingService.verificarAcuerdo(
        parseInt(prestador_id),
        parseInt(nomenclador_id),
        parseInt(plan_id) || 1
      );

      return res.status(200).json({
        status: 'success',
        data: {
          tiene_acuerdo: !!acuerdo,
          acuerdo: acuerdo
        }
      });

    } catch (error) {
      logger.error('Error verificando acuerdo', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async estadisticas(req, res) {
    try {
      const stats = await preVisacionService.obtenerEstadisticas();

      return res.status(200).json({
        status: 'success',
        data: stats
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas APEX', { error: error.message });
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }
}

module.exports = new ApexController();
