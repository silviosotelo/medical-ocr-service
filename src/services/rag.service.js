const { query } = require('../config/database.config');
const embeddingService = require('./embedding.service');
const logger = require('../config/logger.config');

class RAGService {
  /**
   * Busca prácticas similares usando búsqueda vectorial
   * @param {string} descripcionPractica - Descripción de la práctica
   * @param {string} nomenclador - Código del nomenclador (opcional)
   * @param {number} limite - Número de resultados
   * @returns {Promise<Array>}
   */
  async buscarPracticasSimilares(descripcionPractica, nomenclador = null, limite = 10) {
    try {
      const startTime = Date.now();

      // Generar embedding de la query
      const queryEmbedding = await embeddingService.generateEmbedding(
        embeddingService.normalizeText(descripcionPractica)
      );

      // Convertir embedding a string para PostgreSQL
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      // Buscar en base de datos
      const sql = `
        SELECT 
          p.id,
          p.codigo,
          p.descripcion,
          p.descripcion_completa,
          p.categoria,
          p.valor_base,
          n.nombre as nomenclador,
          n.codigo as nomenclador_codigo,
          (1 - (p.embedding <=> $1::vector))::DECIMAL(5,4) as similitud
        FROM practicas_medicas p
        JOIN nomencladores n ON p.nomenclador_id = n.id
        WHERE 
          p.activo = true
          AND p.embedding IS NOT NULL
          ${nomenclador ? 'AND n.codigo = $3' : ''}
        ORDER BY p.embedding <=> $1::vector
        LIMIT $2
      `;

      const params = nomenclador 
        ? [embeddingStr, limite, nomenclador]
        : [embeddingStr, limite];

      const result = await query(sql, params);

      const processingTime = Date.now() - startTime;

      logger.info('RAG search completed', {
        query: descripcionPractica.substring(0, 50),
        resultsCount: result.rows.length,
        topSimilarity: result.rows[0]?.similitud,
        processingTimeMs: processingTime
      });

      return result.rows;

    } catch (error) {
      logger.error('RAG search failed', {
        error: error.message,
        descripcion: descripcionPractica
      });
      throw error;
    }
  }

  /**
   * Busca múltiples prácticas en batch
   * @param {Array<string>} descripciones
   * @param {string} nomenclador
   * @returns {Promise<Array>}
   */
  async buscarPracticasBatch(descripciones, nomenclador = null) {
    try {
      const resultados = await Promise.all(
        descripciones.map(desc => 
          this.buscarPracticasSimilares(desc, nomenclador, 5)
        )
      );

      return resultados;

    } catch (error) {
      logger.error('Batch RAG search failed', {
        error: error.message,
        count: descripciones.length
      });
      throw error;
    }
  }

  /**
   * Enriquece resultado de IA con matches de base de datos
   * @param {Object} resultadoIA - Resultado del análisis de IA
   * @returns {Promise<Object>} - Resultado enriquecido
   */
  async enriquecerResultado(resultadoIA) {
    try {
      if (!resultadoIA.detalle_practicas || resultadoIA.detalle_practicas.length === 0) {
        return resultadoIA;
      }

      const practicasEnriquecidas = await Promise.all(
        resultadoIA.detalle_practicas.map(async (practica) => {
          // Buscar matches en DB
          const matches = await this.buscarPracticasSimilares(
            practica.descripcion,
            practica.nomenclador,
            3
          );

          const mejorMatch = matches[0];

          return {
            ...practica,
            // Agregar información de la base de datos
            codigo_sugerido_db: mejorMatch?.codigo || practica.codigo_sugerido,
            descripcion_estandar: mejorMatch?.descripcion,
            similitud_match: mejorMatch?.similitud,
            matches_alternativos: matches.slice(1, 3).map(m => ({
              codigo: m.codigo,
              descripcion: m.descripcion,
              similitud: m.similitud
            })),
            // Si la similitud es muy alta, usar el código de DB
            confianza_final: mejorMatch && mejorMatch.similitud > 0.85
              ? Math.max(practica.confianza, parseFloat(mejorMatch.similitud))
              : practica.confianza,
            fuente: mejorMatch && mejorMatch.similitud > 0.85 ? 'db_match' : 'ia_inference'
          };
        })
      );

      return {
        ...resultadoIA,
        detalle_practicas: practicasEnriquecidas,
        metadatos: {
          ...resultadoIA.metadatos,
          rag_aplicado: true,
          practicas_enriquecidas: practicasEnriquecidas.length
        }
      };

    } catch (error) {
      logger.error('Failed to enrich result', {
        error: error.message
      });
      // Si falla, devolver resultado original
      return resultadoIA;
    }
  }

  /**
   * Busca médico por nombre usando similitud vectorial
   * @param {string} nombre
   * @returns {Promise<Array>}
   */
  async buscarMedicoPorNombre(nombre) {
    try {
      const nombreNormalizado = embeddingService.normalizeText(nombre);
      const embedding = await embeddingService.generateEmbedding(nombreNormalizado);
      const embeddingStr = `[${embedding.join(',')}]`;

      const sql = `
        SELECT 
          m.id,
          m.nombre,
          m.apellido,
          m.matricula_nacional,
          m.matricula_provincial,
          m.especialidad,
          (1 - (m.nombre_completo_embedding <=> $1::vector))::DECIMAL(5,4) as similitud
        FROM medicos m
        WHERE 
          m.activo = true
          AND m.nombre_completo_embedding IS NOT NULL
        ORDER BY m.nombre_completo_embedding <=> $1::vector
        LIMIT 10
      `;

      const result = await query(sql, [embeddingStr]);

      logger.info('Doctor search completed', {
        query: nombre,
        resultsCount: result.rows.length,
        topSimilarity: result.rows[0]?.similitud
      });

      return result.rows;

    } catch (error) {
      logger.error('Doctor search failed', {
        error: error.message,
        nombre
      });
      throw error;
    }
  }

  /**
   * Genera contexto aumentado para el prompt de IA
   * @param {Array<string>} practicasDetectadas
   * @returns {Promise<string>}
   */
  async generarContextoAumentado(practicasDetectadas) {
    try {
      if (!practicasDetectadas || practicasDetectadas.length === 0) {
        return '';
      }

      // Buscar prácticas similares para cada una detectada
      const todosLosMatches = [];
      for (const practica of practicasDetectadas) {
        const matches = await this.buscarPracticasSimilares(practica, null, 3);
        todosLosMatches.push(...matches);
      }

      // Eliminar duplicados
      const matchesUnicos = Array.from(
        new Map(todosLosMatches.map(m => [m.codigo, m])).values()
      );

      // Generar contexto
      const contexto = `
PRÁCTICAS CONOCIDAS EN BASE DE DATOS (usar como referencia):

${matchesUnicos.map((m, i) => `
${i + 1}. Código: ${m.codigo}
   Descripción: ${m.descripcion}
   Nomenclador: ${m.nomenclador}
   ${m.categoria ? `Categoría: ${m.categoria}` : ''}
`).join('\n')}

INSTRUCCIÓN: Si detectas prácticas similares a las de arriba, usa preferentemente esos códigos.
`;

      return contexto;

    } catch (error) {
      logger.error('Failed to generate augmented context', {
        error: error.message
      });
      return '';
    }
  }
}

module.exports = new RAGService();
