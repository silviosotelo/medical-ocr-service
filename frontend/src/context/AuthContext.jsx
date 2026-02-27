import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

const ROLE_CONFIG = {
  super_admin: {
    label: 'Super Admin',
    level: 100,
    nav: ['dashboard', 'tenants', 'users', 'api-keys', 'orders', 'usage', 'data', 'data-ingest', 'ordenes-processing', 'previsaciones', 'webhooks'],
  },
  admin: {
    label: 'Administrador',
    level: 80,
    nav: ['dashboard', 'users', 'api-keys', 'orders', 'usage', 'data', 'data-ingest', 'ordenes-processing', 'previsaciones', 'webhooks'],
  },
  operator: {
    label: 'Operador',
    level: 50,
    nav: ['dashboard', 'orders', 'data', 'data-ingest', 'ordenes-processing', 'previsaciones', 'usage'],
  },
  viewer: {
    label: 'Visor',
    level: 10,
    nav: ['dashboard', 'orders', 'previsaciones'],
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState(() => {
    const stored = localStorage.getItem('selectedTenant');
    return stored ? JSON.parse(stored) : null;
  });
  const [availableTenants, setAvailableTenants] = useState([]);

  function selectTenant(tenant) {
    if (tenant) {
      localStorage.setItem('selectedTenantId', tenant.id);
      localStorage.setItem('selectedTenant', JSON.stringify(tenant));
    } else {
      localStorage.removeItem('selectedTenantId');
      localStorage.removeItem('selectedTenant');
    }
    setSelectedTenant(tenant);
  }

  async function loadAvailableTenants() {
    try {
      const res = await api.get('/tenants?limit=100');
      setAvailableTenants(res.data?.tenants || res.data || []);
    } catch {
      setAvailableTenants([]);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
        loadPermissions();
        if (u.role === 'super_admin') {
          loadAvailableTenants();
        }
      } catch {
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  async function loadPermissions() {
    try {
      const res = await api.get('/auth/permissions');
      setPermissions(res.data?.permissions || []);
    } catch {
      setPermissions([]);
    }
  }

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    const { user: u, accessToken, refreshToken } = res.data;
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    await loadPermissions();

    if (u.role === 'super_admin') {
      // Load available tenants but don't auto-select
      try {
        const tenantsRes = await api.get('/tenants?limit=100');
        setAvailableTenants(tenantsRes.data?.tenants || tenantsRes.data || []);
      } catch {
        setAvailableTenants([]);
      }
    } else {
      // Auto-select tenant from JWT for non-super_admin roles
      selectTenant({ id: u.tenant_id, name: u.tenant_name || u.tenant_id });
    }

    return u;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedTenantId');
    localStorage.removeItem('selectedTenant');
    setUser(null);
    setPermissions([]);
    setSelectedTenant(null);
    setAvailableTenants([]);
  }

  const hasPermission = useCallback(
    (perm) => permissions.includes(perm),
    [permissions]
  );

  const roleConfig = user?.role ? ROLE_CONFIG[user.role] || ROLE_CONFIG.viewer : ROLE_CONFIG.viewer;

  const canAccessNav = useCallback(
    (navKey) => roleConfig.nav.includes(navKey),
    [roleConfig]
  );

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;
  const isReadyToOperate = !isSuperAdmin || selectedTenant !== null;

  return (
    <AuthContext.Provider value={{
      user, login, logout, loading,
      permissions, hasPermission, canAccessNav,
      roleConfig, isSuperAdmin, isAdmin,
      selectedTenant, availableTenants, selectTenant, isReadyToOperate,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
