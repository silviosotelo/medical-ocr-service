// controllers/pre-visacion.controller.js
const preVisacionService = require('../services/pre-visacion.service');
const gptVisionService = require('../services/gpt-vision.service');
const feedbackService = require('../services/feedback.service');
const logger = require('../config/logger.config');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PreVisacionController {
  /**
   * POST /api/visar/preview
   * Procesar orden médica con upload y generar pre-visación
   */
  async procesarOrdenYPreVisar(req, res) {
    try {
      if (!req.files || !req.files.archivo) {
        return res.status(400).json({
          status: 'error',
          message: 'No se recibió archivo'
        });
      }

      const archivo = req.files.archivo;

      logger.info('Procesando orden para pre-visación', {
        archivo: archivo.name,
        size: archivo.size
      });

      // 1. Procesar con GPT-4o Vision
      const resultadoIA = await gptVisionService.processOrder(archivo.tempFilePath);

      // 2. Guardar en ordenes_procesadas
      const ordenId = await feedbackService.guardarOrdenProcesada({
        archivoNombre: archivo.name,
        archivoPath: archivo.tempFilePath,
        resultadoIA: resultadoIA,
        hashImagen: resultadoIA.hash_imagen,
        confianzaPromedio: resultadoIA.metadata?.confianza_general,
        validado: false
      });

      // 3. Generar pre-visación completa
      const preVisacion = await preVisacionService.generarPreVisacion(ordenId, resultadoIA);

      // 4. URL para APEX
      const urlApex = `${process.env.APEX_URL}/apex/f?p=${process.env.APEX_APP_ID}:APROBAR_PREVISACION:SESSION::NO::P_ID:${preVisacion.id_visacion_previa}`;

      logger.info('Pre-visación generada', {
        ordenId,
        preVisacionId: preVisacion.id_visacion_previa,
        confianza: preVisacion.confianza_general
      });

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

  /**
   * POST /api/visar/preview-url
   * Procesar orden médica desde URL pública (usado por Oracle)
   */
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

      // 1. Descargar archivo desde URL
      const response = await axios.get(archivo_url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
        headers: { 'User-Agent': 'SantaClara-PreVisacion/1.0' }
      });

      // 2. Determinar extensión
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

      // 3. Guardar temporalmente
      tempFilePath = path.join(os.tmpdir(), `temp_orden_${Date.now()}${extension}`);
      await fs.writeFile(tempFilePath, response.data);

      logger.info('Archivo descargado', {
        tempFilePath,
        size: response.data.length,
        contentType
      });

      // 4. Procesar con GPT-4o Vision
      const resultadoIA = await gptVisionService.processOrder(tempFilePath);

      // 5. Guardar en ordenes_procesadas
      const ordenId = await feedbackService.guardarOrdenProcesada({
        archivoNombre: path.basename(archivo_url),
        archivoPath: tempFilePath,
        resultadoIA: resultadoIA,
        hashImagen: resultadoIA.hash_imagen,
        confianzaPromedio: resultadoIA.metadata?.confianza_general,
        validado: false,
        origen: 'oracle_apex_url'
      });

      // 6. Generar pre-visación completa
      const preVisacion = await preVisacionService.generarPreVisacion(ordenId, resultadoIA);

      logger.info('Pre-visación generada desde URL', {
        ordenId,
        preVisacionId: preVisacion.id_visacion_previa,
        confianza: preVisacion.confianza_general
      });

      // 7. Respuesta para Oracle
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
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });

    } finally {
      // Limpiar archivo temporal
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (err) {
          logger.warn('No se pudo eliminar archivo temporal', { tempFilePath });
        }
      }
    }
  }

  /**
   * GET /api/visar/preview/:id
   * Obtener detalle de pre-visación
   */
  async obtenerPreVisacion(req, res) {
    try {
      const { id } = req.params;

      const preVisacion = await preVisacionService.obtenerPreVisacion(parseInt(id));

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

  /**
   * GET /api/visar/preview/pendientes
   * Listar pre-visaciones pendientes
   */
  async listarPendientes(req, res) {
    try {
      const filtros = {
        requiere_revision: req.query.requiere_revision === 'true' ? true :
          req.query.requiere_revision === 'false' ? false : undefined,
        desde: req.query.desde,
        hasta: req.query.hasta
      };

      const pendientes = await preVisacionService.listarPendientes(filtros);

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

  /**
   * POST /api/visar/preview/:id/aprobar
   * Aprobar pre-visación
   */
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

  /**
   * POST /api/visar/preview/:id/rechazar
   * Rechazar pre-visación
   */
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

  /**
   * POST /api/visar/preview/detalle/:idDetalle/corregir
   * Corregir nomenclador en detalle
   */
  async corregirNomenclador(req, res) {
    try {
      const { idDetalle } = req.params;
      const { nomenclador_id_correcto, usuario, razon } = req.body;

      if (!nomenclador_id_correcto || !usuario) {
        return res.status(400).json({
          status: 'error',
          message: 'nomenclador_id_correcto y usuario requeridos'
        });
      }

      const result = await preVisacionService.corregirNomenclador(
        parseInt(idDetalle),
        parseInt(nomenclador_id_correcto),
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
}

module.exports = new PreVisacionController();