const Joi = require('joi');
const logger = require('../config/logger.config');
const responseSchema = require('../schemas/response.schema');

class ValidationService {
  /**
   * Valida y enriquece la respuesta de la IA
   * @param {Object} data - Datos extraídos por la IA
   * @returns {Promise<Object>} - Datos validados y enriquecidos
   */
  async validate(data) {
    try {
      // Validar contra el esquema Joi
      const { error, value } = responseSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        logger.error('Validation failed', {
          errors: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message
          }))
        });
        throw new Error(`Datos inválidos de IA: ${error.details[0].message}`);
      }

      // Enriquecer datos
      const enrichedData = this.enrichData(value);

      logger.info('Data validated and enriched successfully', {
        hasMatricula: !!enrichedData.cabecera?.medico?.matricula,
        practicasCount: enrichedData.detalle_practicas?.length || 0,
        requiereRevision: enrichedData.metadatos?.requiere_revision_humana
      });

      return enrichedData;

    } catch (error) {
      logger.error('Validation service error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enriquece los datos con información adicional
   * @param {Object} data - Datos validados
   * @returns {Object} - Datos enriquecidos
   */
  enrichData(data) {
    const enriched = { ...data };

    // Normalizar matrícula (solo dígitos)
    if (enriched.cabecera?.medico?.matricula) {
      enriched.cabecera.medico.matricula = 
        enriched.cabecera.medico.matricula.replace(/\D/g, '');
      
      if (enriched.cabecera.medico.matricula.length === 0) {
        enriched.cabecera.medico.matricula = null;
        enriched.metadatos.advertencias.push('Matrícula contenía solo caracteres no numéricos');
      }
    }

    // Normalizar identificación del paciente
    if (enriched.cabecera?.paciente?.identificacion) {
      enriched.cabecera.paciente.identificacion = 
        enriched.cabecera.paciente.identificacion.replace(/\D/g, '');
    }

    // Clasificar tipo de identificación si no fue especificado
    if (enriched.cabecera?.paciente?.identificacion && 
        !enriched.cabecera.paciente.tipo_identificacion) {
      const id = enriched.cabecera.paciente.identificacion;
      if (id.length === 8 || id.length === 7) {
        enriched.cabecera.paciente.tipo_identificacion = 'DNI';
      } else if (id.length > 10) {
        enriched.cabecera.paciente.tipo_identificacion = 'afiliado';
      }
    }

    // Calcular confianza promedio de prácticas
    if (enriched.detalle_practicas && enriched.detalle_practicas.length > 0) {
      const avgConfianza = enriched.detalle_practicas.reduce(
        (sum, p) => sum + (p.confianza || 0), 0
      ) / enriched.detalle_practicas.length;

      enriched.metadatos.confianza_practicas_promedio = 
        Math.round(avgConfianza * 100) / 100;
    }

    // Determinar si requiere revisión humana basado en criterios
    if (!enriched.metadatos.requiere_revision_humana) {
      enriched.metadatos.requiere_revision_humana = this.shouldRequireReview(enriched);
    }

    // Agregar timestamp de validación
    enriched.metadatos.validado_en = new Date().toISOString();

    return enriched;
  }

  /**
   * Determina si el documento requiere revisión humana
   * @param {Object} data - Datos analizados
   * @returns {boolean}
   */
  shouldRequireReview(data) {
    const reasons = [];

    // Legibilidad baja
    if (data.metadatos?.legibilidad === 'BAJA') {
      reasons.push('Legibilidad baja');
    }

    // Confianza de IA baja
    if (data.metadatos?.confianza_ia < 0.7) {
      reasons.push('Confianza de IA baja (<70%)');
    }

    // Sin matrícula
    if (!data.cabecera?.medico?.matricula) {
      reasons.push('Falta matrícula del médico');
    }

    // Prácticas con baja confianza
    if (data.detalle_practicas) {
      const practicasBajaConfianza = data.detalle_practicas.filter(p => p.confianza < 0.7);
      if (practicasBajaConfianza.length > 0) {
        reasons.push(`${practicasBajaConfianza.length} prácticas con baja confianza`);
      }
    }

    // Muchas advertencias
    if (data.metadatos?.advertencias?.length >= 3) {
      reasons.push('Múltiples advertencias detectadas');
    }

    if (reasons.length > 0) {
      logger.info('Document flagged for human review', { reasons });
      if (!data.metadatos.advertencias) {
        data.metadatos.advertencias = [];
      }
      data.metadatos.advertencias.push(`Revisión recomendada: ${reasons.join(', ')}`);
      return true;
    }

    return false;
  }

  /**
   * Valida formato de matrícula
   * @param {string} matricula
   * @returns {boolean}
   */
  isValidMatricula(matricula) {
    if (!matricula) return false;
    const cleaned = matricula.replace(/\D/g, '');
    return cleaned.length >= 4 && cleaned.length <= 8;
  }

  /**
   * Valida formato de fecha
   * @param {string} fecha
   * @returns {boolean}
   */
  isValidDate(fecha) {
    if (!fecha) return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(fecha)) return false;
    const date = new Date(fecha);
    return date instanceof Date && !isNaN(date);
  }
}

module.exports = new ValidationService();
