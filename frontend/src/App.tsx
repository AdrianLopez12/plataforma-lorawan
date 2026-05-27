import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WaterMetersPage from './pages/WaterMetersPage';
import SmartBinsPage from './pages/SmartBinsPage';
import MapPage from './pages/MapPage';
import AlertsPage from './pages/AlertsPage';
import DevicesPage from './pages/DevicesPage';
import SettingsPage from './pages/SettingsPage';
import IntegrationPage from './pages/IntegrationPage';
import ClientsPage from './pages/ClientsPage';
import UsersPage from './pages/UsersPage';
import AuditPage from './pages/AuditPage';
import RuleChainsPage from './pages/RuleChainsPage';
import RuleChainDesignerPage from './pages/RuleChainDesignerPage';
import ApiKeysPage from './pages/ApiKeysPage';
import RealtimeToastContainer from './components/alerts/RealtimeToastContainer';
import { getAlerts, saveAlerts } from './services/alertsEngine';

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function RealtimeSubscriber() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return; // Solo conectar si hay sesión activa

    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const sseUrl = `${serverUrl}/telemetry/stream`;
    console.log('🔌 Conectando a canal de tiempo real SSE:', sseUrl);

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'telemetry') {
          // Despachar evento para dashboards reactivos
          window.dispatchEvent(
            new CustomEvent('realtime-telemetry-received', { detail: parsed.data })
          );
        } else if (parsed.type === 'alert') {
          const alertData = parsed.data;

          // Guardar alerta localmente en el historial
          const storedAlerts = getAlerts();
          const alreadyExists = storedAlerts.some((a) => a.id === alertData.id);

          if (!alreadyExists) {
            const updated = [alertData, ...storedAlerts];
            saveAlerts(updated); // Esto internamente ya despacha 'alerts-changed'
          }

          // Disparar evento para que el RealtimeToastContainer renderice el Toast
          window.dispatchEvent(
            new CustomEvent('realtime-alert-received', { detail: alertData })
          );
        }
      } catch (err) {
        console.error('Error parseando evento SSE:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('Conexión perdida en canal SSE. EventSource reconectará de forma automática...', err);
    };

    return () => {
      console.log('🔌 Desconectando canal de tiempo real SSE');
      eventSource.close();
    };
  }, [user]);

  return <RealtimeToastContainer />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <RealtimeSubscriber />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/water-meters" element={<WaterMetersPage />} />
            <Route path="/smartbins" element={<SmartBinsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/integration" element={<IntegrationPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
            <Route path="/clients" element={<AdminGuard><ClientsPage /></AdminGuard>} />
            <Route path="/users" element={<AdminGuard><UsersPage /></AdminGuard>} />
            <Route path="/audit" element={<AdminGuard><AuditPage /></AdminGuard>} />
            <Route path="/rule-chains" element={<AdminGuard><RuleChainsPage /></AdminGuard>} />
            <Route path="/rule-chains/designer/:id" element={<AdminGuard><RuleChainDesignerPage /></AdminGuard>} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

