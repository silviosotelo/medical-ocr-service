const Joi = require('joi');

// Esquema para metadatos
const metadatosSchema = Joi.object({
  tipo_escritura: Joi.string()
    .valid('IMPRESA', 'MANUSCRITA', 'MIXTA')
    .required(),
  legibilidad: Joi.string()
    .valid('ALTA', 'MEDIA', 'BAJA')
    .required(),
  confianza_ia: Joi.number()
    .min(0)
    .max(1)
    .required(),
  advertencias: Joi.array()
    .items(Joi.string())
    .default([]),
  requiere_revision_humana: Joi.boolean()
    .default(false),
  es_urgente: Joi.boolean()
    .default(false),
  confianza_practicas_promedio: Joi.number()
    .min(0)
    .max(1)
    .optional(),
  validado_en: Joi.string()
    .isoDate()
    .optional()
});

// Esquema para datos del médico
const medicoSchema = Joi.object({
  nombre: Joi.string()
    .max(200)
    .allow(null)
    .default(null),
  matricula: Joi.string()
    .max(20)
    .allow(null)
    .default(null),
  especialidad_inferida: Joi.string()
    .max(100)
    .allow(null)
    .default(null)
});

// Esquema para datos del paciente
const pacienteSchema = Joi.object({
  nombre: Joi.string()
    .max(200)
    .allow(null)
    .default(null),
  identificacion: Joi.string()
    .max(50)
    .allow(null)
    .default(null),
  tipo_identificacion: Joi.string()
    .valid('DNI', 'afiliado', 'pasaporte', 'cedula', null)
    .allow(null)
    .default(null)
});

// Esquema para cabecera
const cabeceraSchema = Joi.object({
  medico: medicoSchema.required(),
  paciente: pacienteSchema.required(),
  fecha_emision: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null)
    .default(null),
  diagnostico_presuntivo: Joi.string()
    .max(500)
    .allow(null)
    .default(null),
  institucion_solicitante: Joi.string()
    .max(200)
    .allow(null)
    .default(null)
});

// Esquema para detalle de prácticas
const practicaSchema = Joi.object({
  orden: Joi.number()
    .integer()
    .min(1)
    .required(),
  descripcion: Joi.string()
    .max(500)
    .required(),
  cantidad: Joi.number()
    .integer()
    .min(1)
    .default(1),
  codigo_sugerido: Joi.string()
    .max(20)
    .allow(null)
    .default(null),
  nomenclador: Joi.string()
    .valid('EMER', 'PMO', 'SWISS_MEDICAL', 'OSDE', 'PAMI', 'IOMA', null)
    .allow(null)
    .default(null),
  confianza: Joi.number()
    .min(0)
    .max(1)
    .default(0.8)
});

// Esquema para observaciones
const observacionesSchema = Joi.object({
  texto_completo: Joi.string()
    .max(2000)
    .allow(null)
    .default(null),
  flags_detectados: Joi.array()
    .items(Joi.string())
    .default([])
});

// Esquema principal de respuesta
const responseSchema = Joi.object({
  metadatos: metadatosSchema.required(),
  cabecera: cabeceraSchema.required(),
  detalle_practicas: Joi.array()
    .items(practicaSchema)
    .min(0)
    .default([]),
  observaciones: observacionesSchema.default({})
});

module.exports = responseSchema;
