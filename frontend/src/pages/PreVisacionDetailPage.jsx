import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Card, Title, Text, Badge, Button, Callout,
} from '@tremor/react';
import {
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, AlertCircle,
  User, Building2, Stethoscope, FileText, Activity,
  Clock, Eye, ChevronDown, ChevronUp, Sparkles, Shield,
  DollarSign, Hash, Clipboard, Star, RefreshCw,
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDIENTE: { color: 'gray', bg: 'bg-gray-100 text-gray-700', label: 'Pendiente', icon: Clock },
  APROBADA: { color: 'green', bg: 'bg-green-100 text-green-700', label: 'Aprobada', icon: CheckCircle },
  RECHAZADA: { color: 'red', bg: 'bg-red-100 text-red-700', label: 'Rechazada', icon: XCircle },
};

function ConfidenceBar({ value, size = 'md' }) {
  if (value == null) return <span className="text-gray-400 text-xs">-</span>;
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? 'bg-green-500' : value >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = value >= 0.8 ? 'text-green-700' : value >= 0.6 ? 'text-amber-700' : 'text-red-700';
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} bg-gray-200 rounded-full overflow-hidden max-w-[100px]`}>
        <div className={`${h} ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{pct}%</span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <Text className="text-xs text-gray-500">{label}</Text>
        <p className="text-sm font-medium text-gray-900 break-words">{value || '-'}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        {Icon && <Icon className="w-4 h-4 text-brand-600" />}
        <span className="font-semibold text-sm text-gray-900 flex-1 text-left">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function DetalleItem({ det, index, onCorregir }) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const alternatives = det.matches_alternativos;
  const hasAlternatives = alternatives && (Array.isArray(alternatives) ? alternatives.length > 0 : Object.keys(alternatives).length > 0);
  const altList = Array.isArray(alternatives) ? alternatives : [];
  const isCorregido = det.estado === 'CORREGIDO';

  return (
    <div className={`border rounded-lg p-4 ${isCorregido ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
            {det.item || index + 1}
          </span>
          <div>
            <p className="font-medium text-gray-900 text-sm">{det.descripcion_original}</p>
            <p className="text-xs text-gray-500">Cantidad: {det.cantidad}</p>
          </div>
        </div>
        <ConfidenceBar value={det.nomenclador_confianza} size="sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Nomenclador sugerido */}
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Nomenclador Sugerido por IA</span>
          </div>
          <p className="text-sm font-medium text-gray-900">{det.nomenclador_descripcion || det.nomenclador_descripcion_full || '-'}</p>
          {det.nomenclador_id_externo && (
            <p className="text-xs text-gray-500 mt-1">Codigo: {det.nomenclador_id_externo}</p>
          )}
          {det.nomenclador_especialidad && (
            <Badge color="blue" size="xs" className="mt-1">{det.nomenclador_especialidad}</Badge>
          )}
        </div>

        {/* Prestador ejecutor */}
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs font-semibold text-purple-700">Prestador Ejecutor</span>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {det.prestador_ejecutor_nombre_completo || det.prestador_ejecutor_nombre || '-'}
          </p>
          {det.prestador_ejecutor_original && det.prestador_ejecutor_original !== det.prestador_ejecutor_nombre && (
            <p className="text-xs text-gray-500 mt-1">Original: {det.prestador_ejecutor_original}</p>
          )}
          {det.prestador_ejecutor_id_externo && (
            <p className="text-xs text-gray-500">ID: {det.prestador_ejecutor_id_externo}</p>
          )}
        </div>
      </div>

      {/* Acuerdo */}
      {det.tiene_acuerdo && (
        <div className="mt-3 flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-emerald-700 font-medium">
            Acuerdo encontrado - Precio: {det.precio_acuerdo != null ? `$${Number(det.precio_acuerdo).toLocaleString()}` : 'N/D'}
          </span>
        </div>
      )}

      {/* Correccion */}
      {isCorregido && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Corregido</span>
          </div>
          {det.nomenclador_corregido_id_externo && (
            <p className="text-sm text-gray-900">Nomenclador corregido: {det.nomenclador_corregido_id_externo}</p>
          )}
          {det.observacion_correccion && (
            <p className="text-xs text-gray-600 mt-1">{det.observacion_correccion}</p>
          )}
        </div>
      )}

      {/* Observaciones */}
      {det.observaciones && (
        <div className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          <span className="text-xs font-semibold text-gray-500 block mb-1">Observaciones:</span>
          {det.observaciones}
        </div>
      )}

      {/* Matches alternativos */}
      {hasAlternatives && (
        <div className="mt-3">
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1"
          >
            {showAlternatives ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAlternatives ? 'Ocultar' : 'Ver'} matches alternativos ({altList.length})
          </button>
          {showAlternatives && (
            <div className="mt-2 space-y-1">
              {altList.map((alt, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{alt.descripcion || alt.nombre || `Match ${i + 1}`}</span>
                    {alt.id_externo && <span className="text-gray-400">({alt.id_externo})</span>}
                    {alt.especialidad && <Badge color="gray" size="xs">{alt.especialidad}</Badge>}
                    {alt.tiene_acuerdo && <Badge color="emerald" size="xs">Acuerdo</Badge>}
                  </div>
                  <ConfidenceBar value={alt.similitud || alt.similarity || alt.confianza || alt.score} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PreVisacionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [showRechazoForm, setShowRechazoForm] = useState(false);
  const [showRawIA, setShowRawIA] = useState(false);

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.previsacion.get(id);
      setData(res.data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadDetail(); }, [id]);

  async function handleAprobar() {
    setActionLoading(true);
    setActionResult(null);
    try {
      await api.previsacion.aprobar(id, user?.email || user?.name || 'portal');
      setActionResult({ success: true, message: 'Pre-visacion aprobada exitosamente' });
      loadDetail();
    } catch (err) {
      setActionResult({ success: false, message: err.message });
    }
    setActionLoading(false);
  }

  async function handleRechazar() {
    if (!motivoRechazo.trim()) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      await api.previsacion.rechazar(id, user?.email || user?.name || 'portal', motivoRechazo);
      setActionResult({ success: true, message: 'Pre-visacion rechazada' });
      setShowRechazoForm(false);
      loadDetail();
    } catch (err) {
      setActionResult({ success: false, message: err.message });
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="light" onClick={() => navigate('/previsaciones')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <Callout title="Error" color="red" icon={AlertCircle}>{error}</Callout>
      </div>
    );
  }

  if (!data) return null;

  const { cabecera: cab, detalles } = data;
  const sc = STATUS_CONFIG[cab.estado] || STATUS_CONFIG.PENDIENTE;
  const isPendiente = cab.estado === 'PENDIENTE';

  // Parse resultado_ia_completo
  let resultadoIA = null;
  try {
    resultadoIA = typeof cab.resultado_ia_completo === 'string'
      ? JSON.parse(cab.resultado_ia_completo)
      : cab.resultado_ia_completo;
  } catch { /* ignore */ }

  const alertas = cab.alertas_ia || resultadoIA?.alertas_ia || [];
  const metadatos = resultadoIA?.metadatos_ia || resultadoIA?.metadata || {};

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="light" onClick={() => navigate('/previsaciones')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Pre-visacion #{cab.id_visacion_previa}
              <Badge color={sc.color} icon={sc.icon}>{sc.label}</Badge>
            </h1>
            <Text className="text-xs text-gray-500">
              Creada: {new Date(cab.created_at).toLocaleString()}
              {cab.archivo_nombre && ` | Archivo: ${cab.archivo_nombre}`}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="xs" onClick={loadDetail}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refrescar
          </Button>
        </div>
      </div>

      {/* Alert bar for revision required */}
      {cab.requiere_revision && (
        <Callout title="Requiere revision manual" color="amber" icon={AlertTriangle}>
          Esta pre-visacion fue marcada para revision por la IA debido a baja confianza o datos incompletos.
        </Callout>
      )}

      {actionResult && (
        <Callout
          title={actionResult.success ? 'Exito' : 'Error'}
          color={actionResult.success ? 'green' : 'red'}
          icon={actionResult.success ? CheckCircle : AlertCircle}
        >
          {actionResult.message}
        </Callout>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Order image / document + actions */}
        <div className="lg:col-span-1 space-y-4">
          {/* Document preview */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-brand-600" />
              <Title className="text-sm">Orden Medica</Title>
            </div>
            {cab.archivo_url ? (
              <div className="border rounded-lg overflow-hidden bg-gray-100">
                {cab.archivo_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || cab.archivo_nombre?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  <img
                    src={cab.archivo_url}
                    alt="Orden medica"
                    className="w-full h-auto max-h-[500px] object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <FileText className="w-12 h-12 mb-2" />
                    <Text>Documento PDF</Text>
                    <a
                      href={cab.archivo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 text-sm mt-2 hover:underline"
                    >
                      Abrir documento
                    </a>
                  </div>
                )}
                <div className="hidden flex-col items-center justify-center py-8 text-gray-400">
                  <FileText className="w-12 h-12 mb-2" />
                  <Text>No se pudo cargar la imagen</Text>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <FileText className="w-12 h-12 mb-2" />
                <Text>Documento no disponible para visualizacion</Text>
                {cab.archivo_nombre && (
                  <Text className="text-xs mt-1">{cab.archivo_nombre}</Text>
                )}
              </div>
            )}
          </Card>

          {/* Confianza general */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-brand-600" />
              <Title className="text-sm">Confianza General</Title>
            </div>
            <div className="text-center py-3">
              <div className="text-3xl font-bold" style={{
                color: cab.confianza_general >= 0.8 ? '#059669' : cab.confianza_general >= 0.6 ? '#d97706' : '#dc2626'
              }}>
                {cab.confianza_general ? `${(cab.confianza_general * 100).toFixed(0)}%` : '-'}
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-3 rounded-full ${
                    cab.confianza_general >= 0.8 ? 'bg-green-500' : cab.confianza_general >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(cab.confianza_general || 0) * 100}%` }}
                />
              </div>
            </div>
            {metadatos.legibilidad && (
              <div className="mt-2 text-center">
                <Badge color={metadatos.legibilidad === 'ALTA' ? 'green' : metadatos.legibilidad === 'MEDIA' ? 'amber' : 'red'}>
                  Legibilidad: {metadatos.legibilidad}
                </Badge>
              </div>
            )}
          </Card>

          {/* Actions */}
          {isPendiente && (
            <Card>
              <Title className="text-sm mb-3">Acciones</Title>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  color="green"
                  loading={actionLoading}
                  onClick={handleAprobar}
                >
                  <CheckCircle className="w-4 h-4 mr-2" /> Aprobar Pre-visacion
                </Button>
                {!showRechazoForm ? (
                  <Button
                    className="w-full"
                    color="red"
                    variant="secondary"
                    onClick={() => setShowRechazoForm(true)}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Rechazar
                  </Button>
                ) : (
                  <div className="space-y-2 bg-red-50 rounded-lg p-3">
                    <textarea
                      className="w-full border border-red-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-red-500"
                      placeholder="Motivo del rechazo (requerido)..."
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="xs" color="red" loading={actionLoading} onClick={handleRechazar} disabled={!motivoRechazo.trim()}>
                        Confirmar Rechazo
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => setShowRechazoForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Approval/rejection info */}
          {cab.estado === 'APROBADA' && (
            <Card>
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-semibold text-sm">Aprobada</p>
                  <p className="text-xs text-gray-500">
                    Por: {cab.aprobada_por} | {cab.aprobada_en && new Date(cab.aprobada_en).toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          )}
          {cab.estado === 'RECHAZADA' && (
            <Card>
              <div className="flex items-center gap-2 text-red-700">
                <XCircle className="w-5 h-5" />
                <div>
                  <p className="font-semibold text-sm">Rechazada</p>
                  <p className="text-xs text-gray-500">
                    Por: {cab.rechazada_por} | {cab.rechazada_en && new Date(cab.rechazada_en).toLocaleString()}
                  </p>
                  {cab.motivo_rechazo && <p className="text-sm mt-1">{cab.motivo_rechazo}</p>}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: All data */}
        <div className="lg:col-span-2 space-y-4">
          {/* Datos del Paciente */}
          <Section title="Datos del Paciente" icon={User}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={User} label="Nombre" value={cab.nombre_paciente} />
              <InfoRow icon={Hash} label="CI / Documento" value={cab.ci_paciente} />
              {resultadoIA?.paciente?.numero_afiliado && (
                <InfoRow icon={Clipboard} label="Nro. Afiliado" value={resultadoIA.paciente.numero_afiliado} />
              )}
              {resultadoIA?.paciente?.edad && (
                <InfoRow label="Edad / Sexo" value={`${resultadoIA.paciente.edad} anios${resultadoIA.paciente.sexo ? ` - ${resultadoIA.paciente.sexo}` : ''}`} />
              )}
              <InfoRow icon={Clock} label="Fecha Orden" value={cab.fecha_orden || '-'} />
            </div>
          </Section>

          {/* Prestador */}
          <Section title="Prestador / Institucion" icon={Building2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={Building2} label="Nombre Original (orden)" value={cab.prestador_nombre_original} />
              <InfoRow icon={Star} label="Prestador Encontrado" value={cab.prestador_nombre}
                sub={cab.prestador_id_externo ? `ID: ${cab.prestador_id_externo}` : null} />
              {cab.prestador_ruc && <InfoRow label="RUC" value={cab.prestador_ruc} />}
              <InfoRow label="Confianza Match" value={
                cab.prestador_confianza != null
                  ? <ConfidenceBar value={cab.prestador_confianza} />
                  : '-'
              } />
            </div>
          </Section>

          {/* Medico */}
          <Section title="Medico Solicitante" icon={Stethoscope}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={Stethoscope} label="Nombre" value={cab.medico_nombre} />
              <InfoRow icon={Hash} label="Matricula" value={cab.medico_matricula} />
              {resultadoIA?.medico_solicitante?.especialidad && (
                <InfoRow label="Especialidad" value={resultadoIA.medico_solicitante.especialidad} />
              )}
            </div>
          </Section>

          {/* Diagnostico */}
          <Section title="Diagnostico" icon={Activity}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={FileText} label="Descripcion" value={cab.diagnostico_texto} />
              <InfoRow icon={Hash} label="Codigo CIE-10" value={cab.diagnostico_codigo_cie} />
            </div>
          </Section>

          {/* Alertas IA */}
          {alertas.length > 0 && (
            <Section title={`Alertas de IA (${alertas.length})`} icon={AlertTriangle} defaultOpen={true}>
              <div className="space-y-2">
                {alertas.map((alerta, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      {typeof alerta === 'string' ? alerta : alerta.mensaje || alerta.message || JSON.stringify(alerta)}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Observaciones IA */}
          {cab.observaciones_ia && (
            <Section title="Observaciones de la IA" icon={Sparkles} defaultOpen={true}>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 whitespace-pre-wrap">{cab.observaciones_ia}</p>
              </div>
            </Section>
          )}

          {/* Metadatos IA */}
          {metadatos && Object.keys(metadatos).length > 0 && (
            <Section title="Metadatos del Procesamiento IA" icon={Shield} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {metadatos.legibilidad && <InfoRow label="Legibilidad" value={metadatos.legibilidad} />}
                {metadatos.es_urgente != null && (
                  <InfoRow label="Urgente" value={metadatos.es_urgente ? 'SI' : 'No'} />
                )}
                {metadatos.tipo_escritura && <InfoRow label="Tipo Escritura" value={metadatos.tipo_escritura} />}
                {metadatos.modelo && <InfoRow label="Modelo" value={metadatos.modelo} />}
                {metadatos.tokens_usados && <InfoRow label="Tokens Usados" value={metadatos.tokens_usados} />}
                {metadatos.tiempo_procesamiento_ms && (
                  <InfoRow label="Tiempo Procesamiento" value={`${metadatos.tiempo_procesamiento_ms}ms`} />
                )}
                {metadatos.confianza_ia != null && (
                  <InfoRow label="Confianza IA" value={<ConfidenceBar value={metadatos.confianza_ia} />} />
                )}
                {metadatos.confianza_general != null && (
                  <InfoRow label="Confianza General" value={<ConfidenceBar value={metadatos.confianza_general} />} />
                )}
              </div>
              {metadatos.advertencias && metadatos.advertencias.length > 0 && (
                <div className="mt-3">
                  <Text className="text-xs font-semibold text-gray-500 mb-1">Advertencias:</Text>
                  <div className="space-y-1">
                    {metadatos.advertencias.map((adv, i) => (
                      <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{adv}</div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Detalles - Practicas */}
          <Section title={`Practicas Solicitadas (${detalles.length})`} icon={Clipboard} defaultOpen={true}>
            <div className="space-y-3">
              {detalles.length === 0 ? (
                <Text className="text-center py-4 text-gray-400">No hay practicas registradas</Text>
              ) : (
                detalles.map((det, i) => <DetalleItem key={det.id_det_previa || i} det={det} index={i} />)
              )}
            </div>
          </Section>

          {/* Resultado IA completo (raw) */}
          {resultadoIA && (
            <Section title="Resultado IA Completo (raw)" icon={Eye} defaultOpen={false}>
              <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[500px]">
                <pre className="text-xs text-green-400 whitespace-pre-wrap">
                  {JSON.stringify(resultadoIA, null, 2)}
                </pre>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
