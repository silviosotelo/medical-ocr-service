// services/matching.service.js
const { query, transaction } = require('../config/database.config');
const embeddingService = require('./embedding.service');
const logger = require('../config/logger.config');

class MatchingService {
  /**
   * Buscar nomencladores por descripción (búsqueda vectorial + fuzzy)
   * @param {string} descripcion - Descripción de la práctica
   * @param {number} limite - Cantidad de resultados
   * @param {string} tenantId - ID del tenant
   * @returns {Promise<Array>} - Array de nomencladores con similitud
   */
  async buscarNomencladores(descripcion, limite = 10, tenantId = null) {
    try {
      const embedding = await embeddingService.generateEmbedding(descripcion);

      if (!embedding) {
        throw new Error('No se pudo generar embedding');
      }

      const embeddingStr = `[${embedding.join(',')}]`;

      const params = [embeddingStr, descripcion.toLowerCase()];
      let tenantFilter = '';
      if (tenantId) {
        params.push(tenantId);
        tenantFilter = `AND tenant_id = $${params.length}`;
      }
      params.push(limite);

      const result = await query(`
        SELECT
          id_nomenclador,
          especialidad,
          descripcion,
          grupo,
          subgrupo,
          cantidad_acuerdos,
          (1 - (descripcion_embedding <=> $1::vector)) as similitud_vectorial,
          similarity(descripcion_normalizada, $2) as similitud_trigram
        FROM nomencladores
        WHERE estado = 'ACTIVO' ${tenantFilter}
        ORDER BY
          descripcion_embedding <=> $1::vector
        LIMIT $${params.length}
      `, params);

      const resultados = result.rows.map(row => ({
        id_nomenclador: row.id_nomenclador,
        especialidad: row.especialidad,
        descripcion: row.descripcion,
        grupo: row.grupo,
        subgrupo: row.subgrupo,
        cantidad_acuerdos: row.cantidad_acuerdos,
        similitud_vectorial: parseFloat(row.similitud_vectorial),
        similitud_trigram: parseFloat(row.similitud_trigram || 0),
        similitud_combinada: (
          parseFloat(row.similitud_vectorial) * 0.7 +
          parseFloat(row.similitud_trigram || 0) * 0.3
        )
      }));

      resultados.sort((a, b) => b.similitud_combinada - a.similitud_combinada);

      logger.info('Búsqueda de nomencladores', {
        descripcion,
        resultados: resultados.length,
        mejor_match: resultados[0]?.similitud_combinada
      });

      return resultados;

    } catch (error) {
      logger.error('Error buscando nomencladores', { error: error.message, descripcion });
      throw error;
    }
  }

  /**
   * Buscar prestador por nombre (búsqueda vectorial + fuzzy)
   * @param {string} nombre - Nombre del prestador
   * @param {string} ruc - RUC del prestador (opcional)
   * @param {string} tenantId - ID del tenant
   * @returns {Promise<Array>} - Array de prestadores con similitud
   */
  async buscarPrestador(nombre, ruc = null, tenantId = null) {
    try {
      if (ruc) {
        const params = [ruc];
        let tenantFilter = '';
        if (tenantId) {
          params.push(tenantId);
          tenantFilter = `AND tenant_id = $${params.length}`;
        }

        const resultRuc = await query(`
          SELECT
            id_prestador,
            nombre_fantasia,
            raz_soc_nombre,
            ruc,
            registro_profesional,
            cantidad_acuerdos,
            1.0 as similitud_vectorial,
            1.0 as similitud_trigram,
            1.0 as similitud_combinada
          FROM prestadores
          WHERE ruc = $1
          AND estado = 'ACTIVO' ${tenantFilter}
        `, params);

        if (resultRuc.rows.length > 0) {
          logger.info('Prestador encontrado por RUC', { ruc, id_prestador: resultRuc.rows[0].id_prestador });
          return resultRuc.rows;
        }
      }

      const embedding = await embeddingService.generateEmbedding(nombre);

      if (!embedding) {
        throw new Error('No se pudo generar embedding');
      }

      const embeddingStr = `[${embedding.join(',')}]`;

      const params = [embeddingStr, nombre.toLowerCase()];
      let tenantFilter = '';
      if (tenantId) {
        params.push(tenantId);
        tenantFilter = `AND tenant_id = $${params.length}`;
      }

      const result = await query(`
        SELECT
          id_prestador,
          nombre_fantasia,
          raz_soc_nombre,
          ruc,
          registro_profesional,
          cantidad_acuerdos,
          (1 - (nombre_embedding <=> $1::vector)) as similitud_vectorial,
          similarity(nombre_normalizado, $2) as similitud_trigram
        FROM prestadores
        WHERE estado = 'ACTIVO' ${tenantFilter}
        ORDER BY
          nombre_embedding <=> $1::vector
        LIMIT 5
      `, params);

      const resultados = result.rows.map(row => ({
        id_prestador: row.id_prestador,
        nombre_fantasia: row.nombre_fantasia,
        raz_soc_nombre: row.raz_soc_nombre,
        ruc: row.ruc,
        registro_profesional: row.registro_profesional,
        cantidad_acuerdos: row.cantidad_acuerdos,
        similitud_vectorial: parseFloat(row.similitud_vectorial),
        similitud_trigram: parseFloat(row.similitud_trigram || 0),
        similitud_combinada: (
          parseFloat(row.similitud_vectorial) * 0.7 +
          parseFloat(row.similitud_trigram || 0) * 0.3
        )
      }));

      resultados.sort((a, b) => b.similitud_combinada - a.similitud_combinada);

      logger.info('Búsqueda de prestador', {
        nombre,
        resultados: resultados.length,
        mejor_match: resultados[0]?.similitud_combinada
      });

      return resultados;

    } catch (error) {
      logger.error('Error buscando prestador', { error: error.message, nombre });
      throw error;
    }
  }

  /**
   * Buscar prestador por matrícula
   * @param {string} matricula - Matrícula nacional o registro profesional
   * @param {string} tenantId - ID del tenant
   * @returns {Promise<Object|null>} - Prestador encontrado o null
   */
  async buscarPrestadorPorMatricula(matricula, tenantId = null) {
    try {
      const params = [matricula];
      let tenantFilter = '';
      if (tenantId) {
        params.push(tenantId);
        tenantFilter = `AND tenant_id = $${params.length}`;
      }

      const result = await query(`
        SELECT
          id_prestador,
          nombre_fantasia,
          raz_soc_nombre,
          ruc,
          registro_profesional
        FROM prestadores
        WHERE registro_profesional = $1
        AND estado = 'ACTIVO' ${tenantFilter}
        LIMIT 1
      `, params);

      if (result.rows.length === 0) {
        logger.info('Prestador no encontrado por matrícula', { matricula });
        return null;
      }

      logger.info('Prestador encontrado por matrícula', {
        matricula,
        id_prestador: result.rows[0].id_prestador
      });

      return result.rows[0];

    } catch (error) {
      logger.error('Error buscando prestador por matrícula', { error: error.message, matricula });
      throw error;
    }
  }

  /**
   * Verificar si existe acuerdo entre prestador y nomenclador
   * @param {number} idPrestador - ID del prestador
   * @param {number} idNomenclador - ID del nomenclador
   * @param {number} idPlan - ID del plan (opcional, default 1)
   * @param {string} tenantId - ID del tenant
   * @returns {Promise<Object|null>} - Acuerdo encontrado o null
   */
  async verificarAcuerdo(idPrestador, idNomenclador, idPlan = 1, tenantId = null) {
    try {
      const params = [idPrestador, idNomenclador, idPlan];
      let tenantFilter = '';
      if (tenantId) {
        params.push(tenantId);
        tenantFilter = `AND tenant_id = $${params.length}`;
      }

      const result = await query(`
        SELECT
          id_acuerdo,
          prest_id_prestador,
          id_nomenclador,
          plan_id_plan,
          precio,
          precio_normal,
          precio_diferenciado,
          precio_internado,
          fecha_vigencia
        FROM acuerdos_prestador
        WHERE prest_id_prestador = $1
        AND id_nomenclador = $2
        AND plan_id_plan = $3
        AND vigente = 'SI' ${tenantFilter}
        ORDER BY fecha_vigencia DESC
        LIMIT 1
      `, params);

      if (result.rows.length === 0) {
        logger.info('No existe acuerdo', { idPrestador, idNomenclador, idPlan });
        return null;
      }

      logger.info('Acuerdo encontrado', {
        idPrestador,
        idNomenclador,
        precio: result.rows[0].precio
      });

      return result.rows[0];

    } catch (error) {
      logger.error('Error verificando acuerdo', { error: error.message });
      throw error;
    }
  }

  /**
   * Buscar nomencladores con acuerdo para un prestador
   * @param {number} idPrestador - ID del prestador
   * @param {Array<number>} idsNomencladores - IDs de nomencladores candidatos
   * @param {number} idPlan - ID del plan
   * @param {string} tenantId - ID del tenant
   * @returns {Promise<Array>} - Nomencladores con acuerdo
   */
  async buscarNomencladoresConAcuerdo(idPrestador, idsNomencladores, idPlan = 1, tenantId = null) {
    try {
      if (!idsNomencladores || idsNomencladores.length === 0) {
        return [];
      }

      const params = [idPrestador, idPlan, idsNomencladores];
      let tenantFilter = '';
      if (tenantId) {
        params.push(tenantId);
        tenantFilter = `AND a.tenant_id = $${params.length}`;
      }

      const result = await query(`
        SELECT
          n.id_nomenclador,
          n.especialidad,
          n.descripcion,
          a.precio,
          a.precio_normal,
          a.precio_diferenciado,
          a.id_acuerdo
        FROM nomencladores n
        JOIN acuerdos_prestador a ON a.id_nomenclador = n.id_nomenclador
        WHERE a.prest_id_prestador = $1
        AND a.plan_id_plan = $2
        AND a.vigente = 'SI'
        AND n.id_nomenclador = ANY($3) ${tenantFilter}
        ORDER BY a.fecha_vigencia DESC
      `, params);

      logger.info('Nomencladores con acuerdo', {
        idPrestador,
        encontrados: result.rows.length
      });

      return result.rows;

    } catch (error) {
      logger.error('Error buscando nomencladores con acuerdo', { error: error.message });
      throw error;
    }
  }

  /**
   * Procesar matching completo de una práctica
   * @param {Object} practica - Práctica extraída por IA
   * @param {number} idPrestador - ID del prestador emisor
   * @param {number} idPlan - ID del plan del cliente
   * @param {string} tenantId - ID del tenant
   * @returns {Promise<Object>} - Resultado del matching
   */
  async procesarMatchingPractica(practica, idPrestador, idPlan = 1, tenantId = null) {
    try {
      const descripcionOriginal = practica.descripcion_original;
      const cantidad = practica.cantidad || 1;

      const matchesNomen = await this.buscarNomencladores(descripcionOriginal, 10, tenantId);

      if (matchesNomen.length === 0) {
        return {
          descripcion_original: descripcionOriginal,
          cantidad: cantidad,
          nomenclador_sugerido: null,
          confianza: 0,
          matches_alternativos: [],
          tiene_acuerdo: false,
          alerta: 'No se encontró nomenclador similar'
        };
      }

      const idsNomencladores = matchesNomen.map(m => m.id_nomenclador);
      const conAcuerdo = await this.buscarNomencladoresConAcuerdo(idPrestador, idsNomencladores, idPlan, tenantId);

      let mejorMatch;
      let tieneAcuerdo = false;
      let precioAcuerdo = null;
      let idAcuerdo = null;

      if (conAcuerdo.length > 0) {
        mejorMatch = matchesNomen.find(m =>
          conAcuerdo.some(ca => ca.id_nomenclador === m.id_nomenclador)
        );

        if (mejorMatch) {
          const acuerdo = conAcuerdo.find(ca => ca.id_nomenclador === mejorMatch.id_nomenclador);
          tieneAcuerdo = true;
          precioAcuerdo = acuerdo.precio;
          idAcuerdo = acuerdo.id_acuerdo;
        }
      }

      if (!mejorMatch) {
        mejorMatch = matchesNomen[0];
      }

      const matchesAlternativos = matchesNomen
        .filter(m => m.id_nomenclador !== mejorMatch.id_nomenclador)
        .slice(0, 5)
        .map(m => ({
          id_nomenclador: m.id_nomenclador,
          descripcion: m.descripcion,
          especialidad: m.especialidad,
          similitud: m.similitud_combinada,
          tiene_acuerdo: conAcuerdo.some(ca => ca.id_nomenclador === m.id_nomenclador)
        }));

      return {
        descripcion_original: descripcionOriginal,
        cantidad: cantidad,
        nomenclador_sugerido: {
          id_nomenclador: mejorMatch.id_nomenclador,
          descripcion: mejorMatch.descripcion,
          especialidad: mejorMatch.especialidad,
          grupo: mejorMatch.grupo,
          subgrupo: mejorMatch.subgrupo
        },
        confianza: mejorMatch.similitud_combinada,
        matches_alternativos: matchesAlternativos,
        tiene_acuerdo: tieneAcuerdo,
        id_acuerdo: idAcuerdo,
        precio_acuerdo: precioAcuerdo,
        alerta: !tieneAcuerdo ? 'No hay acuerdo con el prestador' : null
      };

    } catch (error) {
      logger.error('Error procesando matching de práctica', { error: error.message });
      throw error;
    }
  }
}

module.exports = new MatchingService();
