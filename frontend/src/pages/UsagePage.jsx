import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BarChart3 } from 'lucide-react';

export default function UsagePage() {
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/usage/summary').catch(() => ({ data: {} })),
      api.get('/usage/daily').catch(() => ({ data: [] })),
      api.get('/usage/quota').catch(() => ({ data: {} })),
    ]).then(([s, d, q]) => {
      setSummary(s.data);
      setDaily(d.data || []);
      setQuota(q.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  }

  const quotaPct = quota?.limit ? Math.round((quota.used / quota.limit) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Uso y Metricas</h1>
        <p className="text-gray-500 mt-1">Consumo y estadisticas de la plataforma</p>
      </div>

      {quota && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Cuota Mensual</h2>
            <span className="text-sm text-gray-500">{quota.used} / {quota.limit} ordenes</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${quotaPct > 90 ? 'bg-red-500' : quotaPct > 70 ? 'bg-amber-500' : 'bg-brand-600'}`}
              style={{ width: `${Math.min(100, quotaPct)}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">{quota.remaining} ordenes restantes</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: summary?.total_requests },
          { label: 'Total Tokens', value: summary?.total_tokens ? Number(summary.total_tokens).toLocaleString() : '0' },
          { label: 'Tiempo Prom (ms)', value: summary?.avg_processing_ms },
          { label: 'Errores', value: summary?.error_count },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Requests Diarios (30 dias)</h2>
        {daily.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="requests" fill="#1a73f5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <BarChart3 className="w-10 h-10 mb-2" />
            <p>Sin datos</p>
          </div>
        )}
      </div>
    </div>
  );
}
