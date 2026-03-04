const { query } = require('../config/database.config');
const embeddingService = require('./embedding.service');
const logger = require('../config/logger.config');

class RAGService {
  async buscarNomencladoresSimilares(descripcionPractica, limite = 5) {
    try {
      const startTime = Date.now();
      const normalizedText = embeddingService.normalizeText(descripcionPractica);
      const queryEmbedding = await embeddingService.generateEmbedding(normalizedText);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const result = await query(`
        SELECT
          n.id_nomenclador,
          n.especialidad,
          n.descripcion,
          n.grupo,
          n.subgrupo,
          (1 - (n.descripcion_embedding <=> $1::vector))::DECIMAL(5,4) as similitud
        FROM nomencladores n
        WHERE n.estado = 'ACTIVO'
          AND n.descripcion_embedding IS NOT NULL
        ORDER BY n.descripcion_embedding <=> $1::vector
        LIMIT $2
      `, [embeddingStr, limite]);

      const processingTime = Date.now() - startTime;

      logger.debug('RAG nomenclador search', {
        query: descripcionPractica.substring(0, 50),
        results: result.rows.length,
        topSimilarity: result.rows[0]?.similitud,
        processingTimeMs: processingTime
      });

      return result.rows;

    } catch (error) {
      logger.error('RAG nomenclador search failed', {
        error: error.message,
        descripcion: descripcionPractica
      });
      return [];
    }
  }

  async generarContextoAumentado(practicasDetectadas) {
    try {
      if (!practicasDetectadas || practicasDetectadas.length === 0) {
        return '';
      }

      const descripciones = practicasDetectadas
        .map(p => typeof p === 'string' ? p : p.descripcion)
        .filter(Boolean);

      if (descripciones.length === 0) return '';

      const todosLosMatches = [];
      for (const descripcion of descripciones) {
        const matches = await this.buscarNomencladoresSimilares(descripcion, 3);
        todosLosMatches.push(...matches);
      }

      const matchesUnicos = Array.from(
        new Map(todosLosMatches.map(m => [m.id_nomenclador, m])).values()
      );

      if (matchesUnicos.length === 0) return '';

      const contexto = matchesUnicos.map((m, i) =>
        `${i + 1}. [${m.id_nomenclador}] ${m.descripcion} (${m.especialidad || 'General'}) - Grupo: ${m.grupo || 'N/A'}`
      ).join('\n');

      return contexto;

    } catch (error) {
      logger.error('Failed to generate augmented context', {
        error: error.message
      });
      return '';
    }
  }

  async enriquecerConNomenclador(practicas) {
    try {
      if (!practicas || practicas.length === 0) return practicas;

      const enriquecidas = [];

      for (const practica of practicas) {
        const matches = await this.buscarNomencladoresSimilares(
          practica.descripcion || practica.descripcion_original,
          3
        );

        const mejorMatch = matches[0];

        enriquecidas.push({
          ...practica,
          nomenclador_rag: mejorMatch ? {
            id_nomenclador: mejorMatch.id_nomenclador,
            descripcion: mejorMatch.descripcion,
            especialidad: mejorMatch.especialidad,
            similitud: parseFloat(mejorMatch.similitud)
          } : null,
          alternativas_rag: matches.slice(1).map(m => ({
            id_nomenclador: m.id_nomenclador,
            descripcion: m.descripcion,
            similitud: parseFloat(m.similitud)
          }))
        });
      }

      return enriquecidas;

    } catch (error) {
      logger.error('Failed to enrich with nomenclador', { error: error.message });
      return practicas;
    }
  }

  /**
   * Genera un contexto general con prestadores y nomencladores del tenant
   * para enriquecer los prompts de OpenAI antes de procesar una imagen.
   * @param {string|null} tenantId
   * @returns {Promise<string>}
   */
  async generarContextoGeneral(tenantId = null) {
    try {
      const tenantFilter = tenantId ? 'AND tenant_id = $1' : '';
      const tenantParam = tenantId ? [tenantId] : [];

      const [nomResult, prestResult] = await Promise.all([
        query(
          `SELECT id_externo, descripcion, especialidad
           FROM nomencladores
           WHERE estado = 'ACTIVO' ${tenantFilter}
             AND descripcion_embedding IS NOT NULL
           ORDER BY COALESCE(cantidad_acuerdos, 0) DESC
           LIMIT 60`,
          tenantParam
        ),
        query(
          `SELECT id_externo, nombre_fantasia, ruc, registro_profesional, tipo
           FROM prestadores
           WHERE estado = 'ACTIVO' ${tenantFilter}
             AND nombre_embedding IS NOT NULL
           ORDER BY COALESCE(cantidad_acuerdos, 0) DESC
           LIMIT 25`,
          tenantParam
        ),
      ]);

      let ctx = '';

      if (prestResult.rows.length > 0) {
        ctx += `### PRESTADORES REGISTRADOS EN EL SISTEMA\n`;
        for (const p of prestResult.rows) {
          ctx += `- [${p.id_externo}] ${p.nombre_fantasia}`;
          if (p.ruc) ctx += ` | RUC: ${p.ruc}`;
          if (p.registro_profesional) ctx += ` | Mat: ${p.registro_profesional}`;
          ctx += `\n`;
        }
        ctx += '\n';
      }

      if (nomResult.rows.length > 0) {
        ctx += `### NOMENCLADORES DISPONIBLES (ordenados por frecuencia)\n`;
        const byEsp = {};
        for (const n of nomResult.rows) {
          const esp = n.especialidad || 'GENERAL';
          if (!byEsp[esp]) byEsp[esp] = [];
          byEsp[esp].push(n);
        }
        for (const [esp, noms] of Object.entries(byEsp)) {
          ctx += `**${esp}:** `;
          ctx += noms.map(n => `[${n.id_externo}] ${n.descripcion}`).join(' | ');
          ctx += '\n';
        }
      }

      return ctx;
    } catch (error) {
      logger.error('Failed to generate general RAG context', { error: error.message });
      return '';
    }
  }

  async buscarPrestadorSimilar(nombre, limite = 3) {
    try {
      if (!nombre) return [];

      const normalizedText = embeddingService.normalizeText(nombre);
      const queryEmbedding = await embeddingService.generateEmbedding(normalizedText);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const result = await query(`
        SELECT
          p.id_prestador,
          p.nombre_fantasia,
          p.raz_soc_nombre,
          p.ruc,
          p.registro_profesional,
          (1 - (p.nombre_embedding <=> $1::vector))::DECIMAL(5,4) as similitud
        FROM prestadores p
        WHERE p.estado = 'ACTIVO'
          AND p.nombre_embedding IS NOT NULL
        ORDER BY p.nombre_embedding <=> $1::vector
        LIMIT $2
      `, [embeddingStr, limite]);

      return result.rows;

    } catch (error) {
      logger.error('RAG prestador search failed', {
        error: error.message,
        nombre
      });
      return [];
    }
  }
}

module.exports = new RAGService();
