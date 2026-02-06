const { query, transaction } = require('../config/database.config');
const matchingService = require('./matching.service');
const ragService = require('./rag.service');
const logger = require('../config/logger.config');

const DEFAULT_PRESTADOR_ID = parseInt(process.env.DEFAULT_PRESTADOR_ID || '0');

class PreVisacionService {
  async generarPreVisacion(ordenProcesadaId, resultadoIA) {
    if (!resultadoIA) throw new Error('El resultado de IA es nulo o indefinido');

    const datos = {
      ...resultadoIA,
      practicas_solicitadas: resultadoIA.practicas_solicitadas || resultadoIA.practicas || [],
      prestador_emisor: resultadoIA.prestador_emisor || resultadoIA.prestador || {},
      medico_solicitante: resultadoIA.medico_solicitante || resultadoIA.medico || {},
      paciente: resultadoIA.paciente || {},
      diagnostico: typeof resultadoIA.diagnostico === 'string'
        ? { descripcion: resultadoIA.diagnostico, codigo_cie10: null }
        : (resultadoIA.diagnostico || {}),
      orden: resultadoIA.orden || { fecha_emision: resultadoIA.fecha_orden }
    };

    return await transaction(async (client) => {
      try {
        logger.info('Iniciando generación de pre-visación', { ordenProcesadaId });

        let prestadorEmisor = null;
        let prestadorConfianza = 0;

        if (datos.prestador_emisor?.nombre) {
          const matchesPrestador = await matchingService.buscarPrestador(
            datos.prestador_emisor.nombre,
            datos.prestador_emisor.ruc || datos.prestador_emisor.matricula
          );

          if (matchesPrestador && matchesPrestador.length > 0) {
            prestadorEmisor = matchesPrestador[0];
            prestadorConfianza = prestadorEmisor.similitud_combinada || 0;
          }
        }

        let medicoIdPrestador = null;
        const matricula = datos.medico_solicitante?.matricula_nacional || datos.medico_solicitante?.matricula;
        if (matricula) {
          const medico = await matchingService.buscarPrestadorPorMatricula(matricula);
          if (medico) {
            medicoIdPrestador = medico.id_prestador;
          }
        }

        const confianzaGeneral = this.calcularConfianzaGeneral(datos, prestadorConfianza);
        const requiereRevision = confianzaGeneral < 0.85;
        const observacionesIA = this.generarObservacionesIA(datos, prestadorEmisor, medicoIdPrestador);

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
          matricula,
          medicoIdPrestador,
          datos.diagnostico?.descripcion,
          datos.diagnostico?.codigo_cie10,
          observacionesIA,
          JSON.stringify(datos.alertas_ia || datos.metadatos_ia?.advertencias || []),
          confianzaGeneral,
          JSON.stringify(datos),
          requiereRevision
        ]);

        const preVisacionId = preVisacionResult.rows[0].id_visacion_previa;

        const detalles = [];
        const practicas = datos.practicas_solicitadas;
        const prestadorIdParaMatching = prestadorEmisor?.id_prestador || DEFAULT_PRESTADOR_ID;

        for (let i = 0; i < practicas.length; i++) {
          const practica = practicas[i];
          practica.descripcion_original = practica.descripcion_original || practica.descripcion;

          let matchingResult;
          if (prestadorIdParaMatching > 0) {
            matchingResult = await matchingService.procesarMatchingPractica(
              practica,
              prestadorIdParaMatching,
              1
            );
          } else {
            const matchesNomen = await matchingService.buscarNomencladores(practica.descripcion_original, 10);
            matchingResult = {
              descripcion_original: practica.descripcion_original,
              cantidad: practica.cantidad || 1,
              nomenclador_sugerido: matchesNomen[0] ? {
                id_nomenclador: matchesNomen[0].id_nomenclador,
                descripcion: matchesNomen[0].descripcion,
                especialidad: matchesNomen[0].especialidad,
                grupo: matchesNomen[0].grupo,
                subgrupo: matchesNomen[0].subgrupo
              } : null,
              confianza: matchesNomen[0]?.similitud_combinada || 0,
              matches_alternativos: matchesNomen.slice(1, 6).map(m => ({
                id_nomenclador: m.id_nomenclador,
                descripcion: m.descripcion,
                especialidad: m.especialidad,
                similitud: m.similitud_combinada,
                tiene_acuerdo: false
              })),
              tiene_acuerdo: false,
              id_acuerdo: null,
              precio_acuerdo: null,
              alerta: 'Prestador no identificado - sin verificación de acuerdo'
            };
          }

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
            descripcion: matchingResult.descripcion_original,
            nomenclador: matchingResult.nomenclador_sugerido,
            confianza: matchingResult.confianza,
            tiene_acuerdo: matchingResult.tiene_acuerdo,
            precio_acuerdo: matchingResult.precio_acuerdo,
            matches_alternativos: matchingResult.matches_alternativos
          });
        }

        logger.info('Pre-visación generada exitosamente', {
          id_visacion_previa: preVisacionId,
          items: detalles.length,
          confianza: confianzaGeneral
        });

        return {
          id_visacion_previa: preVisacionId,
          paciente: datos.paciente,
          fecha_orden: datos.orden?.fecha_emision,
          prestador_sugerido: prestadorEmisor ? {
            id_prestador: prestadorEmisor.id_prestador,
            nombre_fantasia: prestadorEmisor.nombre_fantasia,
            ruc: prestadorEmisor.ruc,
            confianza: prestadorConfianza
          } : null,
          medico: {
            nombre: datos.medico_solicitante?.nombre_completo || datos.medico_solicitante?.nombre,
            matricula: matricula,
            id_prestador: medicoIdPrestador
          },
          diagnostico: datos.diagnostico,
          detalles,
          confianza_general: confianzaGeneral,
          requiere_revision: requiereRevision,
          observaciones_ia: observacionesIA
        };

      } catch (error) {
        logger.error('Error generando pre-visación', { error: error.message, stack: error.stack });
        throw error;
      }
    });
  }

  calcularConfianzaGeneral(datos, prestadorConfianza) {
    const confianzas = [];

    if (datos.paciente?.nombre) confianzas.push(datos.paciente?.confianza || 0.9);
    else confianzas.push(0);

    confianzas.push(datos.orden?.confianza || (datos.orden?.fecha_emision ? 0.9 : 0.3));
    confianzas.push(prestadorConfianza || 0);

    if (datos.practicas_solicitadas && Array.isArray(datos.practicas_solicitadas)) {
      if (datos.practicas_solicitadas.length > 0) {
        const practicaConfianzas = datos.practicas_solicitadas
          .map(p => p.confianza || 0.8)
          .filter(c => c > 0);

        if (practicaConfianzas.length > 0) {
          const avgPractica = practicaConfianzas.reduce((a, b) => a + b, 0) / practicaConfianzas.length;
          confianzas.push(avgPractica);
        }
      } else {
        confianzas.push(0);
      }
    }

    if (confianzas.length === 0) return 0;

    const promedio = confianzas.reduce((a, b) => a + b, 0) / confianzas.length;
    return Math.round(promedio * 100) / 100;
  }

  generarObservacionesIA(datos, prestadorEmisor, medicoIdPrestador) {
    const observaciones = [];
    const totalPracticas = datos.practicas_solicitadas?.length || 0;

    observaciones.push(`Orden procesada: ${totalPracticas} practica(s) detectada(s).`);

    if (prestadorEmisor) {
      observaciones.push(`Prestador identificado: ${prestadorEmisor.nombre_fantasia} (confianza: ${(prestadorEmisor.similitud_combinada || 0).toFixed(2)}).`);
    } else if (datos.prestador_emisor?.nombre) {
      observaciones.push(`ALERTA: Prestador "${datos.prestador_emisor.nombre}" no encontrado en base de datos.`);
    } else {
      observaciones.push(`ALERTA: No se detectó nombre de prestador en la orden.`);
    }

    const matricula = datos.medico_solicitante?.matricula_nacional || datos.medico_solicitante?.matricula;
    if (matricula && !medicoIdPrestador) {
      observaciones.push(`ALERTA: Matricula ${matricula} no encontrada en registros.`);
    }

    if (datos.metadatos_ia?.legibilidad === 'BAJA') {
      observaciones.push(`ALERTA: Orden con baja legibilidad - requiere revision manual.`);
    }

    if (datos.metadatos_ia?.es_urgente) {
      observaciones.push(`URGENTE: Orden marcada como urgente.`);
    }

    if (datos.metadatos_ia?.advertencias?.length > 0) {
      observaciones.push(`Advertencias IA: ${datos.metadatos_ia.advertencias.join('; ')}`);
    }

    return observaciones.join(' ');
  }

  async obtenerPreVisacion(idPreVisacion) {
    try {
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
        throw new Error(`Pre-visacion ${idPreVisacion} no encontrada`);
      }

      const detalles = await query(`
        SELECT
          dvp.*,
          n.descripcion as nomenclador_descripcion_full,
          n.especialidad as nomenclador_especialidad,
          pe.nombre_fantasia as prestador_ejecutor_nombre_completo
        FROM det_visacion_previa dvp
        LEFT JOIN nomencladores n ON n.id_nomenclador = dvp.nomenclador_id_sugerido
        LEFT JOIN prestadores pe ON pe.id_prestador = dvp.prestador_ejecutor_id
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

  async listarPendientes(filtros = {}) {
    try {
      const conditions = ["vp.estado = 'PENDIENTE'"];
      const params = [];

      if (filtros.requiere_revision !== undefined) {
        params.push(filtros.requiere_revision);
        conditions.push(`vp.requiere_revision = $${params.length}`);
      }

      if (filtros.desde) {
        params.push(filtros.desde);
        conditions.push(`vp.created_at >= $${params.length}`);
      }

      if (filtros.hasta) {
        params.push(filtros.hasta);
        conditions.push(`vp.created_at <= $${params.length}`);
      }

      if (filtros.ci_paciente) {
        params.push(filtros.ci_paciente);
        conditions.push(`vp.ci_paciente = $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await query(`
        SELECT
          vp.id_visacion_previa,
          vp.ci_paciente,
          vp.nombre_paciente,
          vp.fecha_orden,
          vp.prestador_nombre_original,
          p.nombre_fantasia as prestador_encontrado,
          vp.confianza_general,
          vp.requiere_revision,
          vp.estado,
          vp.created_at,
          COUNT(dvp.id_det_previa) as cantidad_items,
          AVG(dvp.nomenclador_confianza)::DECIMAL(3,2) as confianza_promedio_items,
          SUM(CASE WHEN dvp.tiene_acuerdo THEN 1 ELSE 0 END) as items_con_acuerdo
        FROM visacion_previa vp
        LEFT JOIN prestadores p ON p.id_prestador = vp.prestador_id_sugerido
        LEFT JOIN det_visacion_previa dvp ON dvp.visacion_previa_id = vp.id_visacion_previa
        ${whereClause}
        GROUP BY vp.id_visacion_previa, p.nombre_fantasia
        ORDER BY vp.created_at DESC
        LIMIT 100
      `, params);

      return result.rows;

    } catch (error) {
      logger.error('Error listando pre-visaciones pendientes', { error: error.message });
      throw error;
    }
  }

  async aprobarPreVisacion(idPreVisacion, usuario) {
    try {
      const result = await query(`
        UPDATE visacion_previa
        SET estado = 'APROBADA',
            aprobada_por = $2,
            aprobada_en = CURRENT_TIMESTAMP
        WHERE id_visacion_previa = $1
        AND estado = 'PENDIENTE'
        RETURNING id_visacion_previa
      `, [idPreVisacion, usuario]);

      if (result.rowCount === 0) {
        throw new Error(`Pre-visacion ${idPreVisacion} no encontrada o ya procesada`);
      }

      logger.info('Pre-visación aprobada', { idPreVisacion, usuario });
      return { success: true, message: 'Pre-visación aprobada exitosamente' };

    } catch (error) {
      logger.error('Error aprobando pre-visación', { error: error.message });
      throw error;
    }
  }

  async rechazarPreVisacion(idPreVisacion, usuario, motivo) {
    try {
      const result = await query(`
        UPDATE visacion_previa
        SET estado = 'RECHAZADA',
            rechazada_por = $2,
            rechazada_en = CURRENT_TIMESTAMP,
            motivo_rechazo = $3
        WHERE id_visacion_previa = $1
        AND estado = 'PENDIENTE'
        RETURNING id_visacion_previa
      `, [idPreVisacion, usuario, motivo]);

      if (result.rowCount === 0) {
        throw new Error(`Pre-visacion ${idPreVisacion} no encontrada o ya procesada`);
      }

      logger.info('Pre-visación rechazada', { idPreVisacion, usuario, motivo });
      return { success: true, message: 'Pre-visación rechazada' };

    } catch (error) {
      logger.error('Error rechazando pre-visación', { error: error.message });
      throw error;
    }
  }

  async corregirNomenclador(idDetPrevia, idNomencladorCorrecto, usuario, razon) {
    try {
      await transaction(async (client) => {
        await client.query(`
          UPDATE det_visacion_previa
          SET nomenclador_id_corregido = $2,
              observacion_correccion = $3,
              estado = 'CORREGIDO'
          WHERE id_det_previa = $1
        `, [idDetPrevia, idNomencladorCorrecto, razon]);

        const detResult = await client.query(`
          SELECT
            visacion_previa_id,
            descripcion_original,
            nomenclador_id_sugerido
          FROM det_visacion_previa
          WHERE id_det_previa = $1
        `, [idDetPrevia]);

        if (detResult.rows.length === 0) {
          throw new Error(`Detalle ${idDetPrevia} no encontrado`);
        }

        const det = detResult.rows[0];

        await client.query(`
          INSERT INTO feedback_matching (
            visacion_previa_id, det_previa_id, tipo,
            descripcion_original, id_sugerido_ia, id_correcto,
            razon, usuario
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

  async obtenerEstadisticas() {
    try {
      const result = await query(`
        SELECT
          COUNT(*) as total_previsaciones,
          COUNT(*) FILTER (WHERE estado = 'PENDIENTE') as pendientes,
          COUNT(*) FILTER (WHERE estado = 'APROBADA') as aprobadas,
          COUNT(*) FILTER (WHERE estado = 'RECHAZADA') as rechazadas,
          AVG(confianza_general)::DECIMAL(3,2) as confianza_promedio,
          COUNT(*) FILTER (WHERE requiere_revision) as requieren_revision
        FROM visacion_previa
      `);

      const detResult = await query(`
        SELECT
          COUNT(*) as total_items,
          AVG(nomenclador_confianza)::DECIMAL(3,2) as confianza_items_promedio,
          SUM(CASE WHEN tiene_acuerdo THEN 1 ELSE 0 END) as items_con_acuerdo,
          COUNT(*) FILTER (WHERE estado = 'CORREGIDO') as items_corregidos
        FROM det_visacion_previa
      `);

      return {
        ...result.rows[0],
        ...detResult.rows[0]
      };

    } catch (error) {
      logger.error('Error obteniendo estadisticas', { error: error.message });
      throw error;
    }
  }
}

module.exports = new PreVisacionService();
