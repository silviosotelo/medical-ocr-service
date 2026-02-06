import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

const ROLE_CONFIG = {
  super_admin: {
    label: 'Super Admin',
    level: 100,
    nav: ['dashboard', 'tenants', 'users', 'api-keys', 'orders', 'usage', 'data', 'webhooks'],
  },
  admin: {
    label: 'Administrador',
    level: 80,
    nav: ['dashboard', 'users', 'api-keys', 'orders', 'usage', 'data', 'webhooks'],
  },
  operator: {
    label: 'Operador',
    level: 50,
    nav: ['dashboard', 'orders', 'data', 'usage'],
  },
  viewer: {
    label: 'Visor',
    level: 10,
    nav: ['dashboard', 'orders'],
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
        loadPermissions();
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
    return u;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    setPermissions([]);
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

  return (
    <AuthContext.Provider value={{
      user, login, logout, loading,
      permissions, hasPermission, canAccessNav,
      roleConfig, isSuperAdmin, isAdmin,
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
