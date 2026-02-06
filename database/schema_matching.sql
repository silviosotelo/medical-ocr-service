-- =====================================================================
-- SCHEMA PARA MATCHING DE NOMENCLADORES Y PRESTADORES
-- Sistema de Pre-Visación con IA
-- =====================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================
-- 1. TABLA: PRESTADORES (espejo de Oracle)
-- =====================================================================
DROP TABLE IF EXISTS prestadores CASCADE;

CREATE TABLE prestadores (
    id_prestador INTEGER PRIMARY KEY,
    ruc VARCHAR(20),
    nombre_fantasia VARCHAR(200),
    raz_soc_nombre VARCHAR(200),
    registro_profesional VARCHAR(50),
    ranking DECIMAL(10,2),
    
    -- Para búsqueda fuzzy/vectorial
    nombre_embedding vector(1536),
    nombre_normalizado VARCHAR(200), -- Sin tildes, minúsculas
    
    -- Metadata
    cantidad_acuerdos INTEGER DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsqueda rápida
CREATE INDEX idx_prestadores_ruc ON prestadores(ruc);
CREATE INDEX idx_prestadores_registro ON prestadores(registro_profesional);
CREATE INDEX idx_prestadores_nombre_trgm ON prestadores USING gin(nombre_fantasia gin_trgm_ops);
CREATE INDEX idx_prestadores_nombre_normalizado ON prestadores(nombre_normalizado);
CREATE INDEX idx_prestadores_embedding ON prestadores USING ivfflat (nombre_embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================================
-- 2. TABLA: NOMENCLADORES (espejo de Oracle)
-- =====================================================================
DROP TABLE IF EXISTS nomencladores CASCADE;

CREATE TABLE nomencladores (
    id_nomenclador INTEGER PRIMARY KEY,
    especialidad VARCHAR(200),
    descripcion TEXT,
    
    -- Códigos CIMAP (si existen)
    id_nomenclador2 INTEGER,
    id_servicio INTEGER,
    desc_nomenclador TEXT,
    
    -- Clasificación
    grupo VARCHAR(10), -- Primeros 2 dígitos del código
    subgrupo VARCHAR(10), -- Primeros 4 dígitos del código
    
    -- Para búsqueda semántica
    descripcion_embedding vector(1536),
    descripcion_normalizada TEXT, -- Sin tildes, minúsculas
    
    -- Sinónimos y keywords (para mejorar matching)
    sinonimos TEXT[], -- Agregar manualmente después
    palabras_clave TEXT[],
    
    -- Metadata
    cantidad_acuerdos INTEGER DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsqueda rápida
CREATE INDEX idx_nomencladores_grupo ON nomencladores(grupo);
CREATE INDEX idx_nomencladores_subgrupo ON nomencladores(subgrupo);
CREATE INDEX idx_nomencladores_especialidad ON nomencladores(especialidad);
CREATE INDEX idx_nomencladores_descripcion_trgm ON nomencladores USING gin(descripcion gin_trgm_ops);
CREATE INDEX idx_nomencladores_normalizado ON nomencladores(descripcion_normalizada);
CREATE INDEX idx_nomencladores_embedding ON nomencladores USING ivfflat (descripcion_embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================================
-- 3. TABLA: ACUERDOS PRESTADOR-NOMENCLADOR (espejo de Oracle)
-- =====================================================================
DROP TABLE IF EXISTS acuerdos_prestador CASCADE;

CREATE TABLE acuerdos_prestador (
    id_acuerdo SERIAL PRIMARY KEY,
    
    id_nomenclador INTEGER REFERENCES nomencladores(id_nomenclador),
    prest_id_prestador INTEGER REFERENCES prestadores(id_prestador),
    plan_id_plan INTEGER,
    
    -- Precios
    precio DECIMAL(18,2),
    precio_normal DECIMAL(18,2),
    precio_diferenciado DECIMAL(18,2),
    precio_internado DECIMAL(18,2),
    
    -- Metadata
    vigente VARCHAR(2) DEFAULT 'SI',
    fecha_vigencia DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint único
    UNIQUE(prest_id_prestador, id_nomenclador, plan_id_plan)
);

-- Índices para búsqueda rápida
CREATE INDEX idx_acuerdos_prestador ON acuerdos_prestador(prest_id_prestador);
CREATE INDEX idx_acuerdos_nomenclador ON acuerdos_prestador(id_nomenclador);
CREATE INDEX idx_acuerdos_plan ON acuerdos_prestador(plan_id_plan);
CREATE INDEX idx_acuerdos_vigente ON acuerdos_prestador(vigente);
CREATE INDEX idx_acuerdos_lookup ON acuerdos_prestador(prest_id_prestador, id_nomenclador, vigente);

-- =====================================================================
-- 4. TABLA: PRE-VISACIONES (pendientes de aprobación)
-- =====================================================================
DROP TABLE IF EXISTS visacion_previa CASCADE;

CREATE TABLE visacion_previa (
    id_visacion_previa SERIAL PRIMARY KEY,
    
    -- Link a archivo procesado
    orden_procesada_id INTEGER REFERENCES ordenes_procesadas(id),
    archivo_nombre VARCHAR(255),
    archivo_url TEXT,
    
    -- Datos RAW extraídos por IA
    ci_paciente VARCHAR(20),
    nombre_paciente VARCHAR(200),
    fecha_orden DATE,
    
    -- Prestador emisor
    prestador_id_sugerido INTEGER REFERENCES prestadores(id_prestador),
    prestador_nombre_original TEXT,
    prestador_confianza DECIMAL(3,2),
    
    -- Médico solicitante
    medico_nombre TEXT,
    medico_matricula VARCHAR(20),
    medico_id_prestador INTEGER REFERENCES prestadores(id_prestador),
    
    -- Diagnóstico
    diagnostico_texto TEXT,
    diagnostico_codigo_cie VARCHAR(10),
    diagnostico_id_sugerido INTEGER,
    
    -- Observaciones de IA
    observaciones_ia TEXT,
    alertas_ia JSONB, -- Array de alertas
    
    -- Metadata de procesamiento
    confianza_general DECIMAL(3,2),
    resultado_ia_completo JSONB,
    
    -- Estado
    estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, APROBADA, RECHAZADA, CORREGIDA
    requiere_revision BOOLEAN DEFAULT false,
    
    -- Feedback humano
    aprobada_por VARCHAR(100),
    aprobada_en TIMESTAMP,
    rechazada_por VARCHAR(100),
    rechazada_en TIMESTAMP,
    motivo_rechazo TEXT,
    
    -- Sincronización con Oracle
    id_visacion_oracle INTEGER,
    sincronizado_oracle BOOLEAN DEFAULT false,
    fecha_sincronizacion TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_previsacion_estado ON visacion_previa(estado);
CREATE INDEX idx_previsacion_ci ON visacion_previa(ci_paciente);
CREATE INDEX idx_previsacion_fecha ON visacion_previa(fecha_orden);
CREATE INDEX idx_previsacion_requiere_revision ON visacion_previa(requiere_revision);
CREATE INDEX idx_previsacion_sincronizado ON visacion_previa(sincronizado_oracle);

-- =====================================================================
-- 5. TABLA: DETALLE DE PRE-VISACIONES
-- =====================================================================
DROP TABLE IF EXISTS det_visacion_previa CASCADE;

CREATE TABLE det_visacion_previa (
    id_det_previa SERIAL PRIMARY KEY,
    visacion_previa_id INTEGER REFERENCES visacion_previa(id_visacion_previa) ON DELETE CASCADE,
    
    item INTEGER,
    
    -- Lo que dice la orden (texto original OCR)
    descripcion_original TEXT,
    cantidad DECIMAL(18,2) DEFAULT 1,
    
    -- Matching de IA - NOMENCLADOR
    nomenclador_id_sugerido INTEGER REFERENCES nomencladores(id_nomenclador),
    nomenclador_confianza DECIMAL(3,2),
    nomenclador_descripcion TEXT, -- Cache de la descripción
    
    -- Matches alternativos (top 5)
    matches_alternativos JSONB, -- [{id, descripcion, similitud}, ...]
    
    -- Matching de IA - PRESTADOR EJECUTOR
    prestador_ejecutor_id INTEGER REFERENCES prestadores(id_prestador),
    prestador_ejecutor_nombre TEXT,
    prestador_ejecutor_original TEXT, -- Nombre como aparece en orden
    
    -- Verificación de ACUERDO
    tiene_acuerdo BOOLEAN DEFAULT false,
    id_acuerdo INTEGER REFERENCES acuerdos_prestador(id_acuerdo),
    precio_acuerdo DECIMAL(18,2),
    
    -- Observaciones específicas del item
    observaciones TEXT,
    
    -- Correcciones humanas
    nomenclador_id_corregido INTEGER REFERENCES nomencladores(id_nomenclador),
    prestador_id_corregido INTEGER REFERENCES prestadores(id_prestador),
    cantidad_corregida DECIMAL(18,2),
    observacion_correccion TEXT,
    
    -- Estado
    estado VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, APROBADO, RECHAZADO, CORREGIDO
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint
    UNIQUE(visacion_previa_id, item)
);

-- Índices
CREATE INDEX idx_det_previa_visacion ON det_visacion_previa(visacion_previa_id);
CREATE INDEX idx_det_previa_nomenclador ON det_visacion_previa(nomenclador_id_sugerido);
CREATE INDEX idx_det_previa_prestador ON det_visacion_previa(prestador_ejecutor_id);
CREATE INDEX idx_det_previa_estado ON det_visacion_previa(estado);
CREATE INDEX idx_det_previa_tiene_acuerdo ON det_visacion_previa(tiene_acuerdo);

-- =====================================================================
-- 6. TABLA: FEEDBACK PARA TRAINING
-- =====================================================================
DROP TABLE IF EXISTS feedback_matching CASCADE;

CREATE TABLE feedback_matching (
    id_feedback SERIAL PRIMARY KEY,
    
    visacion_previa_id INTEGER REFERENCES visacion_previa(id_visacion_previa),
    det_previa_id INTEGER REFERENCES det_visacion_previa(id_det_previa),
    
    -- Tipo de feedback
    tipo VARCHAR(50), -- 'nomenclador_correcto', 'nomenclador_incorrecto', 'prestador_correcto', etc.
    
    -- Datos del matching
    descripcion_original TEXT, -- Lo que decía la orden
    id_sugerido_ia INTEGER, -- Lo que sugirió la IA
    id_correcto INTEGER, -- Lo que eligió el humano (si es diferente)
    
    -- Metadata
    razon TEXT, -- Por qué se corrigió
    usuario VARCHAR(100),
    incluir_en_training BOOLEAN DEFAULT true,
    usado_en_training BOOLEAN DEFAULT false,
    fecha_usado_training TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_feedback_tipo ON feedback_matching(tipo);
CREATE INDEX idx_feedback_training ON feedback_matching(incluir_en_training, usado_en_training);
CREATE INDEX idx_feedback_visacion ON feedback_matching(visacion_previa_id);
CREATE INDEX idx_feedback_detalle ON feedback_matching(det_previa_id);

-- =====================================================================
-- 7. FUNCIONES AUXILIARES
-- =====================================================================

-- Función para normalizar texto (quitar tildes, minúsculas)
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

-- Trigger para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prestadores_updated
    BEFORE UPDATE ON prestadores
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trg_nomencladores_updated
    BEFORE UPDATE ON nomencladores
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trg_acuerdos_updated
    BEFORE UPDATE ON acuerdos_prestador
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trg_previsacion_updated
    BEFORE UPDATE ON visacion_previa
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trg_det_previa_updated
    BEFORE UPDATE ON det_visacion_previa
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

-- =====================================================================
-- 8. VISTAS ÚTILES
-- =====================================================================

-- Vista de pre-visaciones pendientes
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

-- Vista de estadísticas de matching
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
-- COMENTARIOS
-- =====================================================================

COMMENT ON TABLE prestadores IS 'Espejo de tabla PRESTADOR de Oracle - para matching con IA';
COMMENT ON TABLE nomencladores IS 'Espejo de tabla NOMENCLADOR de Oracle - para matching semántico';
COMMENT ON TABLE acuerdos_prestador IS 'Espejo de tabla ACUERDO_PRESTADOR de Oracle';
COMMENT ON TABLE visacion_previa IS 'Pre-visaciones generadas por IA pendientes de aprobación';
COMMENT ON TABLE det_visacion_previa IS 'Detalle de prácticas en pre-visaciones';
COMMENT ON TABLE feedback_matching IS 'Feedback para fine-tuning de IA';

COMMENT ON COLUMN nomencladores.descripcion_embedding IS 'Vector embedding (text-embedding-3-small) de la descripción';
COMMENT ON COLUMN prestadores.nombre_embedding IS 'Vector embedding (text-embedding-3-small) del nombre';
COMMENT ON COLUMN det_visacion_previa.matches_alternativos IS 'Top 5 nomencladores alternativos: [{id, descripcion, similitud}]';
