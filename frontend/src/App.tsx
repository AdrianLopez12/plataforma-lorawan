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

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
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
            <Route path="/clients" element={<AdminGuard><ClientsPage /></AdminGuard>} />
            <Route path="/users" element={<AdminGuard><UsersPage /></AdminGuard>} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
