-- ============================================
-- MEDICAL OCR DATABASE SCHEMA
-- PostgreSQL 12+ con pgvector extension
-- ============================================

-- Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 1. NOMENCLADORES Y PRÁCTICAS MÉDICAS
-- ============================================

-- Tabla de nomencladores
CREATE TABLE nomencladores (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para nomencladores
CREATE INDEX idx_nomencladores_codigo ON nomencladores(codigo);
CREATE INDEX idx_nomencladores_nombre ON nomencladores USING gin(nombre gin_trgm_ops);

-- Insertar nomencladores principales
INSERT INTO nomencladores (codigo, nombre, descripcion) VALUES
('EMER', 'EMER', 'Nomenclador Nacional'),
('PMO', 'PMO', 'Programa Médico Obligatorio'),
('SWISS_MEDICAL', 'Swiss Medical', 'Nomenclador Swiss Medical'),
('OSDE', 'OSDE', 'Nomenclador OSDE'),
('PAMI', 'PAMI', 'Instituto Nacional de Servicios Sociales para Jubilados'),
('IOMA', 'IOMA', 'Instituto de Obra Médico Asistencial');

-- Tabla de prácticas médicas
CREATE TABLE practicas_medicas (
    id SERIAL PRIMARY KEY,
    nomenclador_id INTEGER REFERENCES nomencladores(id),
    codigo VARCHAR(20) NOT NULL,
    descripcion TEXT NOT NULL,
    descripcion_completa TEXT,
    categoria VARCHAR(100),
    subcategoria VARCHAR(100),
    valor_base DECIMAL(10,2),
    activo BOOLEAN DEFAULT true,
    
    -- Vector embedding de la descripción (1536 dimensiones para OpenAI)
    embedding vector(1536),
    
    -- Metadata
    sinonimos TEXT[],
    palabras_clave TEXT[],
    especialidades TEXT[],
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(nomenclador_id, codigo)
);

-- Índices para búsqueda vectorial
CREATE INDEX idx_practicas_embedding ON practicas_medicas 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Índices tradicionales
CREATE INDEX idx_practicas_codigo ON practicas_medicas(codigo);
CREATE INDEX idx_practicas_nomenclador ON practicas_medicas(nomenclador_id);
CREATE INDEX idx_practicas_descripcion ON practicas_medicas USING gin(descripcion gin_trgm_ops);
CREATE INDEX idx_practicas_categoria ON practicas_medicas(categoria);

-- ============================================
-- 2. PRESTADORES Y MÉDICOS
-- ============================================

-- Tabla de prestadores
CREATE TABLE prestadores (
    id SERIAL PRIMARY KEY,
    razon_social VARCHAR(200) NOT NULL,
    nombre_comercial VARCHAR(200),
    cuit VARCHAR(13) UNIQUE,
    tipo VARCHAR(50), -- hospital, sanatorio, clinica, consultorio
    especialidades TEXT[],
    
    -- Dirección
    direccion TEXT,
    ciudad VARCHAR(100),
    provincia VARCHAR(100),
    codigo_postal VARCHAR(10),
    
    -- Contacto
    telefono VARCHAR(50),
    email VARCHAR(100),
    
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prestadores_razon_social ON prestadores USING gin(razon_social gin_trgm_ops);
CREATE INDEX idx_prestadores_cuit ON prestadores(cuit);

-- Tabla de médicos
CREATE TABLE medicos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    apellido VARCHAR(200) NOT NULL,
    matricula_nacional VARCHAR(20),
    matricula_provincial VARCHAR(20),
    especialidad VARCHAR(100),
    prestador_id INTEGER REFERENCES prestadores(id),
    
    -- Vector embedding para matching fuzzy
    nombre_completo_embedding vector(1536),
    
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(matricula_nacional)
);

CREATE INDEX idx_medicos_matricula_nacional ON medicos(matricula_nacional);
CREATE INDEX idx_medicos_matricula_provincial ON medicos(matricula_provincial);
CREATE INDEX idx_medicos_nombre ON medicos USING gin(
    (nombre || ' ' || apellido) gin_trgm_ops
);
CREATE INDEX idx_medicos_embedding ON medicos 
USING ivfflat (nombre_completo_embedding vector_cosine_ops);

-- ============================================
-- 3. TRAINING DATA Y FEEDBACK
-- ============================================

-- Tabla de órdenes procesadas (para training)
CREATE TABLE ordenes_procesadas (
    id SERIAL PRIMARY KEY,
    
    -- Archivo original
    archivo_nombre VARCHAR(255),
    archivo_hash VARCHAR(64) UNIQUE, -- SHA256 del archivo
    archivo_tipo VARCHAR(50),
    archivo_url TEXT,
    
    -- Resultado de IA
    resultado_ia JSONB NOT NULL,
    
    -- Metadatos de procesamiento
    modelo_usado VARCHAR(100),
    tokens_usados INTEGER,
    tiempo_procesamiento_ms INTEGER,
    confianza_promedio DECIMAL(3,2),
    
    -- Estado de validación
    validado BOOLEAN DEFAULT false,
    validado_por VARCHAR(100),
    validado_en TIMESTAMP,
    
    -- Correcciones humanas
    correccion_humana JSONB,
    requiere_correccion BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ordenes_archivo_hash ON ordenes_procesadas(archivo_hash);
CREATE INDEX idx_ordenes_validado ON ordenes_procesadas(validado);
CREATE INDEX idx_ordenes_created_at ON ordenes_procesadas(created_at DESC);
CREATE INDEX idx_ordenes_resultado_gin ON ordenes_procesadas USING gin(resultado_ia);

-- Tabla de feedback y correcciones
CREATE TABLE feedback_correcciones (
    id SERIAL PRIMARY KEY,
    orden_procesada_id INTEGER REFERENCES ordenes_procesadas(id),
    
    -- Tipo de corrección
    tipo VARCHAR(50), -- 'matricula', 'practica', 'diagnostico', 'paciente', etc.
    campo_corregido VARCHAR(100),
    
    -- Valores
    valor_ia TEXT,
    valor_correcto TEXT,
    
    -- Contexto
    razon_correccion TEXT,
    usuario_correccion VARCHAR(100),
    
    -- Para fine-tuning
    incluir_en_training BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_orden ON feedback_correcciones(orden_procesada_id);
CREATE INDEX idx_feedback_tipo ON feedback_correcciones(tipo);
CREATE INDEX idx_feedback_training ON feedback_correcciones(incluir_en_training);

-- Tabla de datasets de entrenamiento
CREATE TABLE training_datasets (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    
    -- Metadata
    total_ejemplos INTEGER DEFAULT 0,
    ejemplos_validados INTEGER DEFAULT 0,
    fecha_generacion TIMESTAMP,
    
    -- Archivo JSONL generado
    archivo_jsonl_url TEXT,
    archivo_size_bytes BIGINT,
    
    -- OpenAI file ID
    openai_file_id VARCHAR(100),
    
    -- Estado
    estado VARCHAR(50) DEFAULT 'pending', -- pending, generating, ready, uploaded
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de fine-tune jobs
CREATE TABLE finetune_jobs (
    id SERIAL PRIMARY KEY,
    training_dataset_id INTEGER REFERENCES training_datasets(id),
    
    -- OpenAI job info
    openai_job_id VARCHAR(100) UNIQUE,
    modelo_base VARCHAR(100),
    modelo_resultante VARCHAR(200),
    
    -- Hyperparameters
    n_epochs INTEGER DEFAULT 3,
    batch_size INTEGER DEFAULT 4,
    learning_rate_multiplier DECIMAL(5,4),
    
    -- Estado
    estado VARCHAR(50), -- running, succeeded, failed, cancelled
    progreso INTEGER DEFAULT 0,
    
    -- Resultados
    trained_tokens INTEGER,
    costo_usd DECIMAL(10,4),
    error_message TEXT,
    
    -- Tiempos
    iniciado_en TIMESTAMP,
    completado_en TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_finetune_estado ON finetune_jobs(estado);
CREATE INDEX idx_finetune_dataset ON finetune_jobs(training_dataset_id);

-- ============================================
-- 4. MÉTRICAS Y ANALYTICS
-- ============================================

-- Tabla de métricas de precisión
CREATE TABLE metricas_precision (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    modelo VARCHAR(100),
    
    -- Métricas generales
    total_procesados INTEGER,
    total_validados INTEGER,
    tasa_acierto DECIMAL(5,2),
    
    -- Métricas por campo
    precision_matricula DECIMAL(5,2),
    precision_practicas DECIMAL(5,2),
    precision_diagnostico DECIMAL(5,2),
    precision_paciente DECIMAL(5,2),
    
    -- Confianza promedio
    confianza_promedio DECIMAL(3,2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(fecha, modelo)
);

CREATE INDEX idx_metricas_fecha ON metricas_precision(fecha DESC);
CREATE INDEX idx_metricas_modelo ON metricas_precision(modelo);

-- ============================================
-- 5. FUNCIONES ÚTILES
-- ============================================

-- Función para buscar prácticas similares por vector
CREATE OR REPLACE FUNCTION buscar_practicas_similares(
    query_embedding vector(1536),
    nomenclador_codigo VARCHAR(20) DEFAULT NULL,
    limite INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    codigo VARCHAR(20),
    descripcion TEXT,
    nomenclador VARCHAR(100),
    similitud DECIMAL(5,4)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.codigo,
        p.descripcion,
        n.nombre as nomenclador,
        (1 - (p.embedding <=> query_embedding))::DECIMAL(5,4) as similitud
    FROM practicas_medicas p
    JOIN nomencladores n ON p.nomenclador_id = n.id
    WHERE 
        p.activo = true
        AND (nomenclador_codigo IS NULL OR n.codigo = nomenclador_codigo)
    ORDER BY p.embedding <=> query_embedding
    LIMIT limite;
END;
$$ LANGUAGE plpgsql;

-- Función para calcular métricas diarias
CREATE OR REPLACE FUNCTION calcular_metricas_diarias(fecha_inicio DATE, fecha_fin DATE)
RETURNS VOID AS $$
DECLARE
    v_fecha DATE;
BEGIN
    FOR v_fecha IN SELECT generate_series(fecha_inicio, fecha_fin, '1 day'::interval)::DATE
    LOOP
        INSERT INTO metricas_precision (fecha, modelo, total_procesados, total_validados, tasa_acierto)
        SELECT 
            v_fecha,
            modelo_usado,
            COUNT(*),
            COUNT(*) FILTER (WHERE validado = true),
            AVG(CASE WHEN validado THEN 
                (SELECT COUNT(*) FROM feedback_correcciones fc 
                 WHERE fc.orden_procesada_id = op.id) / 
                NULLIF(jsonb_array_length(resultado_ia->'detalle_practicas'), 0) 
            ELSE NULL END) * 100
        FROM ordenes_procesadas op
        WHERE DATE(created_at) = v_fecha
        GROUP BY modelo_usado
        ON CONFLICT (fecha, modelo) DO UPDATE
        SET 
            total_procesados = EXCLUDED.total_procesados,
            total_validados = EXCLUDED.total_validados,
            tasa_acierto = EXCLUDED.tasa_acierto;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas
CREATE TRIGGER update_nomencladores_updated_at BEFORE UPDATE ON nomencladores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_practicas_updated_at BEFORE UPDATE ON practicas_medicas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medicos_updated_at BEFORE UPDATE ON medicos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. VISTAS ÚTILES
-- ============================================

-- Vista de órdenes pendientes de validación
CREATE VIEW v_ordenes_pendientes_validacion AS
SELECT 
    op.id,
    op.archivo_nombre,
    op.created_at,
    op.confianza_promedio,
    op.resultado_ia->>'metadatos'->>'legibilidad' as legibilidad,
    COUNT(fc.id) as correcciones_existentes
FROM ordenes_procesadas op
LEFT JOIN feedback_correcciones fc ON fc.orden_procesada_id = op.id
WHERE op.validado = false
GROUP BY op.id
ORDER BY 
    CASE WHEN op.confianza_promedio < 0.8 THEN 0 ELSE 1 END,
    op.created_at DESC;

-- Vista de estadísticas de training
CREATE VIEW v_estadisticas_training AS
SELECT 
    COUNT(*) as total_ordenes,
    COUNT(*) FILTER (WHERE validado = true) as ordenes_validadas,
    COUNT(*) FILTER (WHERE requiere_correccion = true) as ordenes_con_correccion,
    AVG(confianza_promedio) as confianza_promedio_general,
    COUNT(DISTINCT modelo_usado) as modelos_diferentes
FROM ordenes_procesadas;

-- ============================================
-- COMENTARIOS FINALES
-- ============================================

COMMENT ON TABLE practicas_medicas IS 'Catálogo de prácticas médicas con embeddings vectoriales para búsqueda semántica';
COMMENT ON COLUMN practicas_medicas.embedding IS 'Vector embedding (1536 dims) generado por OpenAI text-embedding-3-small';
COMMENT ON TABLE ordenes_procesadas IS 'Histórico de órdenes procesadas - usado para training y analytics';
COMMENT ON TABLE feedback_correcciones IS 'Correcciones humanas para mejorar el modelo con fine-tuning';
COMMENT ON TABLE training_datasets IS 'Datasets generados automáticamente para fine-tuning';
COMMENT ON TABLE finetune_jobs IS 'Jobs de fine-tuning ejecutados en OpenAI';
