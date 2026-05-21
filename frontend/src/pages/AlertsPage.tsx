import { useState, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import AlertItem from '../components/alerts/AlertItem';
import { MOCK_ALERTS } from '../services/mockData';
import type { Alert } from '../types';
import { useAuth } from '../context/AuthContext';

const DEFAULT_DEVICE_MAPPINGS: Record<string, string> = {
  'AA01020304050607': 'org1',
  'AA02030405060708': 'org1',
  'BB01020304050607': 'org1',
  'BB02030405060708': 'org2',
  'AA03040506070809': 'org2',
};

export default function AlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS);
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged'>('active');
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Cargar mappings al iniciar
  useEffect(() => {
    let storedMappings = localStorage.getItem('device_organization_mappings');
    if (!storedMappings) {
      localStorage.setItem('device_organization_mappings', JSON.stringify(DEFAULT_DEVICE_MAPPINGS));
      storedMappings = JSON.stringify(DEFAULT_DEVICE_MAPPINGS);
    }
    setMappings(JSON.parse(storedMappings));
  }, []);

  const acknowledge = (id: string) =>
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));

  const deleteAlert = (id: string) =>
    setAlerts((prev) => prev.filter((a) => a.id !== id));

  const acknowledgeAll = () =>
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));

  const tenantAlerts = alerts.filter((a) => {
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[a.devEUI] || 'org1';
      if (deviceOrg !== user?.organizationId) {
        return false;
      }
    }
    return true;
  });

  const filtered = tenantAlerts.filter((a) => {
    if (filter === 'active') return !a.acknowledged;
    if (filter === 'acknowledged') return a.acknowledged;
    return true;
  });

  const activeCount = tenantAlerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Alertas</h2>
          <p className="page-subtitle">{activeCount} sin atender · {tenantAlerts.length} total</p>
        </div>
        {activeCount > 0 && (
          <button className="btn-secondary" onClick={acknowledgeAll}>
            <CheckCheck size={15} /> Atender todas
          </button>
        )}
      </div>

      <div className="filter-tabs">
        {(['all', 'active', 'acknowledged'] as const).map((f) => (
          <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todas' : f === 'active' ? 'Sin atender' : 'Atendidas'}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Bell size={32} style={{ color: 'var(--color-text-tertiary)' }} />
            <div>No hay alertas {filter === 'active' ? 'activas' : ''}</div>
          </div>
        ) : (
          <div className="alerts-list">
            {filtered.map((a) => (
              <AlertItem key={a.id} alert={a} onAcknowledge={acknowledge} onDelete={deleteAlert} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
