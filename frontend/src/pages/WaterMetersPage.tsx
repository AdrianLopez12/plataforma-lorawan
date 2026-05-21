import { useState, useEffect } from 'react';
import { Droplets, AlertTriangle, Thermometer, Activity, Battery } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MOCK_DEVICES, generateTelemetryHistory } from '../services/mockData';
import { getDevices, getDeviceTelemetry } from '../services/api';
import type { Device, WaterMeterPayload, TelemetryRecord } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

const DEFAULT_DEVICE_MAPPINGS: Record<string, string> = {
  'AA01020304050607': 'org1',
  'AA02030405060708': 'org1',
  'BB01020304050607': 'org1',
  'BB02030405060708': 'org2',
  'AA03040506070809': 'org2',
};

export default function WaterMetersPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [selected, setSelected] = useState<Device | null>(null);
  const [history, setHistory] = useState<TelemetryRecord[]>([]);

  // Cargar mappings
  const getMappings = (): Record<string, string> => {
    const stored = localStorage.getItem('device_organization_mappings');
    return stored ? JSON.parse(stored) : DEFAULT_DEVICE_MAPPINGS;
  };

  const mappings = getMappings();

  // Filtrar medidores por tipo y inquilino
  const waterDevices = devices.filter((d) => {
    if (d.deviceType !== 'water_meter') return false;
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[d.devEUI] || 'org1';
      return deviceOrg === user?.organizationId;
    }
    return true;
  });

  // Cargar dispositivos al montar el componente
  useEffect(() => {
    getDevices()
      .then((data) => {
        if (data && data.length > 0) {
          setDevices(data);
          // Filtrar medidores para seleccionar el primero
          const water = data.filter((d) => {
            if (d.deviceType !== 'water_meter') return false;
            if (user?.role !== 'superadmin') {
              const deviceOrg = mappings[d.devEUI] || 'org1';
              return deviceOrg === user?.organizationId;
            }
            return true;
          });
          if (water.length > 0) {
            setSelected(water[0]);
          } else {
            setSelected(null);
          }
        } else {
          // Si el backend no tiene dispositivos, usar mocks
          const water = MOCK_DEVICES.filter((d) => {
            if (d.deviceType !== 'water_meter') return false;
            if (user?.role !== 'superadmin') {
              const deviceOrg = mappings[d.devEUI] || 'org1';
              return deviceOrg === user?.organizationId;
            }
            return true;
          });
          setSelected(water.length > 0 ? water[0] : null);
        }
      })
      .catch((err) => {
        console.warn('Error cargando dispositivos reales, usando mock:', err);
        const water = MOCK_DEVICES.filter((d) => {
          if (d.deviceType !== 'water_meter') return false;
          if (user?.role !== 'superadmin') {
            const deviceOrg = mappings[d.devEUI] || 'org1';
            return deviceOrg === user?.organizationId;
          }
          return true;
        });
        setSelected(water.length > 0 ? water[0] : null);
      });
  }, [user]);

  // Cargar historial cuando cambia el dispositivo seleccionado
  useEffect(() => {
    if (!selected) return;

    getDeviceTelemetry(selected.devEUI, 48)
      .then((hist) => {
        if (hist && hist.length > 0) {
          setHistory([...hist].reverse());
        } else {
          setHistory(generateTelemetryHistory(selected.devEUI, 48));
        }
      })
      .catch(() => {
        setHistory(generateTelemetryHistory(selected.devEUI, 48));
      });
  }, [selected]);

  const chartData = history.map((h) => ({
    time: format(new Date(h.receivedAt), 'HH:mm'),
    caudal: Number(((h.decodedPayload as any).flow ?? 0).toFixed(2)),
    nivel: Number(((h.decodedPayload as any).level ?? 0).toFixed(1)),
    temp: Number(((h.decodedPayload as any).temperature ?? 0).toFixed(1)),
  }));

  const payload = selected?.lastTelemetry?.decodedPayload as WaterMeterPayload | undefined;

  if (!selected) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h2 className="page-title">Medidores de agua</h2>
            <p className="page-subtitle">Cargando dispositivos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Medidores de agua</h2>
          <p className="page-subtitle">{waterDevices.length} dispositivos registrados</p>
        </div>
      </div>

      <div className="two-col-layout">
        {/* Lista */}
        <div className="device-panel">
          {waterDevices.map((d) => {
            const p = d.lastTelemetry?.decodedPayload as WaterMeterPayload | undefined;
            const hasAlert = p?.alertLeak || p?.alertOverflow;
            return (
              <div
                key={d.id}
                className={`device-card ${selected.id === d.id ? 'selected' : ''} ${!d.active ? 'inactive' : ''}`}
                onClick={() => setSelected(d)}
              >
                <div className="device-card-header">
                  <div className="device-card-name">
                    {hasAlert && <AlertTriangle size={14} className="text-red-500 mr-1" />}
                    {d.name}
                  </div>
                  <span className={`status-pill ${d.active ? 'online' : 'offline'}`}>
                    {d.active ? 'online' : 'offline'}
                  </span>
                </div>
                <div className="device-card-stats">
                  <span><Droplets size={12} /> {p?.flow?.toFixed(1) ?? '—'} L/h</span>
                  <span><Thermometer size={12} /> {p?.temperature?.toFixed(1) ?? '—'}°C</span>
                  <span><Battery size={12} /> {p?.battery ?? '—'}%</span>
                </div>
                <div className="device-card-eui">{d.devEUI}</div>
              </div>
            );
          })}
        </div>

        {/* Detalle */}
        <div className="detail-panel">
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <h3 className="card-title">{selected.name}</h3>
              <span className={`status-pill ${selected.active ? 'online' : 'offline'}`}>
                {selected.active ? 'online' : 'offline'}
              </span>
            </div>
            <div className="metrics-grid">
              <div className="metric-box blue">
                <div className="metric-label">Caudal</div>
                <div className="metric-value">{payload?.flow?.toFixed(2) ?? '—'}<span className="metric-unit">L/h</span></div>
              </div>
              <div className="metric-box teal">
                <div className="metric-label">Nivel</div>
                <div className="metric-value">{payload?.level?.toFixed(0) ?? '—'}<span className="metric-unit">cm</span></div>
              </div>
              <div className="metric-box amber">
                <div className="metric-label">Temperatura</div>
                <div className="metric-value">{payload?.temperature?.toFixed(1) ?? '—'}<span className="metric-unit">°C</span></div>
              </div>
              <div className="metric-box purple">
                <div className="metric-label">Consumo total</div>
                <div className="metric-value">{payload?.totalConsumption?.toFixed(1) ?? '—'}<span className="metric-unit">m³</span></div>
              </div>
            </div>

            {/* Alertas activas */}
            {(payload?.alertLeak || payload?.alertOverflow || payload?.alertFrost || payload?.alertTamper) && (
              <div className="active-alerts">
                <div className="active-alerts-title">Alertas activas</div>
                {payload?.alertLeak && <div className="alert-tag red">Fuga detectada</div>}
                {payload?.alertOverflow && <div className="alert-tag red">Desborde</div>}
                {payload?.alertFrost && <div className="alert-tag blue">Riesgo de congelamiento</div>}
                {payload?.alertTamper && <div className="alert-tag amber">Manipulación</div>}
              </div>
            )}
          </div>

          {/* Gráfica caudal */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Caudal — últimas 48h</h3>
              <Activity size={14} style={{ color: '#1D9E75' }} />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={5} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="caudal" stroke="#1D9E75" strokeWidth={2} dot={false} name="Caudal (L/h)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
