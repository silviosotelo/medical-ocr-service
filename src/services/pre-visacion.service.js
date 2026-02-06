// services/pre-visacion.service.js
const { query, transaction } = require('../config/database.config');
const matchingService = require('./matching.service');
const feedbackService = require('./feedback.service');
const logger = require('../config/logger.config');

class PreVisacionService {
/**
   * Generar pre-visación completa desde resultado de IA
   */
  async generarPreVisacion(ordenProcesadaId, resultadoIA) {
    if (!resultadoIA) throw new Error('El resultado de IA es nulo o indefinido');

    // Esto adapta el formato de gpt-vision.service.js al formato esperado por este servicio
    const datos = {
      ...resultadoIA,
      practicas_solicitadas: resultadoIA.practicas_solicitadas || resultadoIA.practicas || [],
      prestador_emisor: resultadoIA.prestador_emisor || resultadoIA.prestador || {},
      medico_solicitante: resultadoIA.medico_solicitante || resultadoIA.medico || {},
      paciente: resultadoIA.paciente || {},
      // Manejo flexible del diagnóstico (puede ser string o objeto)
      diagnostico: typeof resultadoIA.diagnostico === 'string' 
        ? { descripcion: resultadoIA.diagnostico, codigo_cie10: null }
        : (resultadoIA.diagnostico || {}),
      // Manejo flexible de la fecha
      orden: resultadoIA.orden || { fecha_emision: resultadoIA.fecha_orden }
    };

    return await transaction(async (client) => {
      try {
        logger.info('Iniciando generación de pre-visación', { ordenProcesadaId });

        // 1. MATCHING DE PRESTADOR EMISOR
        let prestadorEmisor = null;
        let prestadorConfianza = 0;

        // Usamos la variable 'datos' normalizada
        if (datos.prestador_emisor?.nombre) {
          const matchesPrestador = await matchingService.buscarPrestador(
            datos.prestador_emisor.nombre,
            datos.prestador_emisor.ruc || datos.prestador_emisor.matricula // Fallback a matricula si es prestador
          );

          if (matchesPrestador && matchesPrestador.length > 0) {
            prestadorEmisor = matchesPrestador[0];
            prestadorConfianza = prestadorEmisor.similitud_combinada || 0;
          }
        }

        // 2. MATCHING DE MÉDICO SOLICITANTE
        let medicoIdPrestador = null;
        if (datos.medico_solicitante?.matricula_nacional || datos.medico_solicitante?.matricula) {
           const matricula = datos.medico_solicitante.matricula_nacional || datos.medico_solicitante.matricula;
           const medico = await matchingService.buscarPrestadorPorMatricula(matricula);
          
           if (medico) {
            medicoIdPrestador = medico.id_prestador;
           }
        }

        // 3. CALCULAR CONFIANZA GENERAL
        const confianzaGeneral = this.calcularConfianzaGeneral(datos, prestadorConfianza);
        const requiereRevision = confianzaGeneral < 0.85;

        // 4. GENERAR OBSERVACIONES DE IA
        const observacionesIA = this.generarObservacionesIA(datos, prestadorEmisor, medicoIdPrestador);

        // 5. CREAR PRE-VISACIÓN (CABECERA)
        const preVisacionResult = await client.query(`
          INSERT INTO visacion_previa (
            orden_procesada_id, archivo_nombre, archivo_url, ci_paciente,
            nombre_paciente, fecha_orden, prestador_id_sugerido, prestador_nombre_original,
            prestador_confianza, medico_nombre, medico_matricula, medico_id_prestador,
            diagnostico_texto, diagnostico_codigo_cie, observaciones_ia, alertas_ia,
            confianza_general, resultado_ia_completo, requiere_revision
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING id_visacion_previa
        `, [
          ordenProcesadaId,
          datos.metadata?.archivo_original || 'desconocido',
          datos.metadata?.archivo_url,
          datos.paciente?.ci,
          `${datos.paciente?.nombres || datos.paciente?.nombre || ''} ${datos.paciente?.apellidos || ''}`.trim(),
          datos.orden?.fecha_emision,
          prestadorEmisor?.id_prestador,
          datos.prestador_emisor?.nombre,
          prestadorConfianza,
          datos.medico_solicitante?.nombre_completo || datos.medico_solicitante?.nombre,
          datos.medico_solicitante?.matricula_nacional || datos.medico_solicitante?.matricula,
          medicoIdPrestador,
          datos.diagnostico?.descripcion, // Ahora funciona gracias a la normalización
          datos.diagnostico?.codigo_cie10,
          observacionesIA,
          JSON.stringify(datos.alertas_ia || []),
          confianzaGeneral,
          JSON.stringify(datos),
          requiereRevision
        ]);

        const preVisacionId = preVisacionResult.rows[0].id_visacion_previa;

        // 6. PROCESAR CADA PRÁCTICA
        const detalles = [];
        const practicas = datos.practicas_solicitadas; // Usamos la key normalizada

        for (let i = 0; i < practicas.length; i++) {
          const practica = practicas[i];
          
          // Aseguramos descripción (tu JSON tiene 'descripcion', el servicio esperaba 'descripcion_original')
          practica.descripcion_original = practica.descripcion_original || practica.descripcion;

          const matchingResult = await matchingService.procesarMatchingPractica(
            practica,
            prestadorEmisor?.id_prestador || 2384, // Británico por defecto
            1
          );

          let prestadorEjecutorId = prestadorEmisor?.id_prestador;
          let prestadorEjecutorNombre = prestadorEmisor?.nombre_fantasia;

          if (practica.prestador_ejecutor && practica.prestador_ejecutor !== datos.prestador_emisor?.nombre) {
            const matchPrestadorEj = await matchingService.buscarPrestador(practica.prestador_ejecutor);
            if (matchPrestadorEj && matchPrestadorEj.length > 0) {
              prestadorEjecutorId = matchPrestadorEj[0].id_prestador;
              prestadorEjecutorNombre = matchPrestadorEj[0].nombre_fantasia;
            }
          }

          const detalleResult = await client.query(`
            INSERT INTO det_visacion_previa (
              visacion_previa_id, item, descripcion_original, cantidad,
              nomenclador_id_sugerido, nomenclador_confianza, nomenclador_descripcion,
              matches_alternativos, prestador_ejecutor_id, prestador_ejecutor_nombre,
              prestador_ejecutor_original, tiene_acuerdo, id_acuerdo, precio_acuerdo, observaciones
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id_det_previa
          `, [
            preVisacionId,
            i + 1,
            matchingResult.descripcion_original,
            matchingResult.cantidad,
            matchingResult.nomenclador_sugerido?.id_nomenclador,
            matchingResult.confianza,
            matchingResult.nomenclador_sugerido?.descripcion,
            JSON.stringify(matchingResult.matches_alternativos || []),
            prestadorEjecutorId,
            prestadorEjecutorNombre,
            practica.prestador_ejecutor,
            matchingResult.tiene_acuerdo,
            matchingResult.id_acuerdo,
            matchingResult.precio_acuerdo,
            matchingResult.alerta
          ]);

          detalles.push({
            id_det_previa: detalleResult.rows[0].id_det_previa,
            item: i + 1,
            descripcion: matchingResult.descripcion_original, // Para el retorno JSON
            nomenclador: matchingResult.nomenclador_sugerido, // Para el retorno JSON
            confianza: matchingResult.confianza
          });
        }

        logger.info('Pre-visación generada exitosamente', {
          id_visacion_previa: preVisacionId,
          items: detalles.length
        });

        return {
          id_visacion_previa: preVisacionId,
          paciente: datos.paciente, // Usar datos normalizados para devolver
          fecha_orden: datos.orden?.fecha_emision,
          prestador_sugerido: prestadorEmisor,
          detalles: detalles,
          confianza_general: confianzaGeneral,
          requiere_revision: requiereRevision
        };

      } catch (error) {
        logger.error('Error generando pre-visación', { error: error.message });
        throw error;
      }
    });
  }

  // Las funciones auxiliares usan 'datos' que ya viene normalizado desde arriba
  calcularConfianzaGeneral(datos, prestadorConfianza) {
    const confianzas = [
      datos.paciente?.confianza || (datos.paciente?.nombre ? 0.9 : 0), // Si hay nombre pero no score, asumir alto
      datos.orden?.confianza || 0.9, 
      prestadorConfianza || 0
    ];

    if (datos.practicas_solicitadas && Array.isArray(datos.practicas_solicitadas)) {
       // Si las practicas no tienen confianza individual (tu JSON actual no lo tiene), asumimos 1.0 por defecto si existen
      if (datos.practicas_solicitadas.length > 0) confianzas.push(0.9);
      
      datos.practicas_solicitadas.forEach(p => {
        if (p.confianza) confianzas.push(p.confianza);
      });
    }

    const promedio = confianzas.reduce((a, b) => a + b, 0) / confianzas.length;
    return Math.round(promedio * 100) / 100;
  }

  generarObservacionesIA(datos, prestadorEmisor, medicoIdPrestador) {
    const observaciones = [];
    const totalPracticas = datos.practicas_solicitadas?.length || 0;
    
    observaciones.push(`Orden procesada: ${totalPracticas} práctica(s).`);
    
    if (prestadorEmisor) {
         observaciones.push(`Prestador: ${prestadorEmisor.nombre_fantasia}.`);
    } else {
         observaciones.push(`⚠️ Prestador no identificado.`);
    }

    if (!medicoIdPrestador && (datos.medico_solicitante?.matricula_nacional || datos.medico_solicitante?.matricula)) {
      observaciones.push(`⚠️ Matrícula médica no hallada.`);
    }

    return observaciones.join(' ');
  }
  /**
   * Obtener pre-visación completa por ID
   */
  async obtenerPreVisacion(idPreVisacion) {
    try {
      // Cabecera
      const cabecera = await query(`
        SELECT 
          vp.*,
          p.nombre_fantasia as prestador_nombre,
          p.ruc as prestador_ruc
        FROM visacion_previa vp
        LEFT JOIN prestadores p ON p.id_prestador = vp.prestador_id_sugerido
        WHERE vp.id_visacion_previa = $1
      `, [idPreVisacion]);

      if (cabecera.rows.length === 0) {
        throw new Error(`Pre-visación ${idPreVisacion} no encontrada`);
      }

      // Detalles
      const detalles = await query(`
        SELECT 
          dvp.*,
          n.descripcion as nomenclador_descripcion,
          n.especialidad as nomenclador_especialidad,
          p.nombre_fantasia as prestador_ejecutor_nombre_completo
        FROM det_visacion_previa dvp
        LEFT JOIN nomencladores n ON n.id_nomenclador = dvp.nomenclador_id_sugerido
        LEFT JOIN prestadores p ON p.id_prestador = dvp.prestador_ejecutor_id
        WHERE dvp.visacion_previa_id = $1
        ORDER BY dvp.item
      `, [idPreVisacion]);

      return {
        cabecera: cabecera.rows[0],
        detalles: detalles.rows
      };

    } catch (error) {
      logger.error('Error obteniendo pre-visación', { error: error.message, idPreVisacion });
      throw error;
    }
  }

  /**
   * Listar pre-visaciones pendientes
   */
  async listarPendientes(filtros = {}) {
    try {
      let whereClause = "WHERE vp.estado = 'PENDIENTE'";
      const params = [];

      if (filtros.requiere_revision !== undefined) {
        params.push(filtros.requiere_revision);
        whereClause += ` AND vp.requiere_revision = $${params.length}`;
      }

      if (filtros.desde) {
        params.push(filtros.desde);
        whereClause += ` AND vp.created_at >= $${params.length}`;
      }

      if (filtros.hasta) {
        params.push(filtros.hasta);
        whereClause += ` AND vp.created_at <= $${params.length}`;
      }

      const result = await query(`
        SELECT * FROM v_previsaciones_pendientes
        ${whereClause.replace('vp.', '')}
        ORDER BY created_at DESC
        LIMIT 50
      `, params);

      return result.rows;

    } catch (error) {
      logger.error('Error listando pre-visaciones pendientes', { error: error.message });
      throw error;
    }
  }

  /**
   * Aprobar pre-visación (marca como aprobada, luego APEX crea en Oracle)
   */
  async aprobarPreVisacion(idPreVisacion, usuario) {
    try {
      await query(`
        UPDATE visacion_previa
        SET estado = 'APROBADA',
            aprobada_por = $2,
            aprobada_en = CURRENT_TIMESTAMP
        WHERE id_visacion_previa = $1
      `, [idPreVisacion, usuario]);

      logger.info('Pre-visación aprobada', { idPreVisacion, usuario });

      return { success: true, message: 'Pre-visación aprobada exitosamente' };

    } catch (error) {
      logger.error('Error aprobando pre-visación', { error: error.message });
      throw error;
    }
  }

  /**
   * Rechazar pre-visación
   */
  async rechazarPreVisacion(idPreVisacion, usuario, motivo) {
    try {
      await query(`
        UPDATE visacion_previa
        SET estado = 'RECHAZADA',
            rechazada_por = $2,
            rechazada_en = CURRENT_TIMESTAMP,
            motivo_rechazo = $3
        WHERE id_visacion_previa = $1
      `, [idPreVisacion, usuario, motivo]);

      logger.info('Pre-visación rechazada', { idPreVisacion, usuario, motivo });

      return { success: true, message: 'Pre-visación rechazada' };

    } catch (error) {
      logger.error('Error rechazando pre-visación', { error: error.message });
      throw error;
    }
  }

  /**
   * Corregir nomenclador en detalle
   */
  async corregirNomenclador(idDetPrevia, idNomencladorCorrecto, usuario, razon) {
    try {
      await transaction(async (client) => {
        // 1. Actualizar detalle
        await client.query(`
          UPDATE det_visacion_previa
          SET nomenclador_id_corregido = $2,
              observacion_correccion = $3,
              estado = 'CORREGIDO'
          WHERE id_det_previa = $1
        `, [idDetPrevia, idNomencladorCorrecto, razon]);

        // 2. Obtener info para feedback
        const detResult = await client.query(`
          SELECT 
            visacion_previa_id,
            descripcion_original,
            nomenclador_id_sugerido
          FROM det_visacion_previa
          WHERE id_det_previa = $1
        `, [idDetPrevia]);

        const det = detResult.rows[0];

        // 3. Registrar feedback
        await client.query(`
          INSERT INTO feedback_matching (
            visacion_previa_id,
            det_previa_id,
            tipo,
            descripcion_original,
            id_sugerido_ia,
            id_correcto,
            razon,
            usuario
          ) VALUES ($1, $2, 'nomenclador_corregido', $3, $4, $5, $6, $7)
        `, [
          det.visacion_previa_id,
          idDetPrevia,
          det.descripcion_original,
          det.nomenclador_id_sugerido,
          idNomencladorCorrecto,
          razon,
          usuario
        ]);

        logger.info('Nomenclador corregido', { idDetPrevia, idNomencladorCorrecto, usuario });
      });

      return { success: true, message: 'Nomenclador corregido exitosamente' };

    } catch (error) {
      logger.error('Error corrigiendo nomenclador', { error: error.message });
      throw error;
    }
  }
}

module.exports = new PreVisacionService();
