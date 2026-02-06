-- =====================================================================
-- SCHEMA CONSOLIDADO: Sistema de Pre-Visación con IA
-- PostgreSQL 15+ con pgvector y pg_trgm
-- =====================================================================
--
-- Este schema unifica:
--   - Tablas de matching (prestadores, nomencladores, acuerdos)
--   - Tablas de pre-visación (cabecera, detalle, feedback)
--   - Tablas de training/fine-tuning (órdenes procesadas, datasets, jobs)
--   - Métricas de precisión
--
-- IMPORTANTE:
--   - Usa CREATE TABLE IF NOT EXISTS (seguro para re-ejecución)
--   - Los índices IVFFlat se deben crear DESPUÉS de cargar datos
--     (requieren mínimo rows >= lists * 30)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================
-- 1. TABLA: PRESTADORES (espejo de Oracle)
-- =====================================================================

CREATE TABLE IF NOT EXISTS prestadores (
    id_prestador INTEGER PRIMARY KEY,
    ruc VARCHAR(20),
    nombre_fantasia VARCHAR(200),
    raz_soc_nombre VARCHAR(200),
    registro_profesional VARCHAR(50),
    ranking DECIMAL(10,2),

    nombre_embedding vector(1536),
    nombre_normalizado VARCHAR(200),

    cantidad_acuerdos INTEGER DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'ACTIVO',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prestadores_ruc ON prestadores(ruc);
CREATE INDEX IF NOT EXISTS idx_prestadores_registro ON prestadores(registro_profesional);
CREATE INDEX IF NOT EXISTS idx_prestadores_nombre_trgm ON prestadores USING gin(nombre_fantasia gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_prestadores_nombre_normalizado ON prestadores(nombre_normalizado);

-- =====================================================================
-- 2. TABLA: NOMENCLADORES (espejo de Oracle)
-- =====================================================================

CREATE TABLE IF NOT EXISTS nomencladores (
    id_nomenclador INTEGER PRIMARY KEY,
    especialidad VARCHAR(200),
    descripcion TEXT,

    id_nomenclador2 INTEGER,
    id_servicio INTEGER,
    desc_nomenclador TEXT,

    grupo VARCHAR(10),
    subgrupo VARCHAR(10),

    descripcion_embedding vector(1536),
    descripcion_normalizada TEXT,

    sinonimos TEXT[],
    palabras_clave TEXT[],

    cantidad_acuerdos INTEGER DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'ACTIVO',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nomencladores_grupo ON nomencladores(grupo);
CREATE INDEX IF NOT EXISTS idx_nomencladores_subgrupo ON nomencladores(subgrupo);
CREATE INDEX IF NOT EXISTS idx_nomencladores_especialidad ON nomencladores(especialidad);
CREATE INDEX IF NOT EXISTS idx_nomencladores_descripcion_trgm ON nomencladores USING gin(descripcion gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nomencladores_normalizado ON nomencladores(descripcion_normalizada);

-- =====================================================================
-- 3. TABLA: ACUERDOS PRESTADOR-NOMENCLADOR (espejo de Oracle)
-- =====================================================================

CREATE TABLE IF NOT EXISTS acuerdos_prestador (
    id_acuerdo SERIAL PRIMARY KEY,

    id_nomenclador INTEGER REFERENCES nomencladores(id_nomenclador),
    prest_id_prestador INTEGER REFERENCES prestadores(id_prestador),
    plan_id_plan INTEGER,

    precio DECIMAL(18,2),
    precio_normal DECIMAL(18,2),
    precio_diferenciado DECIMAL(18,2),
    precio_internado DECIMAL(18,2),

    vigente VARCHAR(2) DEFAULT 'SI',
    fecha_vigencia DATE DEFAULT CURRENT_DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acuerdos_prestador_prest_id_prestador_id_nomenclador_plan_key'
  ) THEN
    ALTER TABLE acuerdos_prestador
      ADD CONSTRAINT acuerdos_prestador_prest_id_prestador_id_nomenclador_plan_key
      UNIQUE(prest_id_prestador, id_nomenclador, plan_id_plan);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acuerdos_prestador ON acuerdos_prestador(prest_id_prestador);
CREATE INDEX IF NOT EXISTS idx_acuerdos_nomenclador ON acuerdos_prestador(id_nomenclador);
CREATE INDEX IF NOT EXISTS idx_acuerdos_plan ON acuerdos_prestador(plan_id_plan);
CREATE INDEX IF NOT EXISTS idx_acuerdos_vigente ON acuerdos_prestador(vigente);
CREATE INDEX IF NOT EXISTS idx_acuerdos_lookup ON acuerdos_prestador(prest_id_prestador, id_nomenclador, vigente);

-- =====================================================================
-- 4. TABLA: ÓRDENES PROCESADAS (para training y feedback)
-- =====================================================================

CREATE TABLE IF NOT EXISTS ordenes_procesadas (
    id SERIAL PRIMARY KEY,

    archivo_nombre VARCHAR(255),
    archivo_hash VARCHAR(64) UNIQUE,
    archivo_tipo VARCHAR(50),
    archivo_url TEXT,

    resultado_ia JSONB NOT NULL,

    modelo_usado VARCHAR(100),
    tokens_usados INTEGER,
    tiempo_procesamiento_ms INTEGER,
    confianza_promedio DECIMAL(3,2),

    validado BOOLEAN DEFAULT false,
    validado_por VARCHAR(100),
    validado_en TIMESTAMP,

    correccion_humana JSONB,
    requiere_correccion BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ordenes_archivo_hash ON ordenes_procesadas(archivo_hash);
CREATE INDEX IF NOT EXISTS idx_ordenes_validado ON ordenes_procesadas(validado);
CREATE INDEX IF NOT EXISTS idx_ordenes_created_at ON ordenes_procesadas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ordenes_resultado_gin ON ordenes_procesadas USING gin(resultado_ia);

-- =====================================================================
-- 5. TABLA: FEEDBACK / CORRECCIONES (para fine-tuning general)
-- =====================================================================

CREATE TABLE IF NOT EXISTS feedback_correcciones (
    id SERIAL PRIMARY KEY,
    orden_procesada_id INTEGER REFERENCES ordenes_procesadas(id),

    tipo VARCHAR(50),
    campo_corregido VARCHAR(100),

    valor_ia TEXT,
    valor_correcto TEXT,

    razon_correccion TEXT,
    usuario_correccion VARCHAR(100),

    incluir_en_training BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_corr_orden ON feedback_correcciones(orden_procesada_id);
CREATE INDEX IF NOT EXISTS idx_feedback_corr_tipo ON feedback_correcciones(tipo);
CREATE INDEX IF NOT EXISTS idx_feedback_corr_training ON feedback_correcciones(incluir_en_training);

-- =====================================================================
-- 6. TABLA: PRE-VISACIONES (pendientes de aprobación)
-- =====================================================================

CREATE TABLE IF NOT EXISTS visacion_previa (
    id_visacion_previa SERIAL PRIMARY KEY,

    orden_procesada_id INTEGER REFERENCES ordenes_procesadas(id),
    archivo_nombre VARCHAR(255),
    archivo_url TEXT,

    ci_paciente VARCHAR(20),
    nombre_paciente VARCHAR(200),
    fecha_orden DATE,

    prestador_id_sugerido INTEGER REFERENCES prestadores(id_prestador),
    prestador_nombre_original TEXT,
    prestador_confianza DECIMAL(3,2),

    medico_nombre TEXT,
    medico_matricula VARCHAR(20),
    medico_id_prestador INTEGER REFERENCES prestadores(id_prestador),

    diagnostico_texto TEXT,
    diagnostico_codigo_cie VARCHAR(10),
    diagnostico_id_sugerido INTEGER,

    observaciones_ia TEXT,
    alertas_ia JSONB,

    confianza_general DECIMAL(3,2),
    resultado_ia_completo JSONB,

    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    requiere_revision BOOLEAN DEFAULT false,

    aprobada_por VARCHAR(100),
    aprobada_en TIMESTAMP,
    rechazada_por VARCHAR(100),
    rechazada_en TIMESTAMP,
    motivo_rechazo TEXT,

    id_visacion_oracle INTEGER,
    sincronizado_oracle BOOLEAN DEFAULT false,
    fecha_sincronizacion TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_previsacion_estado ON visacion_previa(estado);
CREATE INDEX IF NOT EXISTS idx_previsacion_ci ON visacion_previa(ci_paciente);
CREATE INDEX IF NOT EXISTS idx_previsacion_fecha ON visacion_previa(fecha_orden);
CREATE INDEX IF NOT EXISTS idx_previsacion_requiere_revision ON visacion_previa(requiere_revision);
CREATE INDEX IF NOT EXISTS idx_previsacion_sincronizado ON visacion_previa(sincronizado_oracle);

-- =====================================================================
-- 7. TABLA: DETALLE DE PRE-VISACIONES
-- =====================================================================

CREATE TABLE IF NOT EXISTS det_visacion_previa (
    id_det_previa SERIAL PRIMARY KEY,
    visacion_previa_id INTEGER REFERENCES visacion_previa(id_visacion_previa) ON DELETE CASCADE,

    item INTEGER,

    descripcion_original TEXT,
    cantidad DECIMAL(18,2) DEFAULT 1,

    nomenclador_id_sugerido INTEGER REFERENCES nomencladores(id_nomenclador),
    nomenclador_confianza DECIMAL(3,2),
    nomenclador_descripcion TEXT,

    matches_alternativos JSONB,

    prestador_ejecutor_id INTEGER REFERENCES prestadores(id_prestador),
    prestador_ejecutor_nombre TEXT,
    prestador_ejecutor_original TEXT,

    tiene_acuerdo BOOLEAN DEFAULT false,
    id_acuerdo INTEGER REFERENCES acuerdos_prestador(id_acuerdo),
    precio_acuerdo DECIMAL(18,2),

    observaciones TEXT,

    nomenclador_id_corregido INTEGER REFERENCES nomencladores(id_nomenclador),
    prestador_id_corregido INTEGER REFERENCES prestadores(id_prestador),
    cantidad_corregida DECIMAL(18,2),
    observacion_correccion TEXT,

    estado VARCHAR(20) DEFAULT 'PENDIENTE',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'det_visacion_previa_visacion_previa_id_item_key'
  ) THEN
    ALTER TABLE det_visacion_previa
      ADD CONSTRAINT det_visacion_previa_visacion_previa_id_item_key
      UNIQUE(visacion_previa_id, item);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_det_previa_visacion ON det_visacion_previa(visacion_previa_id);
CREATE INDEX IF NOT EXISTS idx_det_previa_nomenclador ON det_visacion_previa(nomenclador_id_sugerido);
CREATE INDEX IF NOT EXISTS idx_det_previa_prestador ON det_visacion_previa(prestador_ejecutor_id);
CREATE INDEX IF NOT EXISTS idx_det_previa_estado ON det_visacion_previa(estado);
CREATE INDEX IF NOT EXISTS idx_det_previa_tiene_acuerdo ON det_visacion_previa(tiene_acuerdo);

-- =====================================================================
-- 8. TABLA: FEEDBACK DE MATCHING (para fine-tuning de IA)
-- =====================================================================

CREATE TABLE IF NOT EXISTS feedback_matching (
    id_feedback SERIAL PRIMARY KEY,

    visacion_previa_id INTEGER REFERENCES visacion_previa(id_visacion_previa),
    det_previa_id INTEGER REFERENCES det_visacion_previa(id_det_previa),

    tipo VARCHAR(50),

    descripcion_original TEXT,
    id_sugerido_ia INTEGER,
    id_correcto INTEGER,

    razon TEXT,
    usuario VARCHAR(100),
    incluir_en_training BOOLEAN DEFAULT true,
    usado_en_training BOOLEAN DEFAULT false,
    fecha_usado_training TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_match_tipo ON feedback_matching(tipo);
CREATE INDEX IF NOT EXISTS idx_feedback_match_training ON feedback_matching(incluir_en_training, usado_en_training);
CREATE INDEX IF NOT EXISTS idx_feedback_match_visacion ON feedback_matching(visacion_previa_id);
CREATE INDEX IF NOT EXISTS idx_feedback_match_detalle ON feedback_matching(det_previa_id);

-- =====================================================================
-- 9. TABLAS: TRAINING Y FINE-TUNING
-- =====================================================================

CREATE TABLE IF NOT EXISTS training_datasets (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,

    total_ejemplos INTEGER DEFAULT 0,
    ejemplos_validados INTEGER DEFAULT 0,
    fecha_generacion TIMESTAMP,

    archivo_jsonl_url TEXT,
    archivo_size_bytes BIGINT,

    openai_file_id VARCHAR(100),

    estado VARCHAR(50) DEFAULT 'pending',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finetune_jobs (
    id SERIAL PRIMARY KEY,
    training_dataset_id INTEGER REFERENCES training_datasets(id),

    openai_job_id VARCHAR(100) UNIQUE,
    modelo_base VARCHAR(100),
    modelo_resultante VARCHAR(200),

    n_epochs INTEGER DEFAULT 3,
    batch_size INTEGER DEFAULT 4,
    learning_rate_multiplier DECIMAL(5,4),

    estado VARCHAR(50),
    progreso INTEGER DEFAULT 0,

    trained_tokens INTEGER,
    costo_usd DECIMAL(10,4),
    error_message TEXT,

    iniciado_en TIMESTAMP,
    completado_en TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finetune_estado ON finetune_jobs(estado);
CREATE INDEX IF NOT EXISTS idx_finetune_dataset ON finetune_jobs(training_dataset_id);

-- =====================================================================
-- 10. TABLA: MÉTRICAS DE PRECISIÓN
-- =====================================================================

CREATE TABLE IF NOT EXISTS metricas_precision (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    modelo VARCHAR(100),

    total_procesados INTEGER,
    total_validados INTEGER,
    tasa_acierto DECIMAL(5,2),

    precision_matricula DECIMAL(5,2),
    precision_practicas DECIMAL(5,2),
    precision_diagnostico DECIMAL(5,2),
    precision_paciente DECIMAL(5,2),

    confianza_promedio DECIMAL(3,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'metricas_precision_fecha_modelo_key'
  ) THEN
    ALTER TABLE metricas_precision
      ADD CONSTRAINT metricas_precision_fecha_modelo_key
      UNIQUE(fecha, modelo);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_metricas_fecha ON metricas_precision(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_metricas_modelo ON metricas_precision(modelo);

-- =====================================================================
-- 11. FUNCIONES AUXILIARES
-- =====================================================================

CREATE OR REPLACE FUNCTION normalizar_texto(texto TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        translate(texto,
            'ÁÉÍÓÚáéíóúÑñÄËÏÖÜäëïöü',
            'AEIOUaeiouNnAEIOUaeiou'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prestadores_updated'
  ) THEN
    CREATE TRIGGER trg_prestadores_updated
      BEFORE UPDATE ON prestadores
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nomencladores_updated'
  ) THEN
    CREATE TRIGGER trg_nomencladores_updated
      BEFORE UPDATE ON nomencladores
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_acuerdos_updated'
  ) THEN
    CREATE TRIGGER trg_acuerdos_updated
      BEFORE UPDATE ON acuerdos_prestador
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_previsacion_updated'
  ) THEN
    CREATE TRIGGER trg_previsacion_updated
      BEFORE UPDATE ON visacion_previa
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_det_previa_updated'
  ) THEN
    CREATE TRIGGER trg_det_previa_updated
      BEFORE UPDATE ON det_visacion_previa
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

-- =====================================================================
-- 12. VISTAS
-- =====================================================================

CREATE OR REPLACE VIEW v_previsaciones_pendientes AS
SELECT
    vp.id_visacion_previa,
    vp.ci_paciente,
    vp.nombre_paciente,
    vp.fecha_orden,
    vp.prestador_nombre_original,
    p.nombre_fantasia as prestador_encontrado,
    vp.confianza_general,
    vp.requiere_revision,
    COUNT(dvp.id_det_previa) as cantidad_items,
    AVG(dvp.nomenclador_confianza) as confianza_promedio_items,
    SUM(CASE WHEN dvp.tiene_acuerdo THEN 1 ELSE 0 END) as items_con_acuerdo,
    vp.created_at
FROM visacion_previa vp
LEFT JOIN prestadores p ON p.id_prestador = vp.prestador_id_sugerido
LEFT JOIN det_visacion_previa dvp ON dvp.visacion_previa_id = vp.id_visacion_previa
WHERE vp.estado = 'PENDIENTE'
GROUP BY vp.id_visacion_previa, p.nombre_fantasia
ORDER BY vp.created_at DESC;

CREATE OR REPLACE VIEW v_previsaciones_para_apex AS
SELECT
    vp.id_visacion_previa,
    vp.ci_paciente,
    vp.nombre_paciente,
    vp.fecha_orden,
    vp.prestador_id_sugerido,
    vp.prestador_nombre_original,
    p.nombre_fantasia as prestador_nombre,
    p.ruc as prestador_ruc,
    vp.medico_nombre,
    vp.medico_matricula,
    vp.diagnostico_texto,
    vp.diagnostico_codigo_cie,
    vp.confianza_general,
    vp.estado,
    vp.aprobada_por,
    vp.aprobada_en,
    vp.sincronizado_oracle,
    vp.id_visacion_oracle,
    vp.created_at,
    COUNT(dvp.id_det_previa) as total_items,
    SUM(CASE WHEN dvp.tiene_acuerdo THEN 1 ELSE 0 END) as items_con_acuerdo,
    SUM(dvp.precio_acuerdo * dvp.cantidad) as monto_estimado
FROM visacion_previa vp
LEFT JOIN prestadores p ON p.id_prestador = vp.prestador_id_sugerido
LEFT JOIN det_visacion_previa dvp ON dvp.visacion_previa_id = vp.id_visacion_previa
GROUP BY vp.id_visacion_previa, p.nombre_fantasia, p.ruc
ORDER BY vp.created_at DESC;

CREATE OR REPLACE VIEW v_estadisticas_matching AS
SELECT
    COUNT(DISTINCT vp.id_visacion_previa) as total_previsaciones,
    COUNT(DISTINCT CASE WHEN vp.estado = 'PENDIENTE' THEN vp.id_visacion_previa END) as pendientes,
    COUNT(DISTINCT CASE WHEN vp.estado = 'APROBADA' THEN vp.id_visacion_previa END) as aprobadas,
    COUNT(DISTINCT CASE WHEN vp.estado = 'RECHAZADA' THEN vp.id_visacion_previa END) as rechazadas,
    AVG(vp.confianza_general) as confianza_promedio,
    COUNT(DISTINCT CASE WHEN vp.requiere_revision THEN vp.id_visacion_previa END) as requieren_revision,
    COUNT(dvp.id_det_previa) as total_items,
    AVG(dvp.nomenclador_confianza) as confianza_items_promedio,
    SUM(CASE WHEN dvp.tiene_acuerdo THEN 1 ELSE 0 END) as items_con_acuerdo,
    COUNT(fm.id_feedback) as total_correcciones
FROM visacion_previa vp
LEFT JOIN det_visacion_previa dvp ON dvp.visacion_previa_id = vp.id_visacion_previa
LEFT JOIN feedback_matching fm ON fm.visacion_previa_id = vp.id_visacion_previa;

-- =====================================================================
-- 13. COMENTARIOS
-- =====================================================================

COMMENT ON TABLE prestadores IS 'Espejo de tabla PRESTADOR de Oracle - matching con IA';
COMMENT ON TABLE nomencladores IS 'Espejo de tabla NOMENCLADOR de Oracle - matching semantico';
COMMENT ON TABLE acuerdos_prestador IS 'Espejo de tabla ACUERDO_PRESTADOR de Oracle';
COMMENT ON TABLE ordenes_procesadas IS 'Historico de ordenes procesadas - training y analytics';
COMMENT ON TABLE feedback_correcciones IS 'Correcciones humanas generales para fine-tuning';
COMMENT ON TABLE visacion_previa IS 'Pre-visaciones generadas por IA pendientes de aprobacion';
COMMENT ON TABLE det_visacion_previa IS 'Detalle de practicas en pre-visaciones';
COMMENT ON TABLE feedback_matching IS 'Feedback de matching para fine-tuning de IA';
COMMENT ON TABLE training_datasets IS 'Datasets generados para fine-tuning en OpenAI';
COMMENT ON TABLE finetune_jobs IS 'Jobs de fine-tuning ejecutados en OpenAI';
COMMENT ON TABLE metricas_precision IS 'Metricas diarias de precision del modelo';

COMMENT ON COLUMN nomencladores.descripcion_embedding IS 'Vector embedding (text-embedding-3-small, 1536 dims)';
COMMENT ON COLUMN prestadores.nombre_embedding IS 'Vector embedding (text-embedding-3-small, 1536 dims)';
COMMENT ON COLUMN det_visacion_previa.matches_alternativos IS 'Top 5 nomencladores alternativos: [{id, descripcion, similitud}]';

-- =====================================================================
-- ÍNDICES VECTORIALES (IVFFlat)
-- =====================================================================
-- NOTA: Ejecutar DESPUÉS de cargar datos.
-- IVFFlat requiere min rows >= lists * 30.
-- Para datasets pequeños, usar lists = 10 o menor.
--
-- CREATE INDEX idx_prestadores_embedding ON prestadores
--   USING ivfflat (nombre_embedding vector_cosine_ops) WITH (lists = 100);
--
-- CREATE INDEX idx_nomencladores_embedding ON nomencladores
--   USING ivfflat (descripcion_embedding vector_cosine_ops) WITH (lists = 100);
-- =====================================================================
