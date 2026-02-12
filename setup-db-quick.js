const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔌 Connected to database');

    // Apply multi-tenant migration
    console.log('📦 Applying multi-tenant migration...');
    const migration = fs.readFileSync('./database/migration_multitenant.sql', 'utf8');
    await client.query(migration);
    console.log('✅ Migration applied');

    // Seed data
    console.log('🌱 Seeding database...');

    // Create super admin
    const bcrypt = require('bcryptjs');
    const superAdminPassword = await bcrypt.hash('SuperAdmin123!', 12);

    await client.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status)
      VALUES (gen_random_uuid(), NULL, 'superadmin@platform.com', $1, 'Super Administrator', 'super_admin', 'active')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [superAdminPassword]);
    console.log('✅ Super admin created');

    // Create demo tenant
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, slug, ruc, plan, status, max_orders_month, max_api_keys, max_users)
      VALUES ('Hospital Demo', 'hospital-demo', '80000001-0', 'professional', 'active', 10000, 10, 50)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const tenantId = tenantResult.rows[0].id;
    console.log(`✅ Tenant created: ${tenantId}`);

    // Create users
    const adminPassword = await bcrypt.hash('Admin123!', 12);
    const operatorPassword = await bcrypt.hash('Operator123!', 12);
    const viewerPassword = await bcrypt.hash('Viewer123!', 12);

    await client.query(`
      INSERT INTO users (tenant_id, email, password_hash, name, role, status)
      VALUES
        ($1, 'admin@demo.com', $2, 'Admin Demo', 'admin', 'active'),
        ($1, 'operator@demo.com', $3, 'Operador Demo', 'operator', 'active'),
        ($1, 'viewer@demo.com', $4, 'Viewer Demo', 'viewer', 'active')
      ON CONFLICT (email) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, password_hash = EXCLUDED.password_hash
    `, [tenantId, adminPassword, operatorPassword, viewerPassword]);
    console.log('✅ Users created');

    console.log('\n✨ Database setup complete!');
    console.log('\n📋 Credentials:');
    console.log('Super Admin: superadmin@platform.com / SuperAdmin123!');
    console.log('Admin: admin@demo.com / Admin123!');
    console.log('Operator: operator@demo.com / Operator123!');
    console.log('Viewer: viewer@demo.com / Viewer123!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
