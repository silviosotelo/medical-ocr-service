const { query, transaction } = require('../config/database.config');
const logger = require('../config/logger.config');
const crypto = require('crypto');
const fs = require('fs');

class FeedbackService {
  /**
   * Guarda resultado de procesamiento para posterior validación
   * @param {Object} data
   * @returns {Promise<number>} - ID de la orden procesada
   */
  async guardarOrdenProcesada(data) {
    try {
      const {
        archivoNombre,
        archivoPath,
        archivoTipo,
        resultadoIA,
        modeloUsado,
        tokensUsados,
        tiempoProcesamiento,
        confianzaPromedio
      } = data;

      // Calcular hash del archivo
      const archivoHash = await this.calcularHashArchivo(archivoPath);

      const result = await query(`
        INSERT INTO ordenes_procesadas (
          archivo_nombre,
          archivo_hash,
          archivo_tipo,
          archivo_url,
          resultado_ia,
          modelo_usado,
          tokens_usados,
          tiempo_procesamiento_ms,
          confianza_promedio,
          requiere_correccion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (archivo_hash) DO UPDATE
        SET 
          resultado_ia = EXCLUDED.resultado_ia,
          modelo_usado = EXCLUDED.modelo_usado,
          tokens_usados = EXCLUDED.tokens_usados
        RETURNING id
      `, [
        archivoNombre,
        archivoHash,
        archivoTipo,
        archivoPath,
        JSON.stringify(resultadoIA),
        modeloUsado,
        tokensUsados,
        tiempoProcesamiento,
        confianzaPromedio,
        confianzaPromedio < 0.7 || resultadoIA.metadatos?.requiere_revision_humana
      ]);

      logger.info('Orden procesada guardada para validación', {
        id: result.rows[0].id,
        archivoNombre,
        confianza: confianzaPromedio
      });

      return result.rows[0].id;

    } catch (error) {
      logger.error('Error guardando orden procesada', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Valida una orden procesada (marca como correcta)
   * @param {number} ordenId
   * @param {string} validadoPor
   * @returns {Promise<void>}
   */
  async validarOrden(ordenId, validadoPor) {
    try {
      const result = await query(`
        UPDATE ordenes_procesadas
        SET 
          validado = true,
          validado_por = $1,
          validado_en = NOW()
        WHERE id = $2
        RETURNING id
      `, [validadoPor, ordenId]);

      if (result.rowCount === 0) {
        throw new Error(`Orden ${ordenId} no encontrada`);
      }

      logger.info('Orden validada', {
        ordenId,
        validadoPor
      });

      logger.audit('Order validated for training', {
        ordenId,
        validadoPor
      });

    } catch (error) {
      logger.error('Error validando orden', {
        ordenId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Envía corrección para una orden procesada
   * @param {number} ordenId
   * @param {Object} correcciones
   * @param {string} usuario
   * @returns {Promise<void>}
   */
  async enviarCorreccion(ordenId, correcciones, usuario) {
    return await transaction(async (client) => {
      // Obtener orden actual
      const ordenResult = await client.query(
        'SELECT resultado_ia FROM ordenes_procesadas WHERE id = $1',
        [ordenId]
      );

      if (ordenResult.rowCount === 0) {
        throw new Error(`Orden ${ordenId} no encontrada`);
      }

      const resultadoIA = ordenResult.rows[0].resultado_ia;

      // Aplicar correcciones
      const resultadoCorregido = this.aplicarCorrecciones(resultadoIA, correcciones);

      // Actualizar orden con corrección
      await client.query(`
        UPDATE ordenes_procesadas
        SET 
          correccion_humana = $1,
          requiere_correccion = true,
          validado = true,
          validado_por = $2,
          validado_en = NOW()
        WHERE id = $3
      `, [JSON.stringify(resultadoCorregido), usuario, ordenId]);

      // Registrar cada corrección individual
      for (const correccion of correcciones) {
        await client.query(`
          INSERT INTO feedback_correcciones (
            orden_procesada_id,
            tipo,
            campo_corregido,
            valor_ia,
            valor_correcto,
            razon_correccion,
            usuario_correccion
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          ordenId,
          correccion.tipo,
          correccion.campo,
          correccion.valorIA,
          correccion.valorCorrecto,
          correccion.razon || null,
          usuario
        ]);
      }

      logger.info('Correcciones aplicadas', {
        ordenId,
        correcciones: correcciones.length,
        usuario
      });

      logger.audit('Order corrected for training', {
        ordenId,
        correcciones: correcciones.length,
        usuario
      });
    });
  }

  /**
   * Obtiene órdenes pendientes de validación
   * @param {number} limite
   * @returns {Promise<Array>}
   */
  async getOrdenesPendientes(limite = 50) {
    const result = await query(`
      SELECT 
        op.id,
        op.archivo_nombre,
        op.created_at,
        op.confianza_promedio,
        op.resultado_ia->>'metadatos' as metadatos,
        COUNT(fc.id) as correcciones_existentes
      FROM ordenes_procesadas op
      LEFT JOIN feedback_correcciones fc ON fc.orden_procesada_id = op.id
      WHERE op.validado = false
      GROUP BY op.id
      ORDER BY 
        CASE WHEN op.confianza_promedio < 0.8 THEN 0 ELSE 1 END,
        op.created_at DESC
      LIMIT $1
    `, [limite]);

    return result.rows;
  }

  /**
   * Obtiene detalle de una orden para validación
   * @param {number} ordenId
   * @returns {Promise<Object>}
   */
  async getOrdenParaValidacion(ordenId) {
    const result = await query(`
      SELECT 
        op.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', fc.id,
              'tipo', fc.tipo,
              'campo', fc.campo_corregido,
              'valorIA', fc.valor_ia,
              'valorCorrecto', fc.valor_correcto,
              'razon', fc.razon_correccion,
              'usuario', fc.usuario_correccion,
              'fecha', fc.created_at
            )
          ) FILTER (WHERE fc.id IS NOT NULL),
          '[]'
        ) as correcciones_previas
      FROM ordenes_procesadas op
      LEFT JOIN feedback_correcciones fc ON fc.orden_procesada_id = op.id
      WHERE op.id = $1
      GROUP BY op.id
    `, [ordenId]);

    if (result.rowCount === 0) {
      throw new Error(`Orden ${ordenId} no encontrada`);
    }

    return result.rows[0];
  }

  /**
   * Obtiene estadísticas de validación
   * @returns {Promise<Object>}
   */
  async getEstadisticas() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_ordenes,
        COUNT(*) FILTER (WHERE validado = true) as ordenes_validadas,
        COUNT(*) FILTER (WHERE requiere_correccion = true) as ordenes_con_correccion,
        AVG(confianza_promedio) as confianza_promedio,
        COUNT(DISTINCT modelo_usado) as modelos_usados,
        
        -- Estadísticas de correcciones
        (SELECT COUNT(*) FROM feedback_correcciones) as total_correcciones,
        (SELECT COUNT(DISTINCT tipo) FROM feedback_correcciones) as tipos_correcciones,
        
        -- Ejemplos listos para training
        COUNT(*) FILTER (
          WHERE validado = true
          AND NOT EXISTS (
            SELECT 1 FROM training_datasets td
            JOIN finetune_jobs fj ON fj.training_dataset_id = td.id
            WHERE fj.estado = 'succeeded'
              AND ordenes_procesadas.created_at <= fj.completado_en
          )
        ) as ejemplos_para_training
      FROM ordenes_procesadas
    `);

    return result.rows[0];
  }

  /**
   * Calcula hash SHA256 de un archivo
   * @private
   */
  async calcularHashArchivo(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Aplica correcciones al resultado de IA
   * @private
   */
  aplicarCorrecciones(resultadoIA, correcciones) {
    const resultado = JSON.parse(JSON.stringify(resultadoIA)); // Deep clone

    for (const correccion of correcciones) {
      const { campo, valorCorrecto } = correccion;
      
      // Aplicar corrección usando dot notation
      this.setNestedProperty(resultado, campo, valorCorrecto);
    }

    return resultado;
  }

  /**
   * Set nested property using dot notation
   * @private
   */
  setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }
}

module.exports = new FeedbackService();
