import { useState, useEffect } from 'react';
import { api } from '../lib/api';
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
      setResult({ success: true, message: `${res.data.generated} embeddings generados de ${res.data.total}` });
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
        <p className="text-gray-500 mt-1">Importar, exportar y gestionar nomencladores, prestadores y acuerdos</p>
      </div>

      {result && (
        <div className={`flex items-center gap-3 p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.success ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <div>
            {result.imported !== undefined && <p className="font-medium">{result.imported} registros importados</p>}
            {result.errors?.length > 0 && <p className="text-sm mt-0.5">{result.errors.length} errores</p>}
            {result.message && <p>{result.message}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Prestadores', value: stats?.prestadores },
          { label: 'Nomencladores', value: stats?.nomencladores },
          { label: 'Con Embeddings', value: stats?.nom_with_embeddings },
          { label: 'Acuerdos', value: stats?.acuerdos },
        ].map(({ label, value }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <Database className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-900">{value ?? 0}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Importar Datos</h2>
          <p className="text-sm text-gray-500 mb-4">Sube archivos Excel (.xlsx) para importar datos</p>
          <div className="space-y-3">
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
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones</h2>
          <div className="space-y-3">
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

            <h3 className="text-sm font-medium text-gray-500 pt-3">Exportar Datos</h3>
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
        </div>
      </div>
    </div>
  );
}
