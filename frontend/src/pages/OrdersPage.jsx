import { useState, useEffect } from 'react';
import { api } from '../lib/api';
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
        <p className="text-gray-500 mt-1">Historico de ordenes medicas procesadas</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Validadas', value: stats.validated },
            { label: 'Con Correccion', value: stats.with_corrections },
            { label: 'Confianza Prom', value: stats.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '-' },
            { label: 'Ultimas 24h', value: stats.last_24h },
            { label: 'Ultimos 7d', value: stats.last_7d },
          ].map(({ label, value }) => (
            <div key={label} className="card p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay ordenes procesadas</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Archivo</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Confianza</th>
                  <th className="px-5 py-3 font-medium">Modelo</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 max-w-[200px] truncate">{o.archivo_nombre}</td>
                    <td className="px-5 py-3 text-gray-600">{o.archivo_tipo}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        o.confianza_promedio >= 0.8 ? 'bg-green-50 text-green-700' :
                        o.confianza_promedio >= 0.6 ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {o.confianza_promedio ? `${(o.confianza_promedio * 100).toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{o.modelo_usado}</td>
                    <td className="px-5 py-3">
                      {o.validado ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Validado</span>
                      ) : o.requiere_correccion ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">Correccion</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Pendiente</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{total} resultados</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary p-2 disabled:opacity-40">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="btn-secondary p-2 disabled:opacity-40">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
