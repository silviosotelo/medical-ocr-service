import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Badge, Button, Callout,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
  TextInput, Select, SelectItem,
} from '@tremor/react';
import {
  ClipboardCheck, CheckCircle, XCircle, Edit3, AlertCircle,
  ChevronLeft, ChevronRight, Search, RefreshCw,
} from 'lucide-react';

const STATUS_COLORS = {
  pendiente: 'gray',
  aprobada: 'green',
  rechazada: 'red',
  corregida: 'amber',
};

function FeedbackModal({ visacion, onClose, onSubmitted }) {
  const [accion, setAccion] = useState('APROBAR');
  const [motivo, setMotivo] = useState('');
  const [corrections, setCorrections] = useState([{ nro_item: 1, campo: '', valor_correcto: '' }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function addCorrection() {
    setCorrections((prev) => [...prev, { nro_item: prev.length + 1, campo: '', valor_correcto: '' }]);
  }

  function updateCorrection(index, field, value) {
    setCorrections((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function removeCorrection(index) {
    setCorrections((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const body = { accion, motivo: motivo || undefined };
      if (accion === 'CORREGIR') {
        body.correcciones = corrections.filter((c) => c.campo && c.valor_correcto);
      }
      await api.feedback.submit(visacion.id, body);
      setResult({ success: true });
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1000);
    } catch (err) {
      setResult({ success: false, message: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Title>Feedback de Pre-visacion</Title>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <Text className="font-medium">Visacion #{visacion.id?.slice(0, 8)}</Text>
          {visacion.archivo_nombre && <Text className="text-xs mt-1">{visacion.archivo_nombre}</Text>}
        </div>

        <div>
          <Text className="font-medium mb-2">Accion</Text>
          <div className="flex gap-2">
            {['APROBAR', 'RECHAZAR', 'CORREGIR'].map((a) => (
              <button
                key={a}
                onClick={() => setAccion(a)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  accion === a
                    ? a === 'APROBAR' ? 'bg-green-50 border-green-300 text-green-700'
                    : a === 'RECHAZAR' ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a === 'APROBAR' && <CheckCircle className="w-4 h-4 inline mr-1" />}
                {a === 'RECHAZAR' && <XCircle className="w-4 h-4 inline mr-1" />}
                {a === 'CORREGIR' && <Edit3 className="w-4 h-4 inline mr-1" />}
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Text className="font-medium mb-2">Motivo (opcional)</Text>
          <TextInput
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo del feedback..."
          />
        </div>

        {accion === 'CORREGIR' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Text className="font-medium">Correcciones</Text>
              <Button size="xs" variant="secondary" onClick={addCorrection}>+ Agregar</Button>
            </div>
            <div className="space-y-2">
              {corrections.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="number"
                    className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    value={c.nro_item}
                    onChange={(e) => updateCorrection(i, 'nro_item', parseInt(e.target.value) || 1)}
                    min={1}
                    placeholder="#"
                  />
                  <input
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    value={c.campo}
                    onChange={(e) => updateCorrection(i, 'campo', e.target.value)}
                    placeholder="Campo (ej: id_nomenclador)"
                  />
                  <input
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    value={c.valor_correcto}
                    onChange={(e) => updateCorrection(i, 'valor_correcto', e.target.value)}
                    placeholder="Valor correcto"
                  />
                  {corrections.length > 1 && (
                    <button onClick={() => removeCorrection(i)} className="text-red-400 hover:text-red-600 text-sm">
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <Callout
            title={result.success ? 'Feedback enviado' : 'Error'}
            color={result.success ? 'green' : 'red'}
            icon={result.success ? CheckCircle : AlertCircle}
          >
            {result.success ? 'El feedback se registro correctamente' : result.message}
          </Callout>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={loading} onClick={handleSubmit}>
            Enviar Feedback
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PreVisacionesPage() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedVisacion, setSelectedVisacion] = useState(null);
  const limit = 20;

  async function load() {
    setLoading(true);
    try {
      const [ordRes, statsRes] = await Promise.all([
        api.get(`/orders?page=${page}&limit=${limit}${search ? `&search=${search}` : ''}`),
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

  useEffect(() => { load(); }, [page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pre-visaciones</h1>
          <Text>Revisar, aprobar, rechazar o corregir pre-visaciones generadas por IA</Text>
        </div>
        <Button variant="secondary" size="xs" onClick={load}>
          <RefreshCw className="w-3 h-3 mr-1" />
          Actualizar
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card decoration="top" decorationColor="blue">
            <Text>Total Procesadas</Text>
            <Metric>{stats.total ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="green">
            <Text>Validadas</Text>
            <Metric>{stats.validated ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="amber">
            <Text>Con Correcciones</Text>
            <Metric>{stats.with_corrections ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="emerald">
            <Text>Confianza Promedio</Text>
            <Metric>
              {stats.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '-'}
            </Metric>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Buscar por archivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <Button size="xs" onClick={load}>Buscar</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <Text>No hay ordenes procesadas</Text>
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Archivo</TableHeaderCell>
                  <TableHeaderCell>Confianza</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                  <TableHeaderCell>Acciones</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Text className="font-medium">{order.archivo_nombre}</Text>
                      <Text className="text-xs text-gray-400">{order.archivo_tipo}</Text>
                    </TableCell>
                    <TableCell>
                      <Badge color={
                        order.confianza_promedio >= 0.8 ? 'green' :
                        order.confianza_promedio >= 0.6 ? 'amber' : 'red'
                      }>
                        {order.confianza_promedio ? `${(order.confianza_promedio * 100).toFixed(0)}%` : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.validado ? (
                        <Badge color="green" icon={CheckCircle}>Validado</Badge>
                      ) : order.requiere_correccion ? (
                        <Badge color="amber" icon={Edit3}>Correccion</Badge>
                      ) : (
                        <Badge color="gray">Pendiente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Text className="text-xs">{new Date(order.created_at).toLocaleString()}</Text>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => setSelectedVisacion(order)}
                      >
                        <ClipboardCheck className="w-3 h-3 mr-1" />
                        Feedback
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
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
      </Card>

      {selectedVisacion && (
        <FeedbackModal
          visacion={selectedVisacion}
          onClose={() => setSelectedVisacion(null)}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
