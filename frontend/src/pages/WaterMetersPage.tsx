import { useState, useEffect } from 'react';
import { Droplets, AlertTriangle, Thermometer, Activity, Battery } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MOCK_DEVICES, generateTelemetryHistory } from '../services/mockData';
import { getDevices, getDeviceTelemetry } from '../services/api';
import type { Device, WaterMeterPayload, TelemetryRecord } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';


const safeFormatNum = (val: any, decimals: number): string => {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  return isNaN(num) ? '—' : num.toFixed(decimals);
};

export default function WaterMetersPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [selected, setSelected] = useState<Device | null>(null);
  const [history, setHistory] = useState<TelemetryRecord[]>([]);

  // Filtrar medidores por tipo y inquilino
  const waterDevices = devices.filter((d) => {
    if (d.deviceType !== 'water_meter') return false;
    if (user?.role !== 'superadmin') {
      const deviceOrg = d.organizationId || 'org1';
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
              const deviceOrg = d.organizationId || 'org1';
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
              const deviceOrg = d.organizationId || 'org1';
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
            const deviceOrg = d.organizationId || 'org1';
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

  const chartData = history.map((h) => {
    const rawFlow = h.decodedPayload ? (h.decodedPayload as any).flow : null;
    const rawLevel = h.decodedPayload ? (h.decodedPayload as any).level : null;
    const rawTemp = h.decodedPayload ? (h.decodedPayload as any).temperature : null;
    
    const flowNum = rawFlow !== null && rawFlow !== undefined ? Number(rawFlow) : NaN;
    const levelNum = rawLevel !== null && rawLevel !== undefined ? Number(rawLevel) : NaN;
    const tempNum = rawTemp !== null && rawTemp !== undefined ? Number(rawTemp) : NaN;

    return {
      time: format(new Date(h.receivedAt), 'HH:mm'),
      caudal: !isNaN(flowNum) ? Number(flowNum.toFixed(2)) : 0,
      nivel: !isNaN(levelNum) ? Number(levelNum.toFixed(1)) : 0,
      temp: !isNaN(tempNum) ? Number(tempNum.toFixed(1)) : 0,
    };
  });

  const latestTelemetry = history.length > 0 ? history[history.length - 1] : selected?.lastTelemetry;
  const payload = latestTelemetry?.decodedPayload as WaterMeterPayload | undefined;


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
                  <span><Droplets size={12} /> {safeFormatNum(p?.flow, 1)} L/h</span>
                  <span><Thermometer size={12} /> {safeFormatNum(p?.temperature, 1)}°C</span>
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
                <div className="metric-value">{safeFormatNum(payload?.flow, 2)}<span className="metric-unit">L/h</span></div>
              </div>
              <div className="metric-box teal">
                <div className="metric-label">Nivel</div>
                <div className="metric-value">{safeFormatNum(payload?.level, 0)}<span className="metric-unit">cm</span></div>
              </div>
              <div className="metric-box amber">
                <div className="metric-label">Temperatura</div>
                <div className="metric-value">{safeFormatNum(payload?.temperature, 1)}<span className="metric-unit">°C</span></div>
              </div>
              <div className="metric-box purple">
                <div className="metric-label">Consumo total</div>
                <div className="metric-value">{safeFormatNum(payload?.totalConsumption, 1)}<span className="metric-unit">m³</span></div>
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
