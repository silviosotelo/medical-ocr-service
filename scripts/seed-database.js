const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://medical_ocr_user:password@localhost:5432/medical_ocr',
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function generateApiKeyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function seedDatabase() {
  const client = await pool.connect();

  try {
    log('\n================================================', colors.cyan);
    log('Medical OCR SaaS Platform - Database Seeding', colors.bright);
    log('================================================\n', colors.cyan);

    await client.query('BEGIN');

    // =====================================================================
    // 1. SUPER ADMIN
    // =====================================================================
    log('[1/5] Creating Super Admin user...', colors.yellow);

    const superAdminPassword = await hashPassword('SuperAdmin123!');

    const superAdminResult = await client.query(`
      INSERT INTO users (
        id, tenant_id, email, password_hash, name, role, status, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        NULL,
        $1,
        $2,
        $3,
        'super_admin',
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
      RETURNING id, email, name, role
    `, ['superadmin@platform.com', superAdminPassword, 'Super Administrator']);

    log(`✓ Super Admin created: ${superAdminResult.rows[0].email}`, colors.green);

    // =====================================================================
    // 2. TENANT
    // =====================================================================
    log('[2/5] Creating demo tenant...', colors.yellow);

    const tenantResult = await client.query(`
      INSERT INTO tenants (
        id, name, slug, ruc, plan, status, settings,
        max_orders_month, max_api_keys, max_users,
        created_at, updated_at
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
      RETURNING id, name, slug, plan
    `);

    const tenantId = tenantResult.rows[0].id;
    log(`✓ Tenant created: ${tenantResult.rows[0].name} (${tenantResult.rows[0].slug})`, colors.green);

    // =====================================================================
    // 3. USERS
    // =====================================================================
    log('[3/5] Creating tenant users...', colors.yellow);

    const users = [
      {
        email: 'admin@demo.com',
        password: 'Admin123!',
        name: 'Admin Demo',
        role: 'admin',
      },
      {
        email: 'operator@demo.com',
        password: 'Operator123!',
        name: 'Operador Demo',
        role: 'operator',
      },
      {
        email: 'viewer@demo.com',
        password: 'Viewer123!',
        name: 'Viewer Demo',
        role: 'viewer',
      },
    ];

    const createdUsers = [];

    for (const user of users) {
      const passwordHash = await hashPassword(user.password);

      const userResult = await client.query(`
        INSERT INTO users (
          id, tenant_id, email, password_hash, name, role, status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          'active',
          NOW(),
          NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
        RETURNING id, email, name, role
      `, [tenantId, user.email, passwordHash, user.name, user.role]);

      createdUsers.push(userResult.rows[0]);
      log(`  ✓ ${user.role}: ${user.email}`, colors.green);
    }

    const adminUserId = createdUsers.find(u => u.role === 'admin')?.id;

    // =====================================================================
    // 4. API KEY (OPCIONAL)
    // =====================================================================
    log('[4/5] Creating demo API key...', colors.yellow);

    const demoApiKey = 'mk_demo_test_' + crypto.randomBytes(16).toString('hex');
    const keyHash = generateApiKeyHash(demoApiKey);

    await client.query(`
      INSERT INTO api_keys (
        id, tenant_id, created_by, name, key_prefix, key_hash,
        scopes, status, expires_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        'Demo API Key',
        'mk_demo_',
        $3,
        '["read", "write", "validate"]'::jsonb,
        'active',
        NOW() + INTERVAL '1 year',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
    `, [tenantId, adminUserId, keyHash]);

    log(`✓ API key created (prefix: mk_demo_)`, colors.green);

    // =====================================================================
    // 5. VERIFICACIÓN
    // =====================================================================
    log('[5/5] Verifying database...', colors.yellow);

    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM tenants) as tenants,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM api_keys) as api_keys
    `);

    await client.query('COMMIT');

    log('\n✓ Seed completed successfully!', colors.green);

    log('\n================================================', colors.cyan);
    log('DATABASE STATISTICS', colors.bright);
    log('================================================', colors.cyan);
    log(`Tenants: ${stats.rows[0].tenants}`);
    log(`Users: ${stats.rows[0].users}`);
    log(`API Keys: ${stats.rows[0].api_keys}`);

    log('\n================================================', colors.cyan);
    log('LOGIN CREDENTIALS', colors.bright);
    log('================================================', colors.cyan);

    log('\n1. Super Admin (full platform access):', colors.blue);
    log('   Email: superadmin@platform.com');
    log('   Password: SuperAdmin123!');

    log('\n2. Admin (Hospital Demo tenant):', colors.blue);
    log('   Email: admin@demo.com');
    log('   Password: Admin123!');

    log('\n3. Operator (Hospital Demo tenant):', colors.blue);
    log('   Email: operator@demo.com');
    log('   Password: Operator123!');

    log('\n4. Viewer (Hospital Demo tenant):', colors.blue);
    log('   Email: viewer@demo.com');
    log('   Password: Viewer123!');

    log('\n================================================', colors.cyan);
    log('NEXT STEPS', colors.bright);
    log('================================================', colors.cyan);
    log('1. Start the server: npm start');
    log('2. Login at: http://localhost:3000/portal');
    log('3. Import Postman collection: postman_collection.json');
    log('4. See docs: QUICK_START.md\n');

  } catch (error) {
    await client.query('ROLLBACK');
    log('\n✗ Error seeding database:', colors.yellow);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute
if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
