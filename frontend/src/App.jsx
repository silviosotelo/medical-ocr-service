import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import UsersPage from './pages/UsersPage';
import ApiKeysPage from './pages/ApiKeysPage';
import OrdersPage from './pages/OrdersPage';
import UsagePage from './pages/UsagePage';
import DataPage from './pages/DataPage';
import WebhooksPage from './pages/WebhooksPage';
import DataIngestionPage from './pages/DataIngestionPage';
import OrdenesProcessingPage from './pages/OrdenesProcessingPage';
import PreVisacionesPage from './pages/PreVisacionesPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ navKey, children }) {
  const { canAccessNav } = useAuth();
  if (!canAccessNav(navKey)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/tenants" element={<RoleRoute navKey="tenants"><TenantsPage /></RoleRoute>} />
                <Route path="/users" element={<RoleRoute navKey="users"><UsersPage /></RoleRoute>} />
                <Route path="/api-keys" element={<RoleRoute navKey="api-keys"><ApiKeysPage /></RoleRoute>} />
                <Route path="/orders" element={<RoleRoute navKey="orders"><OrdersPage /></RoleRoute>} />
                <Route path="/usage" element={<RoleRoute navKey="usage"><UsagePage /></RoleRoute>} />
                <Route path="/data" element={<RoleRoute navKey="data"><DataPage /></RoleRoute>} />
                <Route path="/webhooks" element={<RoleRoute navKey="webhooks"><WebhooksPage /></RoleRoute>} />
                <Route path="/data-ingest" element={<RoleRoute navKey="data-ingest"><DataIngestionPage /></RoleRoute>} />
                <Route path="/ordenes-processing" element={<RoleRoute navKey="ordenes-processing"><OrdenesProcessingPage /></RoleRoute>} />
                <Route path="/previsaciones" element={<RoleRoute navKey="previsaciones"><PreVisacionesPage /></RoleRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
