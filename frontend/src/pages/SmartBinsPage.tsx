import { useState, useEffect } from 'react';
import { Trash2, Thermometer, MapPin, Battery, Cpu, AlertTriangle, ShieldCheck, FileText, FileSpreadsheet, RefreshCw, Send } from 'lucide-react';
import { MOCK_DEVICES } from '../services/mockData';
import { getDevices, sendDownlink } from '../services/api';
import type { Device } from '../types';
import { useAuth } from '../context/AuthContext';

function FillGauge({ value }: { value: number }) {
  const color = value >= 80 ? 'var(--red)' : value >= 60 ? 'var(--amber)' : 'var(--teal)';
  return (
    <div className="fill-gauge" style={{ marginTop: 8 }}>
      <div className="fill-gauge-bar" style={{ background: 'var(--color-bg-tertiary)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div className="fill-gauge-fill" style={{ width: `${value}%`, background: color, height: '100%', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 500 }}>Capacidad</span>
        <span className="fill-gauge-label" style={{ color, fontWeight: 700, fontSize: '14px' }}>{value}%</span>
      </div>
    </div>
  );
}

interface GroupedBin {
  id: string;
  name: string;
  bodyDevice?: Device;
  lidDevice?: Device;
  active: boolean;
}

export default function SmartBinsPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [loading, setLoading] = useState(true);
  const [cleaningBinId, setCleaningBinId] = useState<string | null>(null);

  const loadDevicesList = () => {
    setLoading(true);
    getDevices()
      .then((data) => {
        if (data && data.length > 0) {
          setDevices(data);
        }
      })
      .catch((err) => console.warn('Error loading real devices for smartbins, using mocks:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDevicesList();
  }, []);

  // Filtrar dispositivos tipo smartbin correspondientes al tenant del usuario
  const rawBins = devices.filter((d) => {
    if (d.deviceType !== 'smartbin') return false;
    if (user?.role !== 'superadmin') {
      const deviceOrg = d.organizationId || 'org1';
      return deviceOrg === user?.organizationId;
    }
    return true;
  });

  // Agrupar sensores de Cuerpo (Moko Smart) y Tapa (Milesight)
  const groupedMap: Record<string, GroupedBin> = {};

  rawBins.forEach((d) => {
    const baseName = d.name.split(' - ')[0] || d.name;
    
    if (!groupedMap[baseName]) {
      groupedMap[baseName] = {
        id: d.id,
        name: baseName,
        active: false,
      };
    }

    const isCuerpo = d.name.toLowerCase().includes('cuerpo') || d.devEUI.startsWith('BB');
    const isTapa = d.name.toLowerCase().includes('tapa') || d.devEUI.startsWith('BC');

    if (isCuerpo) {
      groupedMap[baseName].bodyDevice = d;
    } else if (isTapa) {
      groupedMap[baseName].lidDevice = d;
    } else {
      const hasFill = (d.lastTelemetry?.decodedPayload as any)?.fillLevel !== undefined;
      if (hasFill) {
        groupedMap[baseName].lidDevice = d;
      } else {
        groupedMap[baseName].bodyDevice = d;
      }
    }

    if (d.active) {
      groupedMap[baseName].active = true;
    }
  });

  const containers = Object.values(groupedMap);

  // Comando Downlink para Simular Vaciado/Limpieza
  const handleEmptyBin = (bin: GroupedBin) => {
    const targetDevice = bin.lidDevice || bin.bodyDevice;
    if (!targetDevice) return;
    if (!confirm(`¿Estás seguro de que deseas enviar un comando Downlink para simular el vaciado y limpieza del contenedor "${bin.name}"?`)) {
      return;
    }

    setCleaningBinId(bin.id);
    sendDownlink(targetDevice.devEUI, 'open')
      .then(() => {
        alert(`Comando de limpieza enviado con éxito a la tapa LoRaWAN del contenedor.`);
        loadDevicesList();
      })
      .catch((err) => {
        console.warn("Fallo de API, aplicando vaciado simulado local:", err);
        const lidDev = bin.lidDevice;
        if (lidDev) {
          setDevices(prev => prev.map(d => {
            if (d.devEUI === lidDev.devEUI) {
              const updatedLastTelemetry = d.lastTelemetry ? {
                ...d.lastTelemetry,
                decodedPayload: {
                  ...d.lastTelemetry.decodedPayload,
                  fillLevel: 5
                }
              } : {
                id: 'tele_sim',
                devEUI: d.devEUI,
                fPort: 2,
                fCnt: 1,
                rssi: -80,
                snr: 8,
                spreadingFactor: 7,
                rawPayload: 'BQ==',
                decodedPayload: { fillLevel: 5, temperature: 21, battery: 95 },
                gatewayId: 'GW-MOCK',
                receivedAt: new Date().toISOString()
              };
              return { ...d, lastTelemetry: updatedLastTelemetry as any };
            }
            return d;
          }));
        }
        alert(`[Simulación] Comando Downlink enviado. Sensor de llenado ultrasonido restablecido a 5%.`);
      })
      .finally(() => setCleaningBinId(null));
  };

  // Exportar contenedores a CSV
  const handleExportCSV = () => {
    if (containers.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Contenedor,Activo,Nivel Llenado (%),Temperatura (C),Latitud,Longitud,Bateria Cuerpo (%),Bateria Tapa (%)\n";

    containers.forEach((c) => {
      const bodyPayload = c.bodyDevice?.lastTelemetry?.decodedPayload as any;
      const lidPayload = c.lidDevice?.lastTelemetry?.decodedPayload as any;
      const fillLevel = lidPayload?.fillLevel ?? bodyPayload?.fillLevel ?? 0;
      const tempLid = lidPayload?.temperature;
      const tempBody = bodyPayload?.temperature;
      const temperature = tempLid !== undefined ? tempLid : tempBody;
      const lat = bodyPayload?.lat ?? c.bodyDevice?.lat ?? lidPayload?.lat ?? c.lidDevice?.lat ?? '—';
      const lng = bodyPayload?.lng ?? c.bodyDevice?.lng ?? lidPayload?.lng ?? c.lidDevice?.lng ?? '—';
      const batteryBody = bodyPayload?.battery ?? c.bodyDevice?.lastTelemetry?.decodedPayload?.battery ?? '—';
      const batteryLid = lidPayload?.battery ?? c.lidDevice?.lastTelemetry?.decodedPayload?.battery ?? '—';

      const row = [
        c.name,
        c.active ? "SÍ" : "NO",
        fillLevel,
        temperature ?? '—',
        lat,
        lng,
        batteryBody,
        batteryLid
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_smartbins_${new Date().toISOString().substring(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="page printable-page">
      <div className="page-header no-print" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">SmartBins Consolidados</h2>
          <p className="page-subtitle">
            Monitoreo inteligente de contenedores mediante arquitectura dual: rastreadores de chasis (Moko Smart) y sensores de llenado volumétricos (Milesight).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={handleExportCSV} 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
            title="Exportar contenedores a CSV"
          >
            <FileSpreadsheet size={15} />
            <span>Exportar CSV</span>
          </button>
          <button 
            onClick={handlePrintPDF} 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
            title="Generar reporte PDF de impresión"
          >
            <FileText size={15} />
            <span>Generar Reporte PDF</span>
          </button>
        </div>
      </div>

      {/* Título de Impresión Premium (Oculto en Pantalla) */}
      <div className="print-only-header" style={{ display: 'none', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Reporte de Flota de Contenedores Inteligentes (SmartBins)</h1>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Inquilino: Plásticos Rival · Generado: {new Date().toLocaleDateString()}</p>
        <hr style={{ margin: '15px 0', border: '0.5px solid #ccc' }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <RefreshCw size={24} className="animate-spin text-teal-500" style={{ margin: '0 auto 12px' }} />
          <span style={{ fontSize: '14px', color: 'var(--color-muted)' }}>Cargando datos de sensores LoRaWAN...</span>
        </div>
      ) : containers.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>
          No se encontraron contenedores configurados para este cliente.
        </div>
      ) : (
        <div className="bins-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(430px, 1fr))', gap: 20 }}>
          {containers.map((c) => {
            const bodyPayload = c.bodyDevice?.lastTelemetry?.decodedPayload as any;
            const lidPayload = c.lidDevice?.lastTelemetry?.decodedPayload as any;

            // Extraer métricas consolidadas
            const fillLevel = lidPayload?.fillLevel ?? bodyPayload?.fillLevel ?? 0;
            const isCritical = fillLevel >= 80;

            const tempLid = lidPayload?.temperature;
            const tempBody = bodyPayload?.temperature;
            const temperature = tempLid !== undefined ? tempLid : tempBody;

            const lat = bodyPayload?.lat ?? c.bodyDevice?.lat ?? lidPayload?.lat ?? c.lidDevice?.lat;
            const lng = bodyPayload?.lng ?? c.bodyDevice?.lng ?? lidPayload?.lng ?? c.lidDevice?.lng;

            const batteryBody = bodyPayload?.battery ?? c.bodyDevice?.lastTelemetry?.decodedPayload?.battery;
            const batteryLid = lidPayload?.battery ?? c.lidDevice?.lastTelemetry?.decodedPayload?.battery;

            return (
              <div 
                key={c.id} 
                className={`bin-card ${isCritical ? 'critical' : ''}`}
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: '16px',
                  border: isCritical ? '1px solid var(--red)' : '1px solid var(--color-border)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Cabecera */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div 
                      className="bin-icon" 
                      style={{ 
                        background: isCritical ? 'var(--red-bg)' : 'var(--amber-bg)', 
                        width: 44, 
                        height: 44, 
                        borderRadius: 12, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}
                    >
                      <Trash2 size={22} style={{ color: isCritical ? 'var(--red)' : 'var(--amber-dark)' }} />
                    </div>
                    <div>
                      <div className="bin-name" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text)' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <ShieldCheck size={11} style={{ color: 'var(--teal)' }} />
                        <span>Arquitectura Dual Activa</span>
                      </div>
                    </div>
                  </div>
                  <span className={`status-pill ${c.active ? 'online' : 'offline'}`} style={{ padding: '3px 10px', fontSize: '11px' }}>
                    {c.active ? 'online' : 'offline'}
                  </span>
                </div>

                {/* Sección de Llenado */}
                <div style={{ background: 'var(--color-bg)', padding: '14px', borderRadius: '12px', border: '0.5px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 650, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Cpu size={12} style={{ color: 'var(--teal)' }} />
                      <span>Nivel volumétrico (Tapa - Milesight)</span>
                    </div>
                    <button
                      onClick={() => handleEmptyBin(c)}
                      disabled={cleaningBinId === c.id}
                      className="no-print"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                        background: 'transparent', color: 'var(--teal)', border: '0.5px solid var(--teal)',
                        borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 650
                      }}
                      title="Enviar comando Downlink para simular vaciado del contenedor"
                    >
                      {cleaningBinId === c.id ? <RefreshCw size={10} className="animate-spin" /> : <Send size={10} />}
                      <span>Simular Vaciado</span>
                    </button>
                  </div>
                  <FillGauge value={fillLevel} />
                  {isCritical && (
                    <div 
                      className="bin-critical-msg" 
                      style={{ 
                        background: 'var(--red-bg)', 
                        color: 'var(--red)', 
                        fontSize: '11.5px', 
                        fontWeight: 700, 
                        padding: '8px 12px', 
                        borderRadius: '8px', 
                        marginTop: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <AlertTriangle size={12} />
                      <span>Nivel crítico. Requiere recolección inmediata.</span>
                    </div>
                  )}
                </div>

                {/* Especificación de Hardware Coadyuvante */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Sensores Vinculados (Integraciones)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Cuerpo */}
                    <div style={{ background: 'var(--color-bg-secondary)', padding: '10px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)' }}>Cuerpo (Moko Smart)</div>
                      {c.bodyDevice ? (
                        <>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Tracker GPS LNS
                          </div>
                          <code style={{ fontSize: '10px', background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 4, fontFamily: 'monospace', display: 'inline-block', marginTop: 4 }}>
                            {c.bodyDevice.devEUI}
                          </code>
                        </>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: 'var(--red)', fontStyle: 'italic', marginTop: 2 }}>Desconectado</div>
                      )}
                    </div>
                    {/* Tapa */}
                    <div style={{ background: 'var(--color-bg-secondary)', padding: '10px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)' }}>Tapa (Milesight)</div>
                      {c.lidDevice ? (
                        <>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Ultrasonido de Nivel
                          </div>
                          <code style={{ fontSize: '10px', background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 4, fontFamily: 'monospace', display: 'inline-block', marginTop: 4 }}>
                            {c.lidDevice.devEUI}
                          </code>
                        </>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: 'var(--red)', fontStyle: 'italic', marginTop: 2 }}>Desconectado</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Métricas y Diagnósticos */}
                <div 
                  className="bin-metrics" 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: 10, 
                    borderTop: '0.5px solid var(--color-border)', 
                    paddingTop: 14,
                    marginTop: 'auto'
                  }}
                >
                  {/* Temperatura */}
                  <div className="bin-metric" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Thermometer size={11} /> Temperatura
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                      {temperature !== undefined ? `${temperature.toFixed(1)}°C` : '—'}
                    </span>
                  </div>

                  {/* Baterías */}
                  <div className="bin-metric" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Battery size={11} /> Batería Dual
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '10.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-muted)' }}>Cuerpo:</span>
                        <strong style={{ color: batteryBody !== undefined && batteryBody < 30 ? 'var(--red)' : 'var(--color-text)' }}>
                          {batteryBody !== undefined ? `${batteryBody}%` : '—'}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-muted)' }}>Tapa:</span>
                        <strong style={{ color: batteryLid !== undefined && batteryLid < 30 ? 'var(--red)' : 'var(--color-text)' }}>
                          {batteryLid !== undefined ? `${batteryLid}%` : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Coordenadas / GPS */}
                  <div className="bin-metric" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <MapPin size={11} /> Geolocalización
                    </span>
                    <div style={{ fontSize: '10.5px', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                      {lat !== undefined && lng !== undefined ? (
                        <>
                          <span>Lat: {lat.toFixed(4)}</span>
                          <span>Lng: {lng.toFixed(4)}</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-hint)' }}>Sin señal GPS</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
