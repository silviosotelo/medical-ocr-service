import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Badge, AreaChart,
  Flex, Grid, ProgressBar, Bold,
} from '@tremor/react';
import {
  FileText, Users, Key, TrendingUp, AlertCircle,
  Building2, Activity, CheckCircle, Clock, Shield, Database,
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, color = 'blue', sub }) {
  const iconColors = {
    blue: 'text-blue-500 bg-blue-50',
    green: 'text-green-500 bg-green-50',
    amber: 'text-amber-500 bg-amber-50',
    red: 'text-red-500 bg-red-50',
  };
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${iconColors[color] || iconColors.blue}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <Text className="truncate">{label}</Text>
          <Metric>{value ?? '-'}</Metric>
          {sub && <Text className="text-xs mt-0.5">{sub}</Text>}
        </div>
      </div>
    </Card>
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
        daily: (dailyRes.data || []).map((d) => ({ ...d, date: d.day })),
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
        <Text>Vista general de toda la plataforma</Text>
      </div>

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <StatCard icon={Building2} label="Tenants Activos" value={data.activeTenants} sub={`de ${data.totalTenants} total`} />
        <StatCard icon={Activity} label="Requests (30d)" value={data.usage.total_requests ?? 0} color="blue" />
        <StatCard icon={TrendingUp} label="Tokens Usados" value={data.usage.total_tokens ?? 0} color="green" />
        <StatCard icon={AlertCircle} label="Errores" value={data.usage.error_count ?? 0} color="red" />
      </Grid>

      <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Actividad Global (30 dias)</Title>
          {data.daily.length > 0 ? (
            <AreaChart
              className="mt-4 h-64"
              data={data.daily}
              index="date"
              categories={['requests']}
              colors={['blue']}
              valueFormatter={(v) => v.toLocaleString()}
              showAnimation
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <AlertCircle className="w-10 h-10 mb-2" />
              <Text>Sin datos de actividad</Text>
            </div>
          )}
        </Card>

        <Card>
          <Title>Tenants</Title>
          <div className="space-y-3 mt-4 max-h-[280px] overflow-y-auto">
            {data.tenants.length === 0 ? (
              <Text className="text-center py-8">No hay tenants registrados</Text>
            ) : (
              data.tenants.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Text className="font-medium truncate">{t.name}</Text>
                    <Text className="text-xs">{t.slug} - {t.plan}</Text>
                  </div>
                  <span className={`flex-shrink-0 w-2 h-2 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>
              ))
            )}
          </div>
        </Card>
      </Grid>

      <Grid numItemsSm={1} numItemsLg={3} className="gap-4">
        <Card>
          <Flex alignItems="start">
            <div>
              <Text>Performance</Text>
              <Metric className="text-lg">{data.usage.avg_processing_ms ?? '-'}ms</Metric>
            </div>
            <Shield className="w-5 h-5 text-gray-400" />
          </Flex>
          <Text className="mt-2 text-xs">{data.usage.active_days ?? 0} dias activos</Text>
        </Card>
        <Card>
          <Flex alignItems="start">
            <div>
              <Text>Procesamiento</Text>
              <Metric className="text-lg">{data.usage.orders_processed ?? 0}</Metric>
            </div>
            <FileText className="w-5 h-5 text-gray-400" />
          </Flex>
          <Text className="mt-2 text-xs">{data.usage.pre_visaciones ?? 0} pre-visaciones</Text>
        </Card>
        <Card>
          <Flex alignItems="start">
            <div>
              <Text>Almacenamiento</Text>
              <Metric className="text-lg">
                {data.usage.total_bytes ? `${(data.usage.total_bytes / 1024 / 1024).toFixed(1)}MB` : '0'}
              </Metric>
            </div>
            <Database className="w-5 h-5 text-gray-400" />
          </Flex>
        </Card>
      </Grid>
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
      setData({
        ...dash.data,
        usage: usage.data,
        daily: (daily.data || []).map((d) => ({ ...d, date: d.day })),
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

  const stats = data?.stats || {};
  const usage = data?.usage || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Text>Administracion de tu organizacion</Text>
      </div>

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <StatCard icon={FileText} label="Ordenes Procesadas" value={stats.total_orders} />
        <StatCard icon={TrendingUp} label="Este Mes" value={stats.orders_this_month} color="green" />
        <StatCard icon={Users} label="Usuarios" value={stats.user_count} color="amber" />
        <StatCard icon={Key} label="API Keys Activas" value={stats.active_keys} />
      </Grid>

      <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Actividad (30 dias)</Title>
          {data.daily.length > 0 ? (
            <AreaChart
              className="mt-4 h-64"
              data={data.daily}
              index="date"
              categories={['requests']}
              colors={['blue']}
              showAnimation
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <AlertCircle className="w-10 h-10 mb-2" />
              <Text>Sin datos</Text>
            </div>
          )}
        </Card>

        <Card>
          <Title>Datos Cargados</Title>
          <div className="space-y-4 mt-4">
            <Flex><Text>Prestadores</Text><Text><Bold>{stats.prestadores_count ?? 0}</Bold></Text></Flex>
            <Flex><Text>Nomencladores</Text><Text><Bold>{stats.nomencladores_count ?? 0}</Bold></Text></Flex>
            <Flex><Text>Acuerdos</Text><Text><Bold>{stats.acuerdos_count ?? 0}</Bold></Text></Flex>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <Text className="font-medium mb-3">Uso del periodo</Text>
            <Grid numItemsSm={2} className="gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <Text className="text-xs">Requests</Text>
                <Metric className="text-lg">{usage.total_requests ?? 0}</Metric>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <Text className="text-xs">Tokens</Text>
                <Metric className="text-lg">{usage.total_tokens ?? 0}</Metric>
              </div>
            </Grid>
          </div>
        </Card>
      </Grid>
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
        <Text>Procesamiento y validacion de ordenes</Text>
      </div>

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <StatCard icon={FileText} label="Total Ordenes" value={stats.total} />
        <StatCard icon={CheckCircle} label="Validadas" value={stats.validated} color="green" />
        <StatCard icon={AlertCircle} label="Con Correcciones" value={stats.with_corrections} color="amber" />
        <StatCard icon={Clock} label="Ultimas 24h" value={stats.last_24h} color="blue" />
      </Grid>

      <Grid numItemsSm={1} numItemsLg={3} className="gap-4">
        <Card>
          <Text>Confianza Promedio</Text>
          <Metric className={
            stats.avg_confidence >= 0.8 ? 'text-green-600' :
            stats.avg_confidence >= 0.6 ? 'text-amber-600' : 'text-red-600'
          }>
            {stats.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '-'}
          </Metric>
          <ProgressBar
            value={(stats.avg_confidence || 0) * 100}
            color={stats.avg_confidence >= 0.8 ? 'green' : stats.avg_confidence >= 0.6 ? 'amber' : 'red'}
            className="mt-3"
          />
        </Card>
        <Card>
          <Text>Ultimos 7 dias</Text>
          <Metric>{stats.last_7d ?? 0}</Metric>
          <Text className="mt-1 text-xs">ordenes procesadas</Text>
        </Card>
        <Card>
          <Text>Tokens Usados</Text>
          <Metric>{data.usage.total_tokens ?? 0}</Metric>
          <Text className="mt-1 text-xs">en los ultimos 30 dias</Text>
        </Card>
      </Grid>
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
        <Text>Vista general de ordenes procesadas</Text>
      </div>

      <Grid numItemsSm={2} numItemsLg={3} className="gap-4">
        <StatCard icon={FileText} label="Total Ordenes" value={stats.total} />
        <StatCard icon={CheckCircle} label="Validadas" value={stats.validated} color="green" />
        <StatCard icon={Clock} label="Ultimas 24h" value={stats.last_24h} color="blue" />
      </Grid>
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
