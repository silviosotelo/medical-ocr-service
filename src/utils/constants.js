module.exports = {
  // Configuración de conversión de PDF
  PDF_CONVERSION: {
    TEMP_DIR: process.env.TEMP_DIR || './temp',
    DPI: 300,
    JPEG_QUALITY: 85,
    TIMEOUT_MS: 30000,
    MAX_BUFFER_SIZE: 10 * 1024 * 1024 // 10MB
  },

  // Configuración de procesamiento de imágenes
  IMAGE_PROCESSING: {
    COMPRESSION_THRESHOLD_BYTES: 5 * 1024 * 1024, // 5MB
    COMPRESSION_QUALITY: 85,
    MAX_WIDTH: 4000,
    MAX_HEIGHT: 4000,
    MIN_WIDTH: 200,
    MIN_HEIGHT: 200
  },

  // Tipos MIME permitidos
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'application/pdf'
  ],

  // Extensiones permitidas
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.pdf'],

  // Tamaño máximo de archivo
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024,

  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30')
  },

  // Configuración de OpenAI
  OPENAI: {
    MODEL: 'gpt-4o',
    MAX_TOKENS: 2000,
    TEMPERATURE: 0.1,
    DETAIL_LEVEL: 'high',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    TIMEOUT_MS: 60000
  },

  // Códigos de error
  ERROR_CODES: {
    NO_FILE: 'NO_FILE',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    PROCESSING_ERROR: 'PROCESSING_ERROR',
    PDF_CONVERSION_ERROR: 'PDF_CONVERSION_ERROR',
    IMAGE_PROCESSING_ERROR: 'IMAGE_PROCESSING_ERROR',
    AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    INVALID_IMAGE: 'INVALID_IMAGE',
    CORRUPTED_FILE: 'CORRUPTED_FILE'
  },

  // Configuración de logging
  LOG_LEVELS: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
  },

  // Tiempo de limpieza de archivos temporales (en minutos)
  TEMP_FILE_CLEANUP_INTERVAL: 60,

  // Nomencladores médicos soportados
  NOMENCLADORES: [
    'EMER',
    'PMO',
    'SWISS_MEDICAL',
    'OSDE',
    'PAMI',
    'IOMA'
  ],

  // Clasificación de tipo de escritura
  WRITING_TYPES: {
    IMPRESA: 'IMPRESA',
    MANUSCRITA: 'MANUSCRITA',
    MIXTA: 'MIXTA'
  },

  // Niveles de legibilidad
  LEGIBILITY_LEVELS: {
    ALTA: 'ALTA',
    MEDIA: 'MEDIA',
    BAJA: 'BAJA'
  },

  // Palabras clave de urgencia
  URGENCY_KEYWORDS: [
    'URGENTE',
    'STAT',
    'inmediato',
    'Ya',
    'EMERGENCIA',
    'CRITICO'
  ],

  // Patrones de matrícula
  MATRICULA_PATTERNS: [
    /M\.?N\.?\s*(\d+)/i,
    /M\.?P\.?\s*(\d+)/i,
    /MAT\.?\s*(\d+)/i,
    /MATRICULA\.?\s*(\d+)/i,
    /MP\s*(\d+)/i,
    /MN\s*(\d+)/i
  ]
};
