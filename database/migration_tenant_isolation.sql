-- =====================================================================
-- MIGRATION: Tenant Isolation - Unique constraints scoped by tenant
-- Ensures multi-tenant data isolation at DB level
-- =====================================================================

-- 1. Fix unique index on prestadores.id_externo to include tenant_id
DROP INDEX IF EXISTS idx_prestadores_id_externo;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prestadores_id_externo_tenant
  ON prestadores(id_externo, tenant_id);

-- 2. Fix unique index on nomencladores.id_externo to include tenant_id
DROP INDEX IF EXISTS idx_nomencladores_id_externo;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nomencladores_id_externo_tenant
  ON nomencladores(id_externo, tenant_id);

-- 3. Composite indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_prestadores_tenant_estado
  ON prestadores(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_nomencladores_tenant_estado
  ON nomencladores(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_acuerdos_tenant_vigente
  ON acuerdos_prestador(tenant_id, prest_id_prestador, id_nomenclador, vigente);
CREATE INDEX IF NOT EXISTS idx_visacion_previa_tenant_estado
  ON visacion_previa(tenant_id, estado);

-- 4. Add max_webhooks and max_prestadores columns to tenants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'max_webhooks'
  ) THEN
    ALTER TABLE tenants ADD COLUMN max_webhooks INTEGER DEFAULT 3;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'max_prestadores'
  ) THEN
    ALTER TABLE tenants ADD COLUMN max_prestadores INTEGER DEFAULT 1000;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'max_nomencladores'
  ) THEN
    ALTER TABLE tenants ADD COLUMN max_nomencladores INTEGER DEFAULT 2000;
  END IF;
END $$;

COMMENT ON INDEX idx_prestadores_id_externo_tenant IS 'Unique id_externo scoped per tenant';
COMMENT ON INDEX idx_nomencladores_id_externo_tenant IS 'Unique id_externo scoped per tenant';
