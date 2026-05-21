import { useState, useEffect } from 'react';
import { Droplets, Trash2, Wifi, WifiOff, Search, Cpu, RefreshCw, Shield } from 'lucide-react';
import { MOCK_DEVICES } from '../services/mockData';
import { getDevices, getIntegrations } from '../services/api';
import type { Device, Integration } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

const DEFAULT_DEVICE_MAPPINGS: Record<string, string> = {
  'AA01020304050607': 'org1',
  'AA02030405060708': 'org1',
  'BB01020304050607': 'org1',
  'BB02030405060708': 'org2',
  'AA03040506070809': 'org2',
};

export default function DevicesPage() {
  const { user, clients } = useAuth();
  
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<string>('all');
  
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'water_meter' | 'smartbin'>('all');
  const [loading, setLoading] = useState(true);

  // Mapeos de organización de los dispositivos
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

  // Guardar mappings
  const handleAssignOrg = (devEUI: string, orgId: string) => {
    const updated = { ...mappings, [devEUI]: orgId };
    setMappings(updated);
    localStorage.setItem('device_organization_mappings', JSON.stringify(updated));
  };

  // Carga las integraciones disponibles
  useEffect(() => {
    getIntegrations()
      .then((data) => {
        if (data) {
          // Si no es superadmin, filtrar integraciones de su cliente
          if (user?.role !== 'superadmin') {
            // Nota: Podríamos filtrar integraciones mapeadas en el futuro. Por ahora mostramos todas o filtramos.
            setIntegrations(data);
          } else {
            setIntegrations(data);
          }
        }
      })
      .catch((err) => {
        console.warn('Error cargando integraciones en DevicesPage:', err);
      });
  }, [user]);

  // Carga los dispositivos basándose en el filtro de integración
  useEffect(() => {
    setLoading(true);
    const integrationParam = selectedIntegration === 'all' ? undefined : selectedIntegration;
    
    getDevices(integrationParam)
      .then((data) => {
        if (data) {
          setDevices(data);
        }
      })
      .catch((err) => {
        console.warn('Error cargando dispositivos reales del backend, usando mock:', err);
      })
      .finally(() => setLoading(false));
  }, [selectedIntegration]);

  const filtered = devices.filter((d) => {
    const nameStr = d.name || '';
    const matchSearch = nameStr.toLowerCase().includes(search.toLowerCase()) || d.devEUI.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || d.deviceType === typeFilter;
    
    // Filtro de multi-tenancy
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[d.devEUI] || 'org1'; // default a org1 si no está mapeado
      if (deviceOrg !== user?.organizationId) {
        return false;
      }
    }

    return matchSearch && matchType;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dispositivos</h2>
          <p className="page-subtitle">
            {filtered.length} registrados · {filtered.filter(d => d.active).length} activos 
            {user?.role !== 'superadmin' && ` · Cliente: ${clients.find(c => c.id === user?.organizationId)?.name || 'Empresa Demo S.A.'}`}
          </p>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          {/* Caja de Búsqueda */}
          <div className="search-box" style={{ maxWidth: 300, flex: 1 }}>
            <Search size={15} />
            <input 
              placeholder="Buscar por nombre o devEUI..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </div>

          {/* Filtro de Integración */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={14} className="text-muted" />
            <select
              className="form-input"
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
              style={{ width: 'auto', padding: '6px 12px', fontSize: 13, height: '36px' }}
            >
              <option value="all">Todas las integraciones</option>
              {integrations.map((int) => (
                <option key={int.id} value={int.id}>
                  {int.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtros de Tipo */}
        <div className="filter-tabs" style={{ margin: 0 }}>
          {(['all', 'water_meter', 'smartbin'] as const).map((t) => (
            <button 
              key={t} 
              className={`filter-tab ${typeFilter === t ? 'active' : ''}`} 
              onClick={() => setTypeFilter(t)}
            >
              {t === 'all' ? 'Todos' : t === 'water_meter' ? 'Medidores' : 'SmartBins'}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <RefreshCw size={22} className="animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>
            No se encontraron dispositivos registrados en esta vista.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>devEUI</th>
                <th>Tipo</th>
                <th>Estado</th>
                {user?.role === 'superadmin' && <th>Cliente Asociado (Tenant)</th>}
                <th>Último dato</th>
                <th>RSSI / SNR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isWater = d.deviceType === 'water_meter';
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="table-device-name">
                        <div className="device-type-icon" style={{ background: isWater ? '#E6F1FB' : '#FAEEDA' }}>
                          {isWater ? <Droplets size={13} style={{ color: '#185FA5' }} /> : <Trash2 size={13} style={{ color: '#854F0B' }} />}
                        </div>
                        {d.name || `Dispositivo ${d.devEUI.substring(0, 6)}`}
                      </div>
                    </td>
                    <td><code className="eui-code">{d.devEUI}</code></td>
                    <td>
                      <span className={`type-badge ${isWater ? 'water' : 'bin'}`}>
                        {isWater ? 'Medidor agua' : 'SmartBin'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${d.active ? 'online' : 'offline'}`}>
                        {d.active ? <><Wifi size={11} /> online</> : <><WifiOff size={11} /> offline</>}
                      </span>
                    </td>
                    
                    {/* Nueva columna multi-tenant para superadmin */}
                    {user?.role === 'superadmin' && (
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Shield size={12} className="text-purple-500" />
                          <select
                            value={mappings[d.devEUI] || 'org1'}
                            onChange={(e) => handleAssignOrg(d.devEUI, e.target.value)}
                            className="form-input"
                            style={{ padding: '2px 6px', fontSize: 12, height: 26, width: 'auto', border: '0.5px solid var(--color-border)' }}
                          >
                            {clients.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    )}

                    <td className="table-muted">
                      {d.lastTelemetry ? format(new Date(d.lastTelemetry.receivedAt), 'dd/MM HH:mm') : '—'}
                    </td>
                    <td className="table-muted">
                      {d.lastTelemetry ? `${d.lastTelemetry.rssi} dBm / ${d.lastTelemetry.snr} dB` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
