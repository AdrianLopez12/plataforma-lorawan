import { useState, useEffect } from 'react';
import { Trash2, Thermometer, MapPin, Battery } from 'lucide-react';
import { MOCK_DEVICES } from '../services/mockData';
import { getDevices } from '../services/api';
import type { Device, SmartBinPayload } from '../types';
import { useAuth } from '../context/AuthContext';

const DEFAULT_DEVICE_MAPPINGS: Record<string, string> = {
  'AA01020304050607': 'org1',
  'AA02030405060708': 'org1',
  'BB01020304050607': 'org1',
  'BB02030405060708': 'org2',
  'AA03040506070809': 'org2',
};

function FillGauge({ value }: { value: number }) {
  const color = value >= 80 ? '#E24B4A' : value >= 60 ? '#EF9F27' : '#1D9E75';
  return (
    <div className="fill-gauge">
      <div className="fill-gauge-bar">
        <div className="fill-gauge-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="fill-gauge-label" style={{ color }}>{value}%</span>
    </div>
  );
}

export default function SmartBinsPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);

  // Cargar mappings
  const getMappings = (): Record<string, string> => {
    const stored = localStorage.getItem('device_organization_mappings');
    return stored ? JSON.parse(stored) : DEFAULT_DEVICE_MAPPINGS;
  };

  const mappings = getMappings();

  useEffect(() => {
    getDevices()
      .then((data) => {
        if (data && data.length > 0) {
          setDevices(data);
        }
      })
      .catch((err) => console.warn('Error loading real devices for smartbins, using mocks:', err));
  }, []);

  const bins = devices.filter((d) => {
    if (d.deviceType !== 'smartbin') return false;
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[d.devEUI] || 'org1';
      return deviceOrg === user?.organizationId;
    }
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">SmartBins</h2>
          <p className="page-subtitle">{bins.length} contenedores inteligentes</p>
        </div>
      </div>

      <div className="bins-grid">
        {bins.map((d) => {
          const p = d.lastTelemetry?.decodedPayload as SmartBinPayload | undefined;
          const fill = p?.fillLevel ?? 0;
          const isCritical = fill >= 80;

          return (
            <div key={d.id} className={`bin-card ${isCritical ? 'critical' : ''}`}>
              <div className="bin-card-header">
                <div className="bin-icon" style={{ background: isCritical ? '#FCEBEB' : '#FAEEDA' }}>
                  <Trash2 size={22} style={{ color: isCritical ? '#A32D2D' : '#854F0B' }} />
                </div>
                <div>
                  <div className="bin-name">{d.name}</div>
                  <div className="bin-eui">{d.devEUI}</div>
                </div>
                <span className={`status-pill ${d.active ? 'online' : 'offline'}`}>
                  {d.active ? 'online' : 'offline'}
                </span>
              </div>

              <div className="bin-fill-section">
                <div className="bin-fill-label">Nivel de llenado</div>
                <FillGauge value={fill} />
                {isCritical && (
                  <div className="bin-critical-msg">Requiere recolección</div>
                )}
              </div>

              <div className="bin-metrics">
                <div className="bin-metric">
                  <Thermometer size={13} />
                  <span>{p?.temperature?.toFixed(1) ?? '—'}°C interior</span>
                </div>
                <div className="bin-metric">
                  <Battery size={13} />
                  <span>{p?.battery ?? '—'}% batería</span>
                </div>
                <div className="bin-metric">
                  <MapPin size={13} />
                  <span>{p?.lat?.toFixed(4) ?? d.lat?.toFixed(4) ?? '—'}, {p?.lng?.toFixed(4) ?? d.lng?.toFixed(4) ?? '—'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
