import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Plus, Key, X, Copy, Check } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.get('/api-keys');
      setKeys(res.data || []);
    } catch {
      setKeys([]);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/api-keys', { name: form.name });
      setNewKey(res.data.key);
      setForm({ name: '' });
      load();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  }

  async function handleRevoke(id) {
    if (!confirm('Revocar esta API key?')) return;
    try {
      await api.delete(`/api-keys/${id}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 mt-1">Gestionar acceso programatico a la API</p>
        </div>
        <button onClick={() => { setShowForm(true); setNewKey(null); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva Key
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{newKey ? 'Key Creada' : 'Nueva API Key'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {newKey ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Copia esta key ahora. No se mostrara de nuevo.</p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                  <code className="flex-1 text-xs break-all text-gray-800">{newKey}</code>
                  <button onClick={copyKey} className="flex-shrink-0 text-gray-500 hover:text-brand-600">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={() => setShowForm(false)} className="btn-primary w-full">Listo</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} className="input-field" placeholder="ej: Integracion APEX" required />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Creando...' : 'Crear Key'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>
      ) : keys.length === 0 ? (
        <div className="card p-12 text-center">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay API keys</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Prefijo</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Usos</th>
                <th className="px-5 py-3 font-medium">Ultimo Uso</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{k.name}</td>
                  <td className="px-5 py-3"><code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{k.key_prefix}...</code></td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${k.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{k.status}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{k.usage_count}</td>
                  <td className="px-5 py-3 text-gray-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '-'}</td>
                  <td className="px-5 py-3">
                    {k.status === 'active' && (
                      <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Revocar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
