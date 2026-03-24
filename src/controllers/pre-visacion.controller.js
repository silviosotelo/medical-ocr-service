const preVisacionService = require('../services/pre-visacion.service');
const gptVisionService = require('../services/gpt-vision.service');
const ragService = require('../services/rag.service');
const feedbackService = require('../services/feedback.service');
const logger = require('../config/logger.config');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PreVisacionController {
  async procesarOrdenYPreVisar(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No se recibió archivo. Use campo "archivo" en multipart/form-data'
        });
      }

      const archivo = req.file;

      logger.info('Procesando orden para pre-visación', {
        archivo: archivo.originalname,
        size: archivo.size
      });

      const tenantId = req.tenantId || null;
      const contextoRAG = await ragService.generarContextoGeneral(tenantId);

      const resultadoIA = await gptVisionService.processOrder(archivo.path, { contextoRAG });

      const ordenId = await feedbackService.guardarOrdenProcesada({
        archivoNombre: archivo.originalname,
        archivoPath: archivo.path,
        archivoTipo: archivo.mimetype,
        resultadoIA: resultadoIA,
        modeloUsado: resultadoIA.metadata?.modelo || 'gpt-4o',
        tokensUsados: resultadoIA.metadata?.tokens_usados || 0,
        tiempoProcesamiento: resultadoIA.metadata?.tiempo_procesamiento_ms || 0,
        confianzaPromedio: resultadoIA.metadata?.confianza_general || 0
      });

      const preVisacion = await preVisacionService.generarPreVisacion(ordenId, resultadoIA, tenantId);

      const urlApex = process.env.APEX_URL
        ? `${process.env.APEX_URL}/apex/f?p=${process.env.APEX_APP_ID}:APROBAR_PREVISACION:SESSION::NO::P_ID:${preVisacion.id_visacion_previa}`
        : null;

      return res.status(200).json({
        status: 'success',
        data: {
          orden_procesada_id: ordenId,
          pre_visacion: preVisacion,
          url_aprobacion: urlApex
        }
      });

    } catch (error) {
      logger.error('Error procesando orden para pre-visación', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async procesarOrdenDesdeURL(req, res) {
    let tempFilePath = null;

    try {
      const { archivo_url } = req.body;

      if (!archivo_url) {
        return res.status(400).json({
          status: 'error',
          message: 'archivo_url es requerido'
        });
      }

      logger.info('Procesando orden desde URL', { archivo_url });

      const response = await axios.get(archivo_url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
        headers: { 'User-Agent': 'SantaClara-PreVisacion/2.0' }
      });

      const contentType = response.headers['content-type'];
      let extension = '.jpg';

      if (contentType) {
        if (contentType.includes('pdf')) extension = '.pdf';
        else if (contentType.includes('png')) extension = '.png';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = '.jpg';
      } else {
        const urlExt = path.extname(archivo_url).toLowerCase();
        if (['.pdf', '.png', '.jpg', '.jpeg'].includes(urlExt)) {
          extension = urlExt;
        }
      }

      tempFilePath = path.join(os.tmpdir(), `temp_orden_${Date.now()}${extension}`);
      await fs.writeFile(tempFilePath, response.data);

      const tenantId = req.tenantId || null;
      const contextoRAG = await ragService.generarContextoGeneral(tenantId);

      const resultadoIA = await gptVisionService.processOrder(tempFilePath, { contextoRAG });

      const ordenId = await feedbackService.guardarOrdenProcesada({
        archivoNombre: path.basename(archivo_url),
        archivoPath: tempFilePath,
        archivoTipo: contentType || 'image/jpeg',
        resultadoIA: resultadoIA,
        modeloUsado: resultadoIA.metadata?.modelo || 'gpt-4o',
        tokensUsados: resultadoIA.metadata?.tokens_usados || 0,
        tiempoProcesamiento: resultadoIA.metadata?.tiempo_procesamiento_ms || 0,
        confianzaPromedio: resultadoIA.metadata?.confianza_general || 0
      });

      const preVisacion = await preVisacionService.generarPreVisacion(ordenId, resultadoIA, tenantId);

      return res.status(200).json({
        status: 'success',
        data: {
          orden_procesada_id: ordenId,
          pre_visacion: preVisacion
        }
      });

    } catch (error) {
      logger.error('Error procesando orden desde URL', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        status: 'error',
        message: error.message
      });

    } finally {
      if (tempFilePath) {
        try { await fs.unlink(tempFilePath); } catch (err) { /* ignore */ }
      }
    }
  }

  async obtenerPreVisacion(req, res) {
    try {
      const { id } = req.params;
      const preVisacion = await preVisacionService.obtenerPreVisacion(parseInt(id), req.tenantId || null);

      return res.status(200).json({
        status: 'success',
        data: preVisacion
      });

    } catch (error) {
      logger.error('Error obteniendo pre-visación', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async listarPendientes(req, res) {
    try {
      const filtros = {
        estado: req.query.estado,
        requiere_revision: req.query.requiere_revision === 'true' ? true :
          req.query.requiere_revision === 'false' ? false : undefined,
        desde: req.query.desde,
        hasta: req.query.hasta,
        ci_paciente: req.query.ci_paciente
      };

      const pendientes = await preVisacionService.listarPendientes(filtros, req.tenantId || null);

      return res.status(200).json({
        status: 'success',
        data: pendientes,
        total: pendientes.length
      });

    } catch (error) {
      logger.error('Error listando pre-visaciones pendientes', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async aprobar(req, res) {
    try {
      const { id } = req.params;
      const { usuario } = req.body;

      if (!usuario) {
        return res.status(400).json({
          status: 'error',
          message: 'Usuario requerido'
        });
      }

      const result = await preVisacionService.aprobarPreVisacion(parseInt(id), usuario);

      return res.status(200).json({
        status: 'success',
        data: result
      });

    } catch (error) {
      logger.error('Error aprobando pre-visación', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async rechazar(req, res) {
    try {
      const { id } = req.params;
      const { usuario, motivo } = req.body;

      if (!usuario || !motivo) {
        return res.status(400).json({
          status: 'error',
          message: 'Usuario y motivo requeridos'
        });
      }

      const result = await preVisacionService.rechazarPreVisacion(
        parseInt(id),
        usuario,
        motivo
      );

      return res.status(200).json({
        status: 'success',
        data: result
      });

    } catch (error) {
      logger.error('Error rechazando pre-visación', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async corregirNomenclador(req, res) {
    try {
      const { idDetalle } = req.params;
      const { nomenclador_id_correcto, nomenclador_id_externo, usuario, razon } = req.body;

      if ((!nomenclador_id_correcto && !nomenclador_id_externo) || !usuario) {
        return res.status(400).json({
          status: 'error',
          message: 'Se requiere nomenclador_id_externo (o nomenclador_id_correcto) y usuario'
        });
      }

      let idInternoNomenclador = nomenclador_id_correcto ? parseInt(nomenclador_id_correcto) : null;

      // Resolver id_externo a id interno si se proveyó
      if (nomenclador_id_externo && !idInternoNomenclador) {
        const { query } = require('../../config/database.config');
        const found = await query(
          `SELECT id_nomenclador FROM nomencladores WHERE id_externo = $1 LIMIT 1`,
          [String(nomenclador_id_externo)]
        );
        if (found.rows.length === 0) {
          return res.status(404).json({
            status: 'error',
            message: `Nomenclador con id_externo "${nomenclador_id_externo}" no encontrado`
          });
        }
        idInternoNomenclador = found.rows[0].id_nomenclador;
      }

      const result = await preVisacionService.corregirNomenclador(
        parseInt(idDetalle),
        idInternoNomenclador,
        usuario,
        razon || 'Corregido por visador'
      );

      return res.status(200).json({
        status: 'success',
        data: result
      });

    } catch (error) {
      logger.error('Error corrigiendo nomenclador', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async obtenerEstadisticas(req, res) {
    try {
      const stats = await preVisacionService.obtenerEstadisticas(req.tenantId || null);

      return res.status(200).json({
        status: 'success',
        data: stats
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas', { error: error.message });
      return res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
}

module.exports = new PreVisacionController();
