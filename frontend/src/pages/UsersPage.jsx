import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Card, Title, Text, Badge, Button, TextInput, Select, SelectItem,
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell,
} from '@tremor/react';
import { Plus, Users as UsersIcon, X } from 'lucide-react';

const ROLE_COLORS = { super_admin: 'red', admin: 'blue', operator: 'green', viewer: 'gray' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'viewer' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.get('/users');
      setUsers(res.data || []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/users', form);
      setShowForm(false);
      setForm({ email: '', password: '', name: '', role: 'viewer' });
      load();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <Text>Gestion de usuarios del tenant</Text>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Usuario
        </Button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <Title>Nuevo Usuario</Title>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <Text className="mb-1">Nombre</Text>
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" required />
            </div>
            <div>
              <Text className="mb-1">Email</Text>
              <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" required />
            </div>
            <div>
              <Text className="mb-1">Password</Text>
              <TextInput type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="********" required />
            </div>
            <div>
              <Text className="mb-1">Rol</Text>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
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
      ) : users.length === 0 ? (
        <Card className="text-center py-12">
          <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <Text>No hay usuarios</Text>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Ultimo Login</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell><Text className="font-medium">{u.name}</Text></TableCell>
                  <TableCell><Text>{u.email}</Text></TableCell>
                  <TableCell><Badge color={ROLE_COLORS[u.role] || 'gray'}>{u.role}</Badge></TableCell>
                  <TableCell><Badge color={u.status === 'active' ? 'green' : 'gray'}>{u.status}</Badge></TableCell>
                  <TableCell><Text className="text-xs">{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</Text></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
