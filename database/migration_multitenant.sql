/*
  # Multi-Tenancy & SaaS Platform Migration

  1. New Tables
    - tenants: prepaga organizations
    - users: platform users with roles
    - api_keys: per-tenant API keys
    - usage_logs: metering per request
    - webhook_configs: notification endpoints per tenant
    - processing_jobs: async job queue tracking

  2. Modified Tables
    - prestadores: add tenant_id
    - nomencladores: add tenant_id
    - acuerdos_prestador: add tenant_id
    - visacion_previa: add tenant_id
    - det_visacion_previa: (inherits via visacion_previa)
    - ordenes_procesadas: add tenant_id
    - feedback_matching: add tenant_id
    - feedback_correcciones: (inherits via ordenes_procesadas)

  3. Security
    - All queries must filter by tenant_id
    - API keys are hashed (SHA256)
    - Passwords hashed with bcrypt
*/

-- =====================================================================
-- TENANTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    ruc VARCHAR(20),

    plan VARCHAR(50) DEFAULT 'starter',
    status VARCHAR(20) DEFAULT 'active',

    settings JSONB DEFAULT '{}'::jsonb,

    max_orders_month INTEGER DEFAULT 500,
    max_api_keys INTEGER DEFAULT 5,
    max_users INTEGER DEFAULT 10,

    fine_tuned_model VARCHAR(200),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- =====================================================================
-- USERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    name VARCHAR(200) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer',
    status VARCHAR(20) DEFAULT 'active',

    last_login TIMESTAMP,
    login_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================================
-- API KEYS
-- =====================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),

    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,

    scopes JSONB DEFAULT '["read","write"]'::jsonb,

    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- =====================================================================
-- USAGE LOGS
-- =====================================================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    api_key_id UUID REFERENCES api_keys(id),

    action VARCHAR(50) NOT NULL,
    endpoint VARCHAR(200),
    method VARCHAR(10),

    tokens_used INTEGER DEFAULT 0,
    processing_ms INTEGER DEFAULT 0,
    file_size_bytes INTEGER DEFAULT 0,

    status_code INTEGER,
    error_message TEXT,

    metadata JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_action ON usage_logs(action);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'usage_logs_created_at_idx'
  ) THEN
    CREATE INDEX usage_logs_created_at_idx ON usage_logs USING brin(created_at);
  END IF;
END $$;

-- =====================================================================
-- WEBHOOK CONFIGS
-- =====================================================================

CREATE TABLE IF NOT EXISTS webhook_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255),
    events JSONB DEFAULT '["order.completed","previsacion.ready","training.completed"]'::jsonb,

    status VARCHAR(20) DEFAULT 'active',
    failure_count INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMP,
    last_error TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhook_configs(tenant_id);

-- =====================================================================
-- PROCESSING JOBS (for async queue tracking)
-- =====================================================================

CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,

    input_data JSONB,
    result_data JSONB,
    error_message TEXT,

    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON processing_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON processing_jobs(type);

-- =====================================================================
-- ADD tenant_id TO EXISTING TABLES
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prestadores' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE prestadores ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nomencladores' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE nomencladores ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acuerdos_prestador' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE acuerdos_prestador ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visacion_previa' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE visacion_previa ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordenes_procesadas' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ordenes_procesadas ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feedback_matching' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE feedback_matching ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prestadores_tenant ON prestadores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nomencladores_tenant ON nomencladores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acuerdos_tenant ON acuerdos_prestador(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visacion_previa_tenant ON visacion_previa(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_tenant ON ordenes_procesadas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedback_matching_tenant ON feedback_matching(tenant_id);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenants_updated') THEN
    CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated') THEN
    CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

-- =====================================================================
-- USAGE STATS VIEW
-- =====================================================================

CREATE OR REPLACE VIEW v_tenant_usage_monthly AS
SELECT
    t.id as tenant_id,
    t.name as tenant_name,
    t.plan,
    t.max_orders_month,
    date_trunc('month', ul.created_at) as month,
    COUNT(*) FILTER (WHERE ul.action = 'process_order') as orders_processed,
    SUM(ul.tokens_used) as total_tokens,
    SUM(ul.processing_ms) as total_processing_ms,
    COUNT(DISTINCT ul.user_id) as active_users,
    COUNT(DISTINCT DATE(ul.created_at)) as active_days
FROM tenants t
LEFT JOIN usage_logs ul ON ul.tenant_id = t.id
GROUP BY t.id, t.name, t.plan, t.max_orders_month, date_trunc('month', ul.created_at);

COMMENT ON TABLE tenants IS 'Organizaciones prepaga - multi-tenancy SaaS';
COMMENT ON TABLE users IS 'Usuarios de la plataforma con roles';
COMMENT ON TABLE api_keys IS 'API keys por tenant para acceso programatico';
COMMENT ON TABLE usage_logs IS 'Registro de uso para metering y billing';
COMMENT ON TABLE webhook_configs IS 'Configuracion de webhooks por tenant';
COMMENT ON TABLE processing_jobs IS 'Cola de trabajos asincrona';
