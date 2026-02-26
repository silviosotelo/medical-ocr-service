import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Badge, Button, Callout,
  TabGroup, TabList, Tab, TabPanels, TabPanel,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
  ProgressBar, TextInput, NumberInput,
} from '@tremor/react';
import { Upload, Database, Zap, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

function JsonEditor({ value, onChange, placeholder, rows = 8 }) {
  return (
    <textarea
      className="w-full font-mono text-xs border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function JobTracker({ jobId, onClear }) {
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    let timer;
    async function poll() {
      try {
        const res = await api.ingest.jobStatus(jobId);
        setJob(res.data);
        if (res.data.estado === 'completado' || res.data.estado === 'fallido') {
          setPolling(false);
        }
      } catch {
        setPolling(false);
      }
    }
    poll();
    if (polling) {
      timer = setInterval(poll, 2000);
    }
    return () => clearInterval(timer);
  }, [jobId, polling]);

  if (!job) return null;

  const statusColors = {
    pendiente: 'gray',
    procesando: 'blue',
    completado: 'green',
    fallido: 'red',
  };

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <Title>Job: {jobId.slice(0, 8)}...</Title>
        <Badge color={statusColors[job.estado] || 'gray'}>{job.estado}</Badge>
      </div>
      {job.estado === 'procesando' && <ProgressBar value={66} className="mt-2" />}
      {job.resultado && (
        <div className="mt-3 bg-gray-50 rounded-lg p-3">
          <Text className="font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(job.resultado, null, 2)}
          </Text>
        </div>
      )}
      {(job.estado === 'completado' || job.estado === 'fallido') && (
        <Button size="xs" variant="secondary" className="mt-3" onClick={onClear}>
          Limpiar
        </Button>
      )}
    </Card>
  );
}

function PrestadoresTab() {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null);

  const placeholder = `[
  {
    "id_externo": "PREST-001",
    "nombre_fantasia": "Clinica San Martin",
    "raz_soc_nombre": "San Martin SRL",
    "registro_profesional": "MP-12345",
    "tipo": "clinica",
    "especialidad": "general"
  }
]`;

  async function handleSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const data = JSON.parse(json);
      const res = await api.ingest.prestadores({ registros: data });
      setResult({ success: true, data: res.data });
      if (res.data?.job_id) setJobId(res.data.job_id);
    } catch (err) {
      setResult({ success: false, message: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <Title>Batch de Prestadores</Title>
        <Text className="mt-1">Enviar hasta 5,000 prestadores. Se realiza UPSERT por id_externo.</Text>
        <div className="mt-4">
          <JsonEditor value={json} onChange={setJson} placeholder={placeholder} />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Button loading={loading} onClick={handleSubmit} disabled={!json.trim()}>
            <Upload className="w-4 h-4 mr-2" />
            Enviar Batch
          </Button>
          <Text className="text-gray-400">{json.trim() ? `${json.length} chars` : ''}</Text>
        </div>
      </Card>
      {result && (
        <Callout
          title={result.success ? 'Batch enviado' : 'Error'}
          color={result.success ? 'green' : 'red'}
          icon={result.success ? CheckCircle : AlertCircle}
        >
          {result.success
            ? `Job ID: ${result.data?.job_id || 'N/A'} - ${result.data?.registros_recibidos || 0} registros recibidos`
            : result.message}
        </Callout>
      )}
      {jobId && <JobTracker jobId={jobId} onClear={() => setJobId(null)} />}
    </div>
  );
}

function NomencladoresTab() {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null);

  const placeholder = `[
  {
    "id_externo": "NOM-001",
    "codigo": "01.01.01",
    "especialidad": "Clinica Medica",
    "descripcion": "Consulta medica general",
    "desc_nomenclador": "Consulta",
    "sinonimos": ["consulta", "visita medica"],
    "palabras_clave": ["clinica", "general"]
  }
]`;

  async function handleSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const data = JSON.parse(json);
      const res = await api.ingest.nomencladores({ registros: data });
      setResult({ success: true, data: res.data });
      if (res.data?.job_id) setJobId(res.data.job_id);
    } catch (err) {
      setResult({ success: false, message: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <Title>Batch de Nomencladores</Title>
        <Text className="mt-1">Enviar hasta 5,000 nomencladores. Se realiza UPSERT por id_externo.</Text>
        <div className="mt-4">
          <JsonEditor value={json} onChange={setJson} placeholder={placeholder} />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Button loading={loading} onClick={handleSubmit} disabled={!json.trim()}>
            <Upload className="w-4 h-4 mr-2" />
            Enviar Batch
          </Button>
        </div>
      </Card>
      {result && (
        <Callout
          title={result.success ? 'Batch enviado' : 'Error'}
          color={result.success ? 'green' : 'red'}
          icon={result.success ? CheckCircle : AlertCircle}
        >
          {result.success
            ? `Job ID: ${result.data?.job_id || 'N/A'} - ${result.data?.registros_recibidos || 0} registros recibidos`
            : result.message}
        </Callout>
      )}
      {jobId && <JobTracker jobId={jobId} onClear={() => setJobId(null)} />}
    </div>
  );
}

function AcuerdosTab() {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const placeholder = `[
  {
    "id_prestador_externo": "PREST-001",
    "id_nomenclador_externo": "NOM-001",
    "precio_acordado": 5000,
    "vigencia_desde": "2024-01-01",
    "vigencia_hasta": "2024-12-31"
  }
]`;

  async function handleSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const data = JSON.parse(json);
      const res = await api.ingest.acuerdos({ registros: data });
      setResult({ success: true, data: res.data });
    } catch (err) {
      setResult({ success: false, message: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <Title>Batch de Acuerdos</Title>
        <Text className="mt-1">Enviar acuerdos prestador-nomenclador. Resuelve IDs externos automaticamente.</Text>
        <div className="mt-4">
          <JsonEditor value={json} onChange={setJson} placeholder={placeholder} />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Button loading={loading} onClick={handleSubmit} disabled={!json.trim()}>
            <Upload className="w-4 h-4 mr-2" />
            Enviar Batch
          </Button>
        </div>
      </Card>
      {result && (
        <Callout
          title={result.success ? 'Acuerdos procesados' : 'Error'}
          color={result.success ? 'green' : 'red'}
          icon={result.success ? CheckCircle : AlertCircle}
        >
          {result.success
            ? `${result.data?.insertados || 0} insertados, ${result.data?.errores?.length || 0} errores`
            : result.message}
        </Callout>
      )}
    </div>
  );
}

export default function DataIngestionPage() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.ingest.stats();
      setStats(res.data);
    } catch {
      setStats(null);
    }
    setLoadingStats(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingesta de Datos</h1>
          <Text>Carga masiva de prestadores, nomencladores y acuerdos via API-First</Text>
        </div>
        <Button variant="secondary" size="xs" onClick={loadStats}>
          <RefreshCw className="w-3 h-3 mr-1" />
          Actualizar
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card decoration="top" decorationColor="blue">
            <Text>Prestadores</Text>
            <Metric>{stats.prestadores?.total ?? 0}</Metric>
            <Text className="mt-1 text-xs">
              {stats.prestadores?.con_embedding ?? 0} con embedding
            </Text>
          </Card>
          <Card decoration="top" decorationColor="indigo">
            <Text>Nomencladores</Text>
            <Metric>{stats.nomencladores?.total ?? 0}</Metric>
            <Text className="mt-1 text-xs">
              {stats.nomencladores?.con_embedding ?? 0} con embedding
            </Text>
          </Card>
          <Card decoration="top" decorationColor="violet">
            <Text>Acuerdos</Text>
            <Metric>{stats.acuerdos?.total ?? 0}</Metric>
          </Card>
          <Card decoration="top" decorationColor="emerald">
            <Text>Embeddings</Text>
            <div className="flex items-baseline gap-2">
              <Metric>{(stats.prestadores?.con_embedding ?? 0) + (stats.nomencladores?.con_embedding ?? 0)}</Metric>
              <Text>/ {(stats.prestadores?.total ?? 0) + (stats.nomencladores?.total ?? 0)}</Text>
            </div>
            <ProgressBar
              value={
                ((stats.prestadores?.total ?? 0) + (stats.nomencladores?.total ?? 0)) > 0
                  ? (((stats.prestadores?.con_embedding ?? 0) + (stats.nomencladores?.con_embedding ?? 0)) /
                    ((stats.prestadores?.total ?? 0) + (stats.nomencladores?.total ?? 0))) * 100
                  : 0
              }
              className="mt-2"
            />
          </Card>
        </div>
      )}

      <TabGroup>
        <TabList>
          <Tab icon={Database}>Prestadores</Tab>
          <Tab icon={Database}>Nomencladores</Tab>
          <Tab icon={Zap}>Acuerdos</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <PrestadoresTab />
          </TabPanel>
          <TabPanel>
            <NomencladoresTab />
          </TabPanel>
          <TabPanel>
            <AcuerdosTab />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
