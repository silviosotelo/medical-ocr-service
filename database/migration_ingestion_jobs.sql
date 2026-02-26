-- =====================================================================
-- MIGRATION: ingestion_jobs + webhook_failures
-- Sistema de cola de trabajos para ingesta API-First
-- =====================================================================

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(50) NOT NULL,
  batch_id UUID,
  id_externo VARCHAR(100),
  tenant_id VARCHAR(100),
  payload JSONB,
  estado VARCHAR(20) DEFAULT 'QUEUED',
  intentos INTEGER DEFAULT 0,
  max_intentos INTEGER DEFAULT 3,
  error_message TEXT,
  resultado JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_estado_tipo_created
  ON ingestion_jobs(estado, tipo, created_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_batch
  ON ingestion_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant_estado
  ON ingestion_jobs(tenant_id, estado);

-- Trigger para updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ingestion_jobs_updated'
  ) THEN
    CREATE TRIGGER trg_ingestion_jobs_updated
      BEFORE UPDATE ON ingestion_jobs
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

-- =====================================================================
-- Tabla para registrar fallos de webhook tras agotar reintentos
-- =====================================================================

CREATE TABLE IF NOT EXISTS webhook_failures (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100),
  event VARCHAR(100) NOT NULL,
  payload JSONB,
  url TEXT,
  last_error TEXT,
  intentos INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_tenant
  ON webhook_failures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_event
  ON webhook_failures(event);

-- Agregar columna id_externo a prestadores si no existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prestadores' AND column_name = 'id_externo'
  ) THEN
    ALTER TABLE prestadores ADD COLUMN id_externo VARCHAR(100);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prestadores_id_externo ON prestadores(id_externo);
  END IF;
END $$;

-- Agregar columna tipo a prestadores si no existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prestadores' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE prestadores ADD COLUMN tipo VARCHAR(50);
  END IF;
END $$;

-- Agregar columna id_externo a nomencladores si no existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nomencladores' AND column_name = 'id_externo'
  ) THEN
    ALTER TABLE nomencladores ADD COLUMN id_externo VARCHAR(100);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nomencladores_id_externo ON nomencladores(id_externo);
  END IF;
END $$;

COMMENT ON TABLE ingestion_jobs IS 'Cola de trabajos de ingesta - procesamiento asincrono API-First';
COMMENT ON TABLE webhook_failures IS 'Registro de fallos de webhook tras agotar reintentos';
