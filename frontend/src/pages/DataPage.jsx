import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Metric, Button, Callout, Grid,
} from '@tremor/react';
import { Upload, Download, Zap, Database, CheckCircle, AlertCircle } from 'lucide-react';

export default function DataPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    try {
      const res = await api.get('/data/stats');
      setStats(res.data);
    } catch {
      setStats(null);
    }
    setLoading(false);
  }

  async function handleUpload(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setUploading(true);
      setResult(null);
      try {
        const res = await api.upload(`/data/import?type=${type}`, file, { type });
        setResult({ success: true, ...res.data });
        loadStats();
      } catch (err) {
        setResult({ success: false, message: err.message });
      }
      setUploading(false);
    };
    input.click();
  }

  async function handleGenerateEmbeddings() {
    setGenerating(true);
    setResult(null);
    try {
      const res = await api.post('/data/embeddings');
      const d = res.data;
      if (d.total === 0 || d.generated === 0 && !d.jobs) {
        setResult({ success: true, message: 'No hay registros sin embeddings pendientes.' });
      } else {
        setResult({ success: true, message: `${d.total} registros encolados para embedding (${(d.jobs || []).length} job/s iniciados).` });
      }
      loadStats();
    } catch (err) {
      setResult({ success: false, message: err.message });
    }
    setGenerating(false);
  }

  async function handleExport(type) {
    try {
      const res = await api.get(`/data/export/${type}`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Datos</h1>
        <Text>Importar, exportar y gestionar nomencladores, prestadores y acuerdos</Text>
      </div>

      {result && (
        <Callout
          title={result.success ? 'Operacion exitosa' : 'Error'}
          color={result.success ? 'green' : 'red'}
          icon={result.success ? CheckCircle : AlertCircle}
        >
          {result.imported !== undefined && `${result.imported} registros importados. `}
          {result.errors?.length > 0 && `${result.errors.length} errores. `}
          {result.message && result.message}
        </Callout>
      )}

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        {[
          { label: 'Prestadores', value: stats?.prestadores?.total },
          { label: 'Nomencladores', value: stats?.nomencladores?.total },
          { label: 'Con Embeddings', value: stats?.nomencladores?.con_embeddings },
          { label: 'Acuerdos', value: stats?.acuerdos?.total },
        ].map(({ label, value }) => (
          <Card key={label}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <Database className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <Text>{label}</Text>
                <Metric className="text-xl">{value ?? 0}</Metric>
              </div>
            </div>
          </Card>
        ))}
      </Grid>

      <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Importar Datos</Title>
          <Text className="mt-1">Sube archivos Excel (.xlsx) para importar datos</Text>
          <div className="space-y-3 mt-4">
            {['prestadores', 'nomencladores', 'acuerdos'].map((type) => (
              <button
                key={type}
                onClick={() => handleUpload(type)}
                disabled={uploading}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Upload className="w-5 h-5 text-brand-600" />
                <span className="font-medium text-gray-700 capitalize">{type}</span>
                <span className="text-xs text-gray-400 ml-auto">.xlsx</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <Title>Acciones</Title>
          <div className="space-y-3 mt-4">
            <button
              onClick={handleGenerateEmbeddings}
              disabled={generating}
              className="w-full flex items-center gap-3 px-4 py-3 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
            >
              <Zap className="w-5 h-5 text-brand-600" />
              <div className="text-left">
                <span className="font-medium text-brand-700 block">Generar Embeddings</span>
                <span className="text-xs text-brand-500">{generating ? 'Procesando...' : 'Vectorizar nomencladores sin embedding'}</span>
              </div>
            </button>

            <Text className="font-medium pt-3">Exportar Datos</Text>
            {['prestadores', 'nomencladores', 'acuerdos'].map((type) => (
              <button
                key={type}
                onClick={() => handleExport(type)}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-5 h-5 text-gray-500" />
                <span className="font-medium text-gray-700 capitalize">{type}</span>
                <span className="text-xs text-gray-400 ml-auto">JSON</span>
              </button>
            ))}
          </div>
        </Card>
      </Grid>
    </div>
  );
}
