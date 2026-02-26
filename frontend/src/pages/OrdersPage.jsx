import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Badge, Button, Grid,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
} from '@tremor/react';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => { load(); }, [page]);

  async function load() {
    setLoading(true);
    try {
      const [ordRes, statsRes] = await Promise.all([
        api.get(`/orders?page=${page}&limit=${limit}`),
        api.get('/orders/stats'),
      ]);
      setOrders(ordRes.data || []);
      setTotal(ordRes.total || 0);
      setStats(statsRes.data);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ordenes Procesadas</h1>
        <Text>Historico de ordenes medicas procesadas</Text>
      </div>

      {stats && (
        <Grid numItemsSm={3} numItemsLg={6} className="gap-3">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Validadas', value: stats.validated },
            { label: 'Con Correccion', value: stats.with_corrections },
            { label: 'Confianza Prom', value: stats.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '-' },
            { label: 'Ultimas 24h', value: stats.last_24h },
            { label: 'Ultimos 7d', value: stats.last_7d },
          ].map(({ label, value }) => (
            <Card key={label}>
              <Text className="text-xs">{label}</Text>
              <Metric className="text-xl mt-1">{value}</Metric>
            </Card>
          ))}
        </Grid>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>
      ) : orders.length === 0 ? (
        <Card className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <Text>No hay ordenes procesadas</Text>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Archivo</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Confianza</TableHeaderCell>
                  <TableHeaderCell>Modelo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell><Text className="font-medium truncate max-w-[200px]">{o.archivo_nombre}</Text></TableCell>
                    <TableCell><Text>{o.archivo_tipo}</Text></TableCell>
                    <TableCell>
                      <Badge color={
                        o.confianza_promedio >= 0.8 ? 'green' :
                        o.confianza_promedio >= 0.6 ? 'amber' : 'red'
                      }>
                        {o.confianza_promedio ? `${(o.confianza_promedio * 100).toFixed(0)}%` : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell><Text className="text-xs">{o.modelo_usado}</Text></TableCell>
                    <TableCell>
                      {o.validado ? (
                        <Badge color="green">Validado</Badge>
                      ) : o.requiere_correccion ? (
                        <Badge color="amber">Correccion</Badge>
                      ) : (
                        <Badge color="gray">Pendiente</Badge>
                      )}
                    </TableCell>
                    <TableCell><Text className="text-xs">{new Date(o.created_at).toLocaleString()}</Text></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Text className="text-xs">{total} resultados</Text>
              <div className="flex items-center gap-2">
                <Button size="xs" variant="secondary" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Text className="text-sm">{page} / {totalPages}</Text>
                <Button size="xs" variant="secondary" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
