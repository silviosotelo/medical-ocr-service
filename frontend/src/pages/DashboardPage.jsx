import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  FileText, Users, Key, TrendingUp, AlertCircle,
  Building2, Activity, CheckCircle, Clock, BarChart3, Shield,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

function StatCard({ icon: Icon, label, value, color = 'brand', sub }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="card p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value ?? '-'}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function OrdersTable({ orders }) {
  if (!orders?.length) return null;
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Ordenes Recientes</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-3 font-medium">Archivo</th>
              <th className="pb-3 font-medium">Confianza</th>
              <th className="pb-3 font-medium">Estado</th>
              <th className="pb-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 text-gray-900 font-medium">{order.archivo_nombre}</td>
                <td className="py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    order.confianza_promedio >= 0.8 ? 'bg-green-50 text-green-700' :
                    order.confianza_promedio >= 0.6 ? 'bg-amber-50 text-amber-700' :
                    'bg-red-50 text-red-700'
                  }`}>
                    {(order.confianza_promedio * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    order.validado ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {order.validado ? 'Validado' : 'Pendiente'}
                  </span>
                </td>
                <td className="py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityChart({ data, title }) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {data?.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice?.(5) || v} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey="requests" stroke="#1a73f5" fill="#eef8ff" strokeWidth={2} name="Requests" />
            {data[0]?.errors !== undefined && (
              <Area type="monotone" dataKey="errors" stroke="#ef4444" fill="#fef2f2" strokeWidth={1.5} name="Errores" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <AlertCircle className="w-10 h-10 mb-2" />
          <p>Sin datos de actividad</p>
        </div>
      )}
    </div>
  );
}

function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/tenants?limit=100').catch(() => ({ data: [] })),
      api.get('/usage/summary').catch(() => ({ data: {} })),
      api.get('/usage/daily').catch(() => ({ data: [] })),
    ]).then(([tenantsRes, usageRes, dailyRes]) => {
      const tenants = tenantsRes.data || [];
      setData({
        tenants,
        usage: usageRes.data || {},
        daily: dailyRes.data || [],
        activeTenants: tenants.filter((t) => t.status === 'active').length,
        totalTenants: tenants.length,
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel Global</h1>
        <p className="text-gray-500 mt-1">Vista general de toda la plataforma</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Tenants Activos" value={data.activeTenants} sub={`de ${data.totalTenants} total`} />
        <StatCard icon={Activity} label="Requests (30d)" value={data.usage.total_requests ?? 0} color="blue" />
        <StatCard icon={TrendingUp} label="Tokens Usados" value={data.usage.total_tokens ?? 0} color="green" />
        <StatCard icon={AlertCircle} label="Errores" value={data.usage.error_count ?? 0} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityChart data={data.daily} title="Actividad Global (30 dias)" />
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tenants</h2>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {data.tenants.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No hay tenants registrados</p>
            ) : (
              data.tenants.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.slug} - {t.plan}</p>
                  </div>
                  <span className={`flex-shrink-0 w-2 h-2 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-gray-700">Performance</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Avg Response</span>
              <span className="font-medium">{data.usage.avg_processing_ms ?? '-'}ms</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Dias Activos</span>
              <span className="font-medium">{data.usage.active_days ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-gray-700">Procesamiento</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ordenes</span>
              <span className="font-medium">{data.usage.orders_processed ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pre-visaciones</span>
              <span className="font-medium">{data.usage.pre_visaciones ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-gray-700">Almacenamiento</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total</span>
              <span className="font-medium">{data.usage.total_bytes ? `${(data.usage.total_bytes / 1024 / 1024).toFixed(1)}MB` : '0'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/tenants/dashboard').catch(() => ({ data: {} })),
      api.get('/usage/summary').catch(() => ({ data: {} })),
      api.get('/usage/daily').catch(() => ({ data: [] })),
    ]).then(([dash, usage, daily]) => {
      setData({ ...dash.data, usage: usage.data, daily: daily.data || [] });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const usage = data?.usage || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Administracion de tu organizacion</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Ordenes Procesadas" value={stats.total_orders} />
        <StatCard icon={TrendingUp} label="Este Mes" value={stats.orders_this_month} color="green" />
        <StatCard icon={Users} label="Usuarios" value={stats.user_count} color="amber" />
        <StatCard icon={Key} label="API Keys Activas" value={stats.active_keys} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityChart data={data.daily} title="Actividad (30 dias)" />
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Datos Cargados</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">Prestadores</span>
              <span className="font-semibold text-gray-900">{stats.prestadores_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">Nomencladores</span>
              <span className="font-semibold text-gray-900">{stats.nomencladores_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">Acuerdos</span>
              <span className="font-semibold text-gray-900">{stats.acuerdos_count ?? 0}</span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Uso del periodo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Requests</p>
                <p className="text-lg font-bold text-gray-900">{usage.total_requests ?? 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Tokens</p>
                <p className="text-lg font-bold text-gray-900">{usage.total_tokens ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <OrdersTable orders={data?.recentOrders} />
    </div>
  );
}

function OperatorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/orders/stats').catch(() => ({ data: {} })),
      api.get('/orders?limit=10').catch(() => ({ data: [] })),
      api.get('/usage/summary').catch(() => ({ data: {} })),
    ]).then(([stats, orders, usage]) => {
      setData({
        stats: stats.data || {},
        orders: orders.data || [],
        usage: usage.data || {},
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Centro de Operaciones</h1>
        <p className="text-gray-500 mt-1">Procesamiento y validacion de ordenes</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Ordenes" value={stats.total} />
        <StatCard icon={CheckCircle} label="Validadas" value={stats.validated} color="green" />
        <StatCard icon={AlertCircle} label="Con Correcciones" value={stats.with_corrections} color="amber" />
        <StatCard icon={Clock} label="Ultimas 24h" value={stats.last_24h} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h3 className="font-medium text-gray-700 mb-3">Confianza Promedio</h3>
          <div className="flex items-end gap-2">
            <span className={`text-4xl font-bold ${
              stats.avg_confidence >= 0.8 ? 'text-green-600' :
              stats.avg_confidence >= 0.6 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {stats.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '-'}
            </span>
          </div>
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                stats.avg_confidence >= 0.8 ? 'bg-green-500' :
                stats.avg_confidence >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${(stats.avg_confidence || 0) * 100}%` }}
            />
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-medium text-gray-700 mb-3">Ultimos 7 dias</h3>
          <span className="text-4xl font-bold text-brand-600">{stats.last_7d ?? 0}</span>
          <p className="text-sm text-gray-500 mt-1">ordenes procesadas</p>
        </div>
        <div className="card p-5">
          <h3 className="font-medium text-gray-700 mb-3">Tokens Usados</h3>
          <span className="text-4xl font-bold text-gray-900">{data.usage.total_tokens ?? 0}</span>
          <p className="text-sm text-gray-500 mt-1">en los ultimos 30 dias</p>
        </div>
      </div>

      <OrdersTable orders={data.orders} />
    </div>
  );
}

function ViewerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/orders/stats').catch(() => ({ data: {} })),
      api.get('/orders?limit=5').catch(() => ({ data: [] })),
    ]).then(([stats, orders]) => {
      setData({ stats: stats.data || {}, orders: orders.data || [] });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>
        <p className="text-gray-500 mt-1">Vista general de ordenes procesadas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={FileText} label="Total Ordenes" value={stats.total} />
        <StatCard icon={CheckCircle} label="Validadas" value={stats.validated} color="green" />
        <StatCard icon={Clock} label="Ultimas 24h" value={stats.last_24h} color="blue" />
      </div>

      <OrdersTable orders={data.orders} />
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;

  if (role === 'super_admin') return <SuperAdminDashboard />;
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'operator') return <OperatorDashboard />;
  return <ViewerDashboard />;
}
