import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Badge, Button, TextInput, Select, SelectItem,
  NumberInput,
} from '@tremor/react';
import { Plus, Building2, X, Settings, Users, FileText, Zap } from 'lucide-react';

const PLAN_COLORS = { starter: 'gray', professional: 'blue', enterprise: 'amber' };

const PLAN_DEFAULTS = {
  starter: { max_orders_month: 500, max_api_keys: 5, max_users: 10, max_webhooks: 3, max_prestadores: 1000, max_nomencladores: 2000 },
  professional: { max_orders_month: 5000, max_api_keys: 20, max_users: 50, max_webhooks: 10, max_prestadores: 10000, max_nomencladores: 20000 },
  enterprise: { max_orders_month: -1, max_api_keys: -1, max_users: -1, max_webhooks: -1, max_prestadores: -1, max_nomencladores: -1 },
};

function formatLimit(val) {
  if (val === -1 || val === null || val === undefined) return 'Ilimitado';
  return val.toLocaleString();
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', ruc: '', plan: 'starter',
    settings: { ...PLAN_DEFAULTS.starter },
  });
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

  function handlePlanChange(plan) {
    setForm({
      ...form,
      plan,
      settings: { ...PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.starter },
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/tenants', form);
      setShowForm(false);
      setForm({ name: '', slug: '', ruc: '', plan: 'starter', settings: { ...PLAN_DEFAULTS.starter } });
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
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
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
              <Select value={form.plan} onValueChange={handlePlanChange}>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </Select>
            </div>

            {form.plan !== 'enterprise' && (
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <Text className="font-medium">Limites del Plan</Text>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Text className="text-xs mb-1">Ordenes/mes</Text>
                    <NumberInput value={form.settings.max_orders_month} onValueChange={(v) => setForm({ ...form, settings: { ...form.settings, max_orders_month: v } })} min={0} />
                  </div>
                  <div>
                    <Text className="text-xs mb-1">API Keys</Text>
                    <NumberInput value={form.settings.max_api_keys} onValueChange={(v) => setForm({ ...form, settings: { ...form.settings, max_api_keys: v } })} min={0} />
                  </div>
                  <div>
                    <Text className="text-xs mb-1">Usuarios</Text>
                    <NumberInput value={form.settings.max_users} onValueChange={(v) => setForm({ ...form, settings: { ...form.settings, max_users: v } })} min={0} />
                  </div>
                  <div>
                    <Text className="text-xs mb-1">Webhooks</Text>
                    <NumberInput value={form.settings.max_webhooks} onValueChange={(v) => setForm({ ...form, settings: { ...form.settings, max_webhooks: v } })} min={0} />
                  </div>
                  <div>
                    <Text className="text-xs mb-1">Prestadores</Text>
                    <NumberInput value={form.settings.max_prestadores} onValueChange={(v) => setForm({ ...form, settings: { ...form.settings, max_prestadores: v } })} min={0} />
                  </div>
                  <div>
                    <Text className="text-xs mb-1">Nomencladores</Text>
                    <NumberInput value={form.settings.max_nomencladores} onValueChange={(v) => setForm({ ...form, settings: { ...form.settings, max_nomencladores: v } })} min={0} />
                  </div>
                </div>
              </div>
            )}
            {form.plan === 'enterprise' && (
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <Text className="text-sm text-amber-700">Plan Enterprise: todos los limites son ilimitados</Text>
                </div>
              </div>
            )}

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
          {tenants.map((t) => {
            const limits = t.settings || PLAN_DEFAULTS[t.plan] || PLAN_DEFAULTS.starter;
            return (
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
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <FileText className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                    <Text className="text-xs mt-0.5">{formatLimit(limits.max_orders_month)}</Text>
                    <Text className="text-[10px] text-gray-400">ord/mes</Text>
                  </div>
                  <div className="text-center">
                    <Users className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                    <Text className="text-xs mt-0.5">{formatLimit(limits.max_users)}</Text>
                    <Text className="text-[10px] text-gray-400">usuarios</Text>
                  </div>
                  <div className="text-center">
                    <Zap className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                    <Text className="text-xs mt-0.5">{formatLimit(limits.max_api_keys)}</Text>
                    <Text className="text-[10px] text-gray-400">api keys</Text>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <span className={`w-2 h-2 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <Text className="text-xs capitalize">{t.status}</Text>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
