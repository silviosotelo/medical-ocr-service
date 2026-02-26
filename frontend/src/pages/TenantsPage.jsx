import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Badge, Button, TextInput, Select, SelectItem,
} from '@tremor/react';
import { Plus, Building2, X } from 'lucide-react';

const PLAN_COLORS = { starter: 'gray', professional: 'blue', enterprise: 'amber' };

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', ruc: '', plan: 'starter' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTenants(); }, []);

  async function loadTenants() {
    try {
      const res = await api.get('/tenants');
      setTenants(res.data || []);
    } catch {
      setTenants([]);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/tenants', form);
      setShowForm(false);
      setForm({ name: '', slug: '', ruc: '', plan: 'starter' });
      loadTenants();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <Text>Organizaciones registradas en la plataforma</Text>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Tenant
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <Title>Nuevo Tenant</Title>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <Text className="mb-1">Nombre</Text>
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del tenant" required />
            </div>
            <div>
              <Text className="mb-1">Slug</Text>
              <TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="mi-tenant" required />
            </div>
            <div>
              <Text className="mb-1">RUC</Text>
              <TextInput value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} placeholder="Opcional" />
            </div>
            <div>
              <Text className="mb-1">Plan</Text>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </Select>
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
      ) : tenants.length === 0 ? (
        <Card className="text-center py-12">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <Text>No hay tenants registrados</Text>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-brand-600" />
                </div>
                <Badge color={PLAN_COLORS[t.plan] || 'gray'}>{t.plan}</Badge>
              </div>
              <Title>{t.name}</Title>
              <Text>{t.slug}</Text>
              {t.ruc && <Text className="text-xs mt-1">RUC: {t.ruc}</Text>}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <span className={`w-2 h-2 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                <Text className="text-xs capitalize">{t.status}</Text>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
