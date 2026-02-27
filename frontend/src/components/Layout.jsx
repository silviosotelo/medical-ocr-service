import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Badge } from '@tremor/react';
import {
  LayoutDashboard, Building2, Users, Key, FileText,
  BarChart3, Database, Webhook, LogOut, Menu, X, Shield,
  Upload, Send, ClipboardCheck, AlertCircle,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { key: 'dashboard', to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    title: 'Procesamiento',
    items: [
      { key: 'data-ingest', to: '/data-ingest', icon: Upload, label: 'Ingesta de Datos' },
      { key: 'ordenes-processing', to: '/ordenes-processing', icon: Send, label: 'Procesar Ordenes' },
      { key: 'previsaciones', to: '/previsaciones', icon: ClipboardCheck, label: 'Pre-visaciones' },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { key: 'orders', to: '/orders', icon: FileText, label: 'Ordenes' },
      { key: 'data', to: '/data', icon: Database, label: 'Datos' },
      { key: 'usage', to: '/usage', icon: BarChart3, label: 'Uso' },
      { key: 'webhooks', to: '/webhooks', icon: Webhook, label: 'Webhooks' },
    ],
  },
  {
    title: 'Administracion',
    items: [
      { key: 'tenants', to: '/tenants', icon: Building2, label: 'Tenants' },
      { key: 'users', to: '/users', icon: Users, label: 'Usuarios' },
      { key: 'api-keys', to: '/api-keys', icon: Key, label: 'API Keys' },
    ],
  },
];

const ROLE_COLORS = {
  super_admin: 'red',
  admin: 'blue',
  operator: 'amber',
  viewer: 'gray',
};

function TenantSelectorWidget() {
  const { isSuperAdmin, selectedTenant, availableTenants, selectTenant, user } = useAuth();

  if (isSuperAdmin) {
    return (
      <select
        value={selectedTenant?.id || ''}
        onChange={(e) => {
          const tenant = availableTenants.find((t) => String(t.id) === e.target.value);
          selectTenant(tenant || null);
        }}
        className="rounded-lg border border-gray-300 text-sm py-1.5 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-700"
      >
        <option value="">— Seleccionar Tenant —</option>
        {availableTenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }

  const tenantName = selectedTenant?.name || user?.tenant_name || user?.tenant_id;
  if (!tenantName) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-600">
      <Building2 className="w-4 h-4 text-gray-400" />
      <span>{tenantName}</span>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout, canAccessNav, roleConfig, isSuperAdmin, selectedTenant } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="flex items-center gap-3 h-16 px-6 border-b border-gray-200 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900 text-sm">Medical OCR</span>
            <span className="block text-[10px] text-gray-400 -mt-0.5">SaaS Platform</span>
          </div>
          <button
            className="ml-auto lg:hidden text-gray-500"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-3 flex-1 overflow-y-auto space-y-4">
          {NAV_SECTIONS.map((section, idx) => {
            const visibleItems = section.items.filter((item) => canAccessNav(item.key));
            if (visibleItems.length === 0) return null;
            return (
              <div key={idx}>
                {section.title && (
                  <p className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map(({ key, to, icon: Icon, label }) => (
                    <NavLink
                      key={key}
                      to={to}
                      end={to === '/'}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                          isActive
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2 px-3">
            <Shield className="w-4 h-4 text-gray-400" />
            <Badge color={ROLE_COLORS[user?.role] || 'gray'} size="xs">
              {roleConfig.label}
            </Badge>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 flex-shrink-0">
          <button className="lg:hidden text-gray-500" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <TenantSelectorWidget />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
              <span className="text-brand-700 font-medium text-sm">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
        </header>

        <main key={selectedTenant?.id || 'no-tenant'} className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {isSuperAdmin && !selectedTenant && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Selecciona un tenant en la barra superior para operar sobre sus datos.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
