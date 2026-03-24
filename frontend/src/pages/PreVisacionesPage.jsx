import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Badge, Button, Callout,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
} from '@tremor/react';
import {
  ClipboardCheck, CheckCircle, XCircle, AlertTriangle, AlertCircle,
  ChevronLeft, ChevronRight, Search, RefreshCw, Eye, Clock,
  Filter, FileText,
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDIENTE: { color: 'gray', icon: Clock, label: 'Pendiente' },
  APROBADA: { color: 'green', icon: CheckCircle, label: 'Aprobada' },
  RECHAZADA: { color: 'red', icon: XCircle, label: 'Rechazada' },
};

function ConfidenceBadge({ value }) {
  if (value == null) return <Text className="text-xs text-gray-400">-</Text>;
  const pct = (value * 100).toFixed(0);
  const color = value >= 0.8 ? 'green' : value >= 0.6 ? 'amber' : 'red';
  return <Badge color={color}>{pct}%</Badge>;
}

export default function PreVisacionesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (estadoFilter) params.estado = estadoFilter;
      if (search) params.ci_paciente = search;

      const [listRes, statsRes] = await Promise.all([
        api.previsacion.list(params),
        api.previsacion.stats(),
      ]);
      setItems(listRes.data || []);
      setStats(statsRes.data);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [estadoFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pre-visaciones</h1>
          <Text>Revisar, aprobar o rechazar pre-visaciones generadas por IA</Text>
        </div>
        <Button variant="secondary" size="xs" onClick={load}>
          <RefreshCw className="w-3 h-3 mr-1" /> Actualizar
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card decoration="top" decorationColor="blue">
            <Text>Total</Text>
            <Metric>{stats.total_previsaciones ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="gray">
            <Text>Pendientes</Text>
            <Metric>{stats.pendientes ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="green">
            <Text>Aprobadas</Text>
            <Metric>{stats.aprobadas ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="red">
            <Text>Rechazadas</Text>
            <Metric>{stats.rechazadas ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="emerald">
            <Text>Confianza Prom.</Text>
            <Metric>
              {stats.confianza_promedio ? `${(stats.confianza_promedio * 100).toFixed(0)}%` : '-'}
            </Metric>
          </Card>
          <Card decoration="top" decorationColor="amber">
            <Text>Items Corregidos</Text>
            <Metric>{stats.items_corregidos ?? 0}</Metric>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Buscar por CI paciente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm py-2 px-3 bg-white focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="APROBADA">Aprobadas</option>
              <option value="RECHAZADA">Rechazadas</option>
            </select>
          </div>
          <Button size="xs" onClick={load}>Buscar</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <Text>No hay pre-visaciones{estadoFilter ? ` con estado ${estadoFilter}` : ''}</Text>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Paciente</TableHeaderCell>
                <TableHeaderCell>Prestador</TableHeaderCell>
                <TableHeaderCell>Items</TableHeaderCell>
                <TableHeaderCell>Confianza</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const sc = STATUS_CONFIG[item.estado] || STATUS_CONFIG.PENDIENTE;
                return (
                  <TableRow
                    key={item.id_visacion_previa}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/previsaciones/${item.id_visacion_previa}`)}
                  >
                    <TableCell>
                      <Text className="font-mono text-xs font-medium">#{item.id_visacion_previa}</Text>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Text className="font-medium">{item.nombre_paciente || '-'}</Text>
                        <Text className="text-xs text-gray-400">CI: {item.ci_paciente || '-'}</Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Text className="text-sm">{item.prestador_encontrado || item.prestador_nombre_original || '-'}</Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Text className="font-medium">{item.cantidad_items}</Text>
                        {Number(item.items_con_acuerdo) > 0 && (
                          <Badge color="emerald" size="xs">{item.items_con_acuerdo} c/acuerdo</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge value={item.confianza_general} />
                    </TableCell>
                    <TableCell>
                      <Badge color={sc.color} icon={sc.icon}>{sc.label}</Badge>
                      {item.requiere_revision && (
                        <Badge color="amber" size="xs" className="ml-1" icon={AlertTriangle}>Revisar</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Text className="text-xs">{new Date(item.created_at).toLocaleString()}</Text>
                      {item.fecha_orden && (
                        <Text className="text-xs text-gray-400">Orden: {item.fecha_orden}</Text>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/previsaciones/${item.id_visacion_previa}`);
                        }}
                      >
                        <Eye className="w-3 h-3 mr-1" /> Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
