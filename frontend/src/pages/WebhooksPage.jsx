import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Plus, Webhook, X, Trash2 } from 'lucide-react';

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ url: '', events: 'order.completed' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.get('/webhooks');
      setWebhooks(res.data || []);
    } catch {
      setWebhooks([]);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/webhooks', {
        url: form.url,
        events: form.events.split(',').map((s) => s.trim()),
      });
      setShowForm(false);
      setForm({ url: '', events: 'order.completed' });
      load();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm('Eliminar este webhook?')) return;
    try {
      await api.delete(`/webhooks/${id}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-gray-500 mt-1">Notificaciones automaticas a endpoints externos</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo Webhook
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nuevo Webhook</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="input-field" placeholder="https://tu-servidor.com/webhook" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eventos (separados por coma)</label>
              <input value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} className="input-field" placeholder="order.completed, previsacion.ready" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Crear'}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>
      ) : webhooks.length === 0 ? (
        <div className="card p-12 text-center">
          <Webhook className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay webhooks configurados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <div key={w.id} className="card p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Webhook className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{w.url}</p>
                <div className="flex items-center gap-2 mt-1">
                  {(Array.isArray(w.events) ? w.events : []).map((ev) => (
                    <span key={ev} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{ev}</span>
                  ))}
                </div>
                {w.last_error && <p className="text-xs text-red-500 mt-1 truncate">{w.last_error}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`flex items-center gap-1.5 text-xs ${w.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${w.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {w.status}
                </span>
                {w.failure_count > 0 && <span className="text-xs text-amber-600">{w.failure_count} fallas</span>}
                <button onClick={() => handleDelete(w.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
