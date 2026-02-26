import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Badge, Button, Callout,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
  ProgressBar, TextInput,
} from '@tremor/react';
import { Send, FileText, RefreshCw, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';

function BatchSubmitForm({ onSubmitted }) {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const placeholder = `{
  "ordenes": [
    {
      "archivo_base64": "<base64 del PDF/imagen>",
      "archivo_nombre": "orden_001.pdf",
      "archivo_tipo": "application/pdf",
      "metadata": {
        "paciente": "Juan Perez",
        "documento": "12345678"
      }
    }
  ],
  "webhook_url": "https://tu-servidor.com/webhook",
  "prioridad": "normal"
}`;

  async function handleSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const data = JSON.parse(json);
      const res = await api.ordenesBatch.submit(data);
      setResult({ success: true, data: res.data });
      if (onSubmitted && res.data?.batch_id) {
        onSubmitted(res.data.batch_id);
      }
    } catch (err) {
      setResult({ success: false, message: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <Title>Enviar Batch de Ordenes</Title>
        <Text className="mt-1">
          Hasta 50 ordenes por batch. Archivos en base64 (max 10MB cada uno).
          Las ordenes se procesan con GPT-4o Vision y generan pre-visaciones automaticas.
        </Text>
        <div className="mt-4">
          <textarea
            className="w-full font-mono text-xs border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            rows={12}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={placeholder}
          />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Button loading={loading} onClick={handleSubmit} disabled={!json.trim()}>
            <Send className="w-4 h-4 mr-2" />
            Enviar Batch
          </Button>
          {json.trim() && <Text className="text-gray-400 text-xs">{json.length} chars</Text>}
        </div>
      </Card>
      {result && (
        <Callout
          title={result.success ? 'Batch enviado correctamente' : 'Error al enviar batch'}
          color={result.success ? 'green' : 'red'}
          icon={result.success ? CheckCircle : AlertCircle}
        >
          {result.success
            ? `Batch ID: ${result.data?.batch_id} - ${result.data?.ordenes_recibidas || 0} ordenes en cola`
            : result.message}
        </Callout>
      )}
    </div>
  );
}

function BatchTracker({ batchId, onClear }) {
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!batchId) return;
    let timer;
    async function poll() {
      try {
        const res = await api.ordenesBatch.status(batchId);
        setBatch(res.data);
        setLoading(false);
        const allDone = res.data?.jobs?.every(
          (j) => j.estado === 'completado' || j.estado === 'fallido'
        );
        if (allDone) setAutoRefresh(false);
      } catch {
        setLoading(false);
        setAutoRefresh(false);
      }
    }
    poll();
    if (autoRefresh) {
      timer = setInterval(poll, 3000);
    }
    return () => clearInterval(timer);
  }, [batchId, autoRefresh]);

  if (loading) {
    return (
      <Card className="mt-4">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
          <Text>Cargando estado del batch...</Text>
        </div>
      </Card>
    );
  }

  if (!batch) return null;

  const completados = batch.jobs?.filter((j) => j.estado === 'completado').length || 0;
  const fallidos = batch.jobs?.filter((j) => j.estado === 'fallido').length || 0;
  const total = batch.jobs?.length || 0;
  const progress = total > 0 ? ((completados + fallidos) / total) * 100 : 0;

  const statusColors = {
    pendiente: 'gray',
    procesando: 'blue',
    completado: 'green',
    fallido: 'red',
  };

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between">
        <div>
          <Title>Batch: {batchId.slice(0, 12)}...</Title>
          <Text className="mt-1">{completados} completados, {fallidos} fallidos de {total} total</Text>
        </div>
        <div className="flex items-center gap-2">
          {autoRefresh && (
            <Badge color="blue" icon={RefreshCw}>Auto-refresh</Badge>
          )}
          <Button size="xs" variant="secondary" onClick={onClear}>Cerrar</Button>
        </div>
      </div>
      <ProgressBar value={progress} className="mt-4" color={fallidos > 0 ? 'amber' : 'blue'} />
      {batch.jobs && batch.jobs.length > 0 && (
        <Table className="mt-4">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Job ID</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Intentos</TableHeaderCell>
              <TableHeaderCell>Actualizado</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {batch.jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <Text className="font-mono text-xs">{job.id?.slice(0, 8)}...</Text>
                </TableCell>
                <TableCell>
                  <Badge color={statusColors[job.estado] || 'gray'}>{job.estado}</Badge>
                </TableCell>
                <TableCell>
                  <Text>{job.intentos || 0}</Text>
                </TableCell>
                <TableCell>
                  <Text className="text-xs">{job.updated_at ? new Date(job.updated_at).toLocaleString() : '-'}</Text>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export default function OrdenesProcessingPage() {
  const [batches, setBatches] = useState([]);

  function handleSubmitted(batchId) {
    setBatches((prev) => [batchId, ...prev]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Procesamiento de Ordenes</h1>
        <Text>Enviar lotes de ordenes medicas para procesamiento OCR y pre-visacion automatica</Text>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card decoration="top" decorationColor="blue">
          <div className="flex items-center gap-3">
            <Send className="w-8 h-8 text-blue-500" />
            <div>
              <Text>Max por Batch</Text>
              <Metric>50</Metric>
            </div>
          </div>
        </Card>
        <Card decoration="top" decorationColor="amber">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-amber-500" />
            <div>
              <Text>Max Archivo</Text>
              <Metric>10 MB</Metric>
            </div>
          </div>
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-emerald-500" />
            <div>
              <Text>Procesamiento</Text>
              <Metric>Async</Metric>
            </div>
          </div>
        </Card>
      </div>

      <BatchSubmitForm onSubmitted={handleSubmitted} />

      {batches.map((batchId) => (
        <BatchTracker
          key={batchId}
          batchId={batchId}
          onClear={() => setBatches((prev) => prev.filter((b) => b !== batchId))}
        />
      ))}
    </div>
  );
}
