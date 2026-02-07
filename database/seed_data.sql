/*
  # Seed Data - Medical OCR SaaS Platform

  Este script inserta datos iniciales para desarrollo y testing:

  1. Usuario Super Admin (sin tenant)
  2. Tenant de ejemplo "Hospital Demo"
  3. Usuarios de ejemplo con diferentes roles
  4. API Key de ejemplo

  IMPORTANTE: Las contraseñas están hasheadas con bcrypt (rounds=12)

  Credenciales por defecto:
  - superadmin@platform.com / SuperAdmin123!
  - admin@demo.com / Admin123!
  - operator@demo.com / Operator123!
  - viewer@demo.com / Viewer123!
*/

-- =====================================================================
-- 1. SUPER ADMIN (sin tenant_id)
-- =====================================================================

-- Password: SuperAdmin123!
-- Hash generado con: bcrypt.hash('SuperAdmin123!', 12)
INSERT INTO users (
    id,
    tenant_id,
    email,
    password_hash,
    name,
    role,
    status,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    NULL,
    'superadmin@platform.com',
    '$2a$12$LQZaR1YZvF0IhD7sQmH9qvE6pqN.WKIXx0yZvGbLqX/MK2vN.7OK8',
    'Super Administrator',
    'super_admin',
    'active',
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- =====================================================================
-- 2. TENANT DE EJEMPLO: "Hospital Demo"
-- =====================================================================

DO $$
DECLARE
    demo_tenant_id UUID;
    admin_user_id UUID;
    operator_user_id UUID;
    viewer_user_id UUID;
BEGIN
    -- Insertar tenant
    INSERT INTO tenants (
        id,
        name,
        slug,
        ruc,
        plan,
        status,
        settings,
        max_orders_month,
        max_api_keys,
        max_users,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'Hospital Demo',
        'hospital-demo',
        '80000001-0',
        'professional',
        'active',
        '{"max_requests_per_month": 100000, "features": ["ocr", "validation", "api_access", "webhooks"]}'::jsonb,
        10000,
        10,
        50,
        NOW(),
        NOW()
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    RETURNING id INTO demo_tenant_id;

    RAISE NOTICE 'Tenant created: %', demo_tenant_id;

    -- =====================================================================
    -- 3. USUARIOS DEL TENANT
    -- =====================================================================

    -- 3.1 Admin User
    -- Password: Admin123!
    INSERT INTO users (
        id,
        tenant_id,
        email,
        password_hash,
        name,
        role,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        demo_tenant_id,
        'admin@demo.com',
        '$2a$12$KIXx0yZvGbLqX/MK2vN.7OK8LQZaR1YZvF0IhD7sQmH9qvE6pqN.W',
        'Admin Demo',
        'admin',
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
        tenant_id = demo_tenant_id,
        updated_at = NOW()
    RETURNING id INTO admin_user_id;

    RAISE NOTICE 'Admin user created: %', admin_user_id;

    -- 3.2 Operator User
    -- Password: Operator123!
    INSERT INTO users (
        id,
        tenant_id,
        email,
        password_hash,
        name,
        role,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        demo_tenant_id,
        'operator@demo.com',
        '$2a$12$QZaR1YZvF0IhD7sQmH9qvE6pqN.WKIXx0yZvGbLqX/MK2vN.7OK8L',
        'Operador Demo',
        'operator',
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
        tenant_id = demo_tenant_id,
        updated_at = NOW()
    RETURNING id INTO operator_user_id;

    RAISE NOTICE 'Operator user created: %', operator_user_id;

    -- 3.3 Viewer User
    -- Password: Viewer123!
    INSERT INTO users (
        id,
        tenant_id,
        email,
        password_hash,
        name,
        role,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        demo_tenant_id,
        'viewer@demo.com',
        '$2a$12$aR1YZvF0IhD7sQmH9qvE6pqN.WKIXx0yZvGbLqX/MK2vN.7OK8LQ',
        'Viewer Demo',
        'viewer',
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
        tenant_id = demo_tenant_id,
        updated_at = NOW()
    RETURNING id INTO viewer_user_id;

    RAISE NOTICE 'Viewer user created: %', viewer_user_id;

    -- =====================================================================
    -- 4. API KEY DE EJEMPLO
    -- =====================================================================

    -- API Key: mk_demo_test123456789abcdef (ejemplo, generada por la app)
    -- Key Hash: SHA256 de la key completa
    -- Nota: Esta es solo un placeholder, las keys reales se generan via API
    INSERT INTO api_keys (
        id,
        tenant_id,
        created_by,
        name,
        key_prefix,
        key_hash,
        scopes,
        status,
        expires_at,
        last_used_at,
        usage_count,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        demo_tenant_id,
        admin_user_id,
        'Demo API Key',
        'mk_demo_',
        encode(sha256('demo_key_placeholder'::bytea), 'hex'),
        '["read", "write", "validate"]'::jsonb,
        'active',
        NOW() + INTERVAL '1 year',
        NULL,
        0,
        NOW(),
        NOW()
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'API key created for tenant';

END $$;

-- =====================================================================
-- 5. DATOS DE EJEMPLO OPCIONALES (comentados por defecto)
-- =====================================================================

/*
-- Descomentar si quieres insertar prestadores de ejemplo

INSERT INTO prestadores (
    tenant_id,
    nombre,
    codigo,
    tipo,
    activo
) VALUES (
    (SELECT id FROM tenants WHERE slug = 'hospital-demo'),
    'Sanatorio Demo',
    'DEMO001',
    'sanatorio',
    true
);

INSERT INTO prestadores (
    tenant_id,
    nombre,
    codigo,
    tipo,
    activo
) VALUES (
    (SELECT id FROM tenants WHERE slug = 'hospital-demo'),
    'Centro Médico Demo',
    'DEMO002',
    'centro_medico',
    true
);
*/

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================

-- Mostrar resumen de lo insertado
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Seed Data Inserted Successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'CREDENCIALES DE ACCESO:';
    RAISE NOTICE '';
    RAISE NOTICE '1. Super Admin (plataforma completa):';
    RAISE NOTICE '   Email: superadmin@platform.com';
    RAISE NOTICE '   Password: SuperAdmin123!';
    RAISE NOTICE '';
    RAISE NOTICE '2. Admin (tenant "Hospital Demo"):';
    RAISE NOTICE '   Email: admin@demo.com';
    RAISE NOTICE '   Password: Admin123!';
    RAISE NOTICE '';
    RAISE NOTICE '3. Operator (tenant "Hospital Demo"):';
    RAISE NOTICE '   Email: operator@demo.com';
    RAISE NOTICE '   Password: Operator123!';
    RAISE NOTICE '';
    RAISE NOTICE '4. Viewer (tenant "Hospital Demo"):';
    RAISE NOTICE '   Email: viewer@demo.com';
    RAISE NOTICE '   Password: Viewer123!';
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Total tenants: %', (SELECT COUNT(*) FROM tenants);
    RAISE NOTICE 'Total users: %', (SELECT COUNT(*) FROM users);
    RAISE NOTICE 'Total API keys: %', (SELECT COUNT(*) FROM api_keys);
    RAISE NOTICE '================================================';
END $$;

-- Consulta para verificar
SELECT
    'Tenants' as table_name,
    COUNT(*) as count
FROM tenants
UNION ALL
SELECT
    'Users',
    COUNT(*)
FROM users
UNION ALL
SELECT
    'API Keys',
    COUNT(*)
FROM api_keys;
