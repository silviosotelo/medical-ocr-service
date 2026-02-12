/**
 * Demo Mode Configuration
 * Allows the application to run without database for testing
 */

const DEMO_MODE = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo';

const DEMO_USERS = [
  {
    id: 'demo-super-admin-id',
    email: 'superadmin@platform.com',
    password: 'SuperAdmin123!',
    name: 'Super Administrator',
    role: 'super_admin',
    tenant_id: null,
    status: 'active',
  },
  {
    id: 'demo-admin-id',
    email: 'admin@demo.com',
    password: 'Admin123!',
    name: 'Admin Demo',
    role: 'admin',
    tenant_id: 'demo-tenant-id',
    status: 'active',
  },
  {
    id: 'demo-operator-id',
    email: 'operator@demo.com',
    password: 'Operator123!',
    name: 'Operador Demo',
    role: 'operator',
    tenant_id: 'demo-tenant-id',
    status: 'active',
  },
  {
    id: 'demo-viewer-id',
    email: 'viewer@demo.com',
    password: 'Viewer123!',
    name: 'Viewer Demo',
    role: 'viewer',
    tenant_id: 'demo-tenant-id',
    status: 'active',
  },
];

const DEMO_TENANT = {
  id: 'demo-tenant-id',
  name: 'Hospital Demo',
  slug: 'hospital-demo',
  ruc: '80000001-0',
  plan: 'professional',
  status: 'active',
  max_orders_month: 10000,
  max_api_keys: 10,
  max_users: 50,
};

module.exports = {
  DEMO_MODE,
  DEMO_USERS,
  DEMO_TENANT,
};
