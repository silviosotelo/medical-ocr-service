import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Badge, Button,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
  TextInput,
} from '@tremor/react';
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
          <Text>Gestionar acceso programatico a la API</Text>
        </div>
        <Button onClick={() => { setShowForm(true); setNewKey(null); }}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Key
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <Title>{newKey ? 'Key Creada' : 'Nueva API Key'}</Title>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {newKey ? (
              <div className="space-y-3">
                <Text>Copia esta key ahora. No se mostrara de nuevo.</Text>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                  <code className="flex-1 text-xs break-all text-gray-800">{newKey}</code>
                  <button onClick={copyKey} className="flex-shrink-0 text-gray-500 hover:text-brand-600">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <Button className="w-full" onClick={() => setShowForm(false)}>Listo</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Text className="mb-1">Nombre</Text>
                  <TextInput value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="ej: Integracion Backend" required />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button type="submit" loading={saving} className="flex-1">Crear Key</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>
      ) : keys.length === 0 ? (
        <Card className="text-center py-12">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <Text>No hay API keys</Text>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Prefijo</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Usos</TableHeaderCell>
                <TableHeaderCell>Ultimo Uso</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell><Text className="font-medium">{k.name}</Text></TableCell>
                  <TableCell><code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{k.key_prefix}...</code></TableCell>
                  <TableCell><Badge color={k.status === 'active' ? 'green' : 'red'}>{k.status}</Badge></TableCell>
                  <TableCell><Text>{k.usage_count}</Text></TableCell>
                  <TableCell><Text className="text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '-'}</Text></TableCell>
                  <TableCell>
                    {k.status === 'active' && (
                      <Button size="xs" variant="secondary" color="red" onClick={() => handleRevoke(k.id)}>Revocar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
