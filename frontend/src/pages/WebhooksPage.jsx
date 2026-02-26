import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Badge, Button, TextInput,
} from '@tremor/react';
import { Plus, Webhook, X, Trash2 } from 'lucide-react';

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ url: '', events: 'previsacion.generada' });
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
      setForm({ url: '', events: 'previsacion.generada' });
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
          <Text>Notificaciones automaticas a endpoints externos</Text>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Webhook
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <Title>Nuevo Webhook</Title>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <Text className="mb-1">URL</Text>
              <TextInput type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://tu-servidor.com/webhook" required />
            </div>
            <div>
              <Text className="mb-1">Eventos (separados por coma)</Text>
              <TextInput value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} placeholder="previsacion.generada, previsacion.fallida" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" loading={saving} className="flex-1">Crear</Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>
      ) : webhooks.length === 0 ? (
        <Card className="text-center py-12">
          <Webhook className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <Text>No hay webhooks configurados</Text>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <Card key={w.id} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Webhook className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <Text className="font-medium truncate">{w.url}</Text>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {(Array.isArray(w.events) ? w.events : []).map((ev) => (
                    <Badge key={ev} color="gray" size="xs">{ev}</Badge>
                  ))}
                </div>
                {w.last_error && <Text className="text-xs text-red-500 mt-1 truncate">{w.last_error}</Text>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge color={w.status === 'active' ? 'green' : 'gray'}>{w.status}</Badge>
                {w.failure_count > 0 && <Badge color="amber" size="xs">{w.failure_count} fallas</Badge>}
                <button onClick={() => handleDelete(w.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
