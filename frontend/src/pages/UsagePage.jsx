import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Grid, BarChart, ProgressBar,
} from '@tremor/react';
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
      setDaily((d.data || []).map((item) => ({ ...item, date: item.day })));
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
        <Text>Consumo y estadisticas de la plataforma</Text>
      </div>

      {quota && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <Title>Cuota Mensual</Title>
            <Text>{quota.used} / {quota.limit} ordenes</Text>
          </div>
          <ProgressBar
            value={Math.min(100, quotaPct)}
            color={quotaPct > 90 ? 'red' : quotaPct > 70 ? 'amber' : 'blue'}
          />
          <Text className="mt-2 text-xs">{quota.remaining} ordenes restantes</Text>
        </Card>
      )}

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        {[
          { label: 'Total Requests', value: summary?.total_requests },
          { label: 'Total Tokens', value: summary?.total_tokens ? Number(summary.total_tokens).toLocaleString() : '0' },
          { label: 'Tiempo Prom (ms)', value: summary?.avg_processing_ms },
          { label: 'Errores', value: summary?.error_count },
        ].map(({ label, value }) => (
          <Card key={label}>
            <Text className="text-xs">{label}</Text>
            <Metric className="text-xl mt-1">{value ?? 0}</Metric>
          </Card>
        ))}
      </Grid>

      <Card>
        <Title>Requests Diarios (30 dias)</Title>
        {daily.length > 0 ? (
          <BarChart
            className="mt-4 h-72"
            data={daily}
            index="date"
            categories={['requests']}
            colors={['blue']}
            valueFormatter={(v) => v.toLocaleString()}
            showAnimation
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <BarChart3 className="w-10 h-10 mb-2" />
            <Text>Sin datos</Text>
          </div>
        )}
      </Card>
    </div>
  );
}
