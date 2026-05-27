import { useState, useEffect } from 'react';
import { Droplets, AlertTriangle, Thermometer, Activity, Battery, Radio, RefreshCw, FileText, FileSpreadsheet } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MOCK_DEVICES, generateTelemetryHistory } from '../services/mockData';
import { getDevices, getDeviceTelemetry, sendDownlink } from '../services/api';
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
  const [sendingDownlink, setSendingDownlink] = useState(false);

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

  // Toggle Válvula Solenoide (Downlink)
  const handleToggleValve = () => {
    if (!selected) return;
    const newCommand = selected.valveOpen ? 'close' : 'open';
    if (!confirm(`¿Estás seguro de que deseas ${newCommand === 'close' ? 'CERRAR' : 'ABRIR'} la válvula solenoide del dispositivo "${selected.name}"?`)) {
      return;
    }

    setSendingDownlink(true);
    sendDownlink(selected.devEUI, newCommand)
      .then((res) => {
        const updated = { ...selected, valveOpen: res.valveOpen };
        setSelected(updated);
        setDevices(prev => prev.map(d => d.devEUI === selected.devEUI ? { ...d, valveOpen: res.valveOpen } : d));
        alert(`Válvula solenoide ${res.valveOpen ? 'abierta' : 'cerrada'} con éxito.`);
      })
      .catch((err) => {
        console.warn("Falla de API, usando fallback simulado:", err);
        const fallbackState = newCommand === 'open';
        const updated = { ...selected, valveOpen: fallbackState };
        setSelected(updated);
        setDevices(prev => prev.map(d => d.devEUI === selected.devEUI ? { ...d, valveOpen: fallbackState } : d));
        alert(`[Simulación] Comando de válvula solenoide enviado con éxito.`);
      })
      .finally(() => setSendingDownlink(false));
  };

  // Exportar telemetrías a CSV
  const handleExportCSV = () => {
    if (history.length === 0 || !selected) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha,devEUI,Caudal (L/h),Nivel (cm),Temperatura (C),Bateria (%),RSSI,SNR\n";
    
    history.forEach((h) => {
      const p = h.decodedPayload as any;
      const row = [
        new Date(h.receivedAt).toISOString(),
        h.devEUI,
        p?.flow ?? '—',
        p?.level ?? '—',
        p?.temperature ?? '—',
        p?.battery ?? '—',
        h.rssi,
        h.snr
      ].join(",");
      csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_consumo_${selected.devEUI}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    window.print();
  };

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
    <div className="page printable-page">
      <div className="page-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Medidores de agua</h2>
          <p className="page-subtitle">{waterDevices.length} dispositivos registrados</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={handleExportCSV} 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
            title="Exportar telemetrías a CSV"
          >
            <FileSpreadsheet size={15} />
            <span>Exportar CSV</span>
          </button>
          <button 
            onClick={handlePrintPDF} 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
            title="Generar reporte de impresión PDF"
          >
            <FileText size={15} />
            <span>Generar Reporte PDF</span>
          </button>
        </div>
      </div>

      {/* Título de Impresión Premium (Oculto en Pantalla) */}
      <div className="print-only-header" style={{ display: 'none', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Reporte de Consumo e Infraestructura de Agua</h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Inquilino: Plásticos Rival · Generado: {new Date().toLocaleDateString()}</p>
        <hr style={{ margin: '15px 0', border: '0.5px solid #ccc' }} />
      </div>

      <div className="two-col-layout">
        {/* Lista */}
        <div className="device-panel no-print">
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

          {/* Control de Válvula Solenoide (Downlink) */}
          <div className="card no-print" style={{ marginBottom: 12 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650 }}>
                <Radio size={16} className="text-teal-500" />
                <span>Control de Válvula Solenoide (Downlink)</span>
              </h3>
              <span className={`status-pill ${selected.valveOpen !== false ? 'online' : 'offline'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                {selected.valveOpen !== false ? 'VÁLVULA ABIERTA' : 'VÁLVULA CERRADA'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 16 }}>
              <p className="text-muted" style={{ fontSize: 12, margin: 0, maxWidth: '75%', lineHeight: 1.4 }}>
                {selected.valveOpen !== false 
                  ? 'La válvula de flujo está abierta de forma operativa. Presiona el botón para cerrarla en caso de fuga de emergencia.' 
                  : 'La válvula está cerrada. No hay paso de flujo de agua por la tubería. Presiona abrir para restablecer el servicio.'}
              </p>
              <button
                onClick={handleToggleValve}
                disabled={sendingDownlink}
                className={selected.valveOpen !== false ? 'btn-primary' : 'btn-secondary'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'center', height: 34,
                  background: selected.valveOpen !== false ? 'var(--red)' : 'var(--teal)',
                  color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12
                }}
              >
                {sendingDownlink ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : selected.valveOpen !== false ? (
                  'Cerrar Válvula'
                ) : (
                  'Abrir Válvula'
                )}
              </button>
            </div>
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
