import { useState, useEffect } from 'react';
import {
  Droplets, Trash2, Wifi, WifiOff, Search, Cpu, RefreshCw,
  Shield, Thermometer, Activity, Battery, Clock, Database, X, Radio, AlertTriangle,
  Edit, Check, Settings, Building
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { MOCK_DEVICES, generateTelemetryHistory } from '../services/mockData';
import { getDevices, getIntegrations, getDeviceTelemetry, updateDevice } from '../services/api';
import type { Device, Integration, TelemetryRecord } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

export default function DevicesPage() {
  const { user, clients } = useAuth();

  // Helper de formateo de fechas a prueba de fallos
  const safeFormatDate = (dateVal?: any, formatStr = 'dd/MM/yyyy HH:mm:ss', fallback = '—') => {
    if (!dateVal) return fallback;
    try {
      const parsedDate = new Date(dateVal);
      if (!isNaN(parsedDate.getTime())) {
        return format(parsedDate, formatStr);
      }
    } catch (e) {
      console.warn('Error formatting date:', e);
    }
    return fallback;
  };

  const formatInstallationDate = (dateStr?: string) => {
    if (!dateStr || !dateStr.trim()) return 'No registrada';
    try {
      const cleanDateStr = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00';
      const parsedDate = new Date(cleanDateStr);
      if (!isNaN(parsedDate.getTime())) {
        return format(parsedDate, 'dd/MM/yyyy');
      }
    } catch (e) {
      console.warn('Error formatting installation date:', e);
    }
    return dateStr;
  };

  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<string>('all');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'water_meter' | 'smartbin'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedFilterOrgId, setSelectedFilterOrgId] = useState('all');

  // Resolver recursivamente todas las organizaciones descendientes (subclientes de subclientes)
  const getDescendantOrgIds = (orgId: string): string[] => {
    const ids: string[] = [orgId];
    const getChildren = (id: string) => {
      const children = clients.filter(c => c.parentId === id);
      children.forEach(child => {
        ids.push(child.id);
        getChildren(child.id);
      });
    };
    getChildren(orgId);
    return ids;
  };

  const visibleOrgIds = user?.role === 'superadmin'
    ? []
    : (user?.organizationId ? getDescendantOrgIds(user.organizationId) : []);

  const visibleClients = clients.filter(c => {
    if (user?.role === 'superadmin') return true;
    return visibleOrgIds.includes(c.id);
  });

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceTelemetryHistory, setDeviceTelemetryHistory] = useState<TelemetryRecord[]>([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [expandedTelemetryLogs, setExpandedTelemetryLogs] = useState<Record<string, boolean>>({});

  // Estados para la edición de parámetros estáticos
  const [isEditingStatic, setIsEditingStatic] = useState(false);
  const [editAlias, setEditAlias] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editInstallationDate, setEditInstallationDate] = useState('');
  const [editLocationDesc, setEditLocationDesc] = useState('');
  const [editCodecJs, setEditCodecJs] = useState('');

  const handleAssignOrg = (devEUI: string, orgId: string) => {
    updateDevice(devEUI, { organizationId: orgId })
      .then(() => {
        setDevices(prev => prev.map(d => d.devEUI === devEUI ? { ...d, organizationId: orgId } : d));
        if (selectedDevice?.devEUI === devEUI) {
          setSelectedDevice(prev => prev ? { ...prev, organizationId: orgId } : null);
        }
      })
      .catch((err) => {
        console.error("Error al asignar organización al dispositivo:", err);
        alert("No se pudo actualizar la organización del dispositivo.");
      });

    // Limpiar grupos que contengan este dispositivo si cambió de org
    const savedGroups = localStorage.getItem('device_groups');
    if (savedGroups) {
      try {
        const allGroups = JSON.parse(savedGroups);
        const cleaned = allGroups.map((g: any) => {
          if (g.organizationId !== orgId && g.deviceEUIs.includes(devEUI)) {
            return { ...g, deviceEUIs: g.deviceEUIs.filter((e: string) => e !== devEUI) };
          }
          return g;
        });
        localStorage.setItem('device_groups', JSON.stringify(cleaned));
      } catch (_) {}
    }
  };

  const handleSelectDevice = (device: Device) => {
    setSelectedDevice(device);
    setLoadingTelemetry(true);
    setExpandedTelemetryLogs({});

    // Populate static params
    const params = device.staticParams || {};
    setEditAlias(params.customAlias || '');
    setEditLat(device.lat !== undefined ? String(device.lat) : '');
    setEditLng(device.lng !== undefined ? String(device.lng) : '');
    setEditInstallationDate(params.installationDate || '');
    setEditLocationDesc(params.locationDescription || '');
    setEditCodecJs(device.codecJs || '');
    setIsEditingStatic(false);

    getDeviceTelemetry(device.devEUI, 20)
      .then((history) => {
        if (history && history.length > 0) {
          setDeviceTelemetryHistory(history);
        } else {
          setDeviceTelemetryHistory(generateTelemetryHistory(device.devEUI, 20));
        }
      })
      .catch(() => {
        setDeviceTelemetryHistory(generateTelemetryHistory(device.devEUI, 20));
      })
      .finally(() => setLoadingTelemetry(false));
  };

  const handleSaveStaticParams = () => {
    if (!selectedDevice) return;

    const latNum = editLat.trim() ? Number(editLat) : undefined;
    const lngNum = editLng.trim() ? Number(editLng) : undefined;

    if (latNum !== undefined && isNaN(latNum)) {
      alert('La latitud debe ser un número válido');
      return;
    }
    if (lngNum !== undefined && isNaN(lngNum)) {
      alert('La longitud debe ser un número válido');
      return;
    }

    const updatedParams = {
      customAlias: editAlias.trim() || undefined,
      lat: latNum,
      lng: lngNum,
      installationDate: editInstallationDate.trim() || undefined,
      locationDescription: editLocationDesc.trim() || undefined
    };

    // Guardar en localStorage
    const stored = localStorage.getItem('device_static_parameters');
    let allParams: Record<string, any> = {};
    if (stored) {
      try {
        allParams = JSON.parse(stored);
      } catch (_) {}
    }
    
    allParams[selectedDevice.devEUI] = updatedParams;
    localStorage.setItem('device_static_parameters', JSON.stringify(allParams));

    // Guardar en la base de datos real a través de la API
    updateDevice(selectedDevice.devEUI, {
      name: updatedParams.customAlias || selectedDevice.devEUI,
      lat: latNum,
      lng: lngNum,
      codecJs: editCodecJs.trim() || null
    })
      .then(() => {
        const updatedDevice: Device = {
          ...selectedDevice,
          name: updatedParams.customAlias || selectedDevice.name,
          lat: latNum ?? selectedDevice.lat,
          lng: lngNum ?? selectedDevice.lng,
          codecJs: editCodecJs.trim() || undefined,
          staticParams: updatedParams
        };
        
        setSelectedDevice(updatedDevice);
        
        // Actualizar en la lista local de dispositivos
        setDevices(prev => prev.map(d => {
          if (d.devEUI === selectedDevice.devEUI) {
            return {
              ...d,
              name: updatedParams.customAlias || d.name,
              lat: latNum ?? d.lat,
              lng: lngNum ?? d.lng,
              codecJs: editCodecJs.trim() || undefined,
              staticParams: updatedParams
            };
          }
          return d;
        }));

        setIsEditingStatic(false);
      })
      .catch((err) => {
        console.error("Error al actualizar parámetros en la base de datos:", err);
        alert("Ocurrió un error al guardar la configuración en la base de datos del servidor.");
      });
  };

  const handleCloseDrawer = () => {
    setSelectedDevice(null);
    setDeviceTelemetryHistory([]);
  };

  useEffect(() => {
    getIntegrations()
      .then((data) => { if (data) setIntegrations(data); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const integrationParam = selectedIntegration === 'all' ? undefined : selectedIntegration;
    getDevices(integrationParam)
      .then((data) => { if (data) setDevices(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedIntegration]);

  const filtered = devices.filter((d) => {
    const nameStr = d.name || '';
    const matchSearch = nameStr.toLowerCase().includes(search.toLowerCase()) || d.devEUI.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || d.deviceType === typeFilter;
    
    if (user?.role !== 'superadmin') {
      // Un cliente puede ver sus propios dispositivos y los de todos sus sub-clientes jerárquicos
      if (selectedFilterOrgId !== 'all') {
        if (d.organizationId !== selectedFilterOrgId) return false;
      } else {
        if (!visibleOrgIds.includes(d.organizationId || '')) return false;
      }
    } else {
      if (selectedFilterOrgId !== 'all') {
        if (d.organizationId !== selectedFilterOrgId) return false;
      }
    }
    return matchSearch && matchType;
  });

  const filteredIntegrations = integrations.filter((int) => {
    if (user?.role === 'superadmin') return true;
    const org = int.organizationId || 'org1';
    return org.split(',').map((s) => s.trim()).includes(user?.organizationId || '');
  });

  return (
    <div className="page">
      <div className="page-header" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 16, marginBottom: 20 }}>
        <div>
          <h2 className="page-title">Dispositivos</h2>
          <p className="page-subtitle">
            Administra tus sensores LoRaWAN y asigna clientes por dispositivo.
            {user?.role !== 'superadmin' && ` · Cliente: ${clients.find(c => c.id === user?.organizationId)?.name || 'Empresa Demo S.A.'}`}
          </p>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <div className="search-box" style={{ maxWidth: 300, flex: 1 }}>
            <Search size={15} />
            <input
              placeholder="Buscar por nombre o devEUI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={14} className="text-muted" />
            <select
              className="form-input"
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
              style={{ width: 'auto', padding: '6px 12px', fontSize: 13, height: '36px' }}
            >
              <option value="all">Todas las integraciones</option>
              {filteredIntegrations.map((int) => (
                <option key={int.id} value={int.id}>{int.name}</option>
              ))}
            </select>
          </div>

          {(user?.role === 'superadmin' || visibleClients.length > 1) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building size={14} className="text-muted" />
              <select
                className="form-input"
                value={selectedFilterOrgId}
                onChange={(e) => setSelectedFilterOrgId(e.target.value)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: 13, height: '36px' }}
              >
                <option value="all">{user?.role === 'superadmin' ? 'Todos los clientes' : 'Todos (Propios y Subclientes)'}</option>
                {visibleClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.id === user?.organizationId ? '(Tus Dispositivos)' : '(Subcliente)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

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
                {(user?.role === 'superadmin' || visibleClients.length > 1) && <th>Cliente Asociado (Tenant)</th>}
                <th>Último dato</th>
                <th>RSSI / SNR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isWater = d.deviceType === 'water_meter';
                const isSelected = selectedDevice?.id === d.id;
                return (
                  <tr
                    key={d.id}
                    onClick={() => handleSelectDevice(d)}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer' }}
                  >
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

                    {(user?.role === 'superadmin' || visibleClients.length > 1) && (
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Shield size={12} className="text-purple-500" />
                          <select
                            value={d.organizationId || 'org1'}
                            onChange={(e) => { e.stopPropagation(); handleAssignOrg(d.devEUI, e.target.value); }}
                            onClick={(e) => e.stopPropagation()}
                            className="form-input"
                            style={{ padding: '2px 6px', fontSize: 12, height: 26, width: 'auto', border: '0.5px solid var(--color-border)' }}
                          >
                            {visibleClients.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    )}

                    <td className="table-muted">
                      {d.lastTelemetry ? safeFormatDate(d.lastTelemetry.receivedAt, 'dd/MM HH:mm') : '—'}
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

      {/* DRAWER LATERAL: DETALLE DE TELEMETRÍA */}
      {selectedDevice && (
        <div className="slide-over-overlay-left" onClick={handleCloseDrawer}>
          <div className="slide-over-drawer-left" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 'calc(100% - 40px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="device-type-icon" style={{ background: selectedDevice.deviceType === 'water_meter' ? 'var(--blue-bg)' : 'var(--amber-bg)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedDevice.deviceType === 'water_meter' ? (
                      <Droplets size={15} style={{ color: 'var(--blue-dark)' }} />
                    ) : (
                      <Trash2 size={15} style={{ color: 'var(--amber-dark)' }} />
                    )}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                    {selectedDevice.name}
                  </h3>
                  <span className={`status-pill ${selectedDevice.active ? 'online' : 'offline'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                    {selectedDevice.active ? <><Wifi size={10} /> online</> : <><WifiOff size={10} /> offline</>}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--color-muted)' }}>
                  <code style={{ background: 'var(--gray-bg)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '11px' }}>
                    {selectedDevice.devEUI}
                  </code>
                  <span>·</span>
                  <span className={`type-badge ${selectedDevice.deviceType === 'water_meter' ? 'water' : 'bin'}`} style={{ padding: '1px 6px', fontSize: '10px' }}>
                    {selectedDevice.deviceType === 'water_meter' ? 'Medidor agua' : 'SmartBin'}
                  </span>
                </div>
              </div>

              <button
                className="btn-secondary"
                onClick={handleCloseDrawer}
                style={{ padding: 0, minWidth: '32px', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 650, color: 'var(--color-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Database size={13} />
                  <span>Última Telemetría Recibida</span>
                </h4>

                {loadingTelemetry ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                    <RefreshCw size={18} className="animate-spin text-muted" />
                  </div>
                ) : deviceTelemetryHistory.length === 0 ? (
                  <div style={{ background: 'var(--color-bg)', borderRadius: 10, padding: 16, textAlign: 'center', color: 'var(--color-hint)', fontSize: '13px' }}>
                    Sin datos de telemetría disponibles para este dispositivo.
                  </div>
                ) : (
                  (() => {
                    const latest = deviceTelemetryHistory[0];
                    const isWater = selectedDevice.deviceType === 'water_meter';

                    if (isWater) {
                      const payload = (latest.decodedPayload as any) || {};
                      const hasAlert = !!(payload.alertLeak || payload.alertOverflow || payload.alertFrost || payload.alertTamper);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 0 }}>
                            <div className="metric-box blue" style={{ padding: '12px 14px' }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><Activity size={11} /> Caudal</div>
                              <div className="metric-value" style={{ fontSize: '20px' }}>
                                {payload.flow !== undefined && !isNaN(Number(payload.flow)) ? Number(payload.flow).toFixed(2) : '—'}
                                <span className="metric-unit" style={{ fontSize: '12px' }}>L/h</span>
                              </div>
                            </div>
                            <div className="metric-box teal" style={{ padding: '12px 14px' }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><Droplets size={11} /> Nivel</div>
                              <div className="metric-value" style={{ fontSize: '20px' }}>
                                {payload.level !== undefined && !isNaN(Number(payload.level)) ? Number(payload.level).toFixed(0) : '—'}
                                <span className="metric-unit" style={{ fontSize: '12px' }}>cm</span>
                              </div>
                            </div>
                            <div className="metric-box amber" style={{ padding: '12px 14px' }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><Thermometer size={11} /> Temperatura</div>
                              <div className="metric-value" style={{ fontSize: '20px' }}>
                                {payload.temperature !== undefined && !isNaN(Number(payload.temperature)) ? Number(payload.temperature).toFixed(1) : '—'}
                                <span className="metric-unit" style={{ fontSize: '12px' }}>°C</span>
                              </div>
                            </div>
                            <div className="metric-box purple" style={{ padding: '12px 14px' }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><Battery size={11} /> Batería</div>
                              <div className="metric-value" style={{ fontSize: '20px' }}>
                                {payload.battery ?? '—'}<span className="metric-unit" style={{ fontSize: '12px' }}>%</span>
                              </div>
                            </div>
                          </div>
                          {payload.totalConsumption !== undefined && (
                            <div style={{ background: 'var(--color-bg)', padding: '10px 14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '0.5px solid var(--color-border)' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)' }}>Consumo Total Acumulado:</span>
                              <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--teal-dark)' }}>
                                {!isNaN(Number(payload.totalConsumption)) ? Number(payload.totalConsumption).toFixed(1) : '—'} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-muted)' }}>m³</span>
                              </span>
                            </div>
                          )}
                          {hasAlert && (
                            <div style={{ background: 'var(--red-bg)', padding: '10px 14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: 6, border: '0.5px solid rgba(163, 45, 45, 0.2)' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={12} /><span>Alertas Activas</span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {payload.alertLeak && <span className="alert-tag red" style={{ margin: 0, padding: '2px 8px', fontSize: '11px' }}>Fuga</span>}
                                {payload.alertOverflow && <span className="alert-tag red" style={{ margin: 0, padding: '2px 8px', fontSize: '11px' }}>Desborde</span>}
                                {payload.alertFrost && <span className="alert-tag blue" style={{ margin: 0, padding: '2px 8px', fontSize: '11px' }}>Congelamiento</span>}
                                {payload.alertTamper && <span className="alert-tag amber" style={{ margin: 0, padding: '2px 8px', fontSize: '11px' }}>Manipulación</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      const payload = (latest.decodedPayload as any) || {};
                      const isFull = (payload.fillLevel ?? 0) >= 80;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 0 }}>
                            <div className="metric-box amber" style={{ padding: '12px 14px', background: isFull ? 'var(--red-bg)' : 'var(--amber-bg)' }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4, color: isFull ? 'var(--red)' : 'var(--amber-dark)' }}><Trash2 size={11} /> Llenado</div>
                              <div className="metric-value" style={{ fontSize: '20px', color: isFull ? 'var(--red)' : 'var(--amber-dark)' }}>
                                {payload.fillLevel ?? '—'}<span className="metric-unit" style={{ fontSize: '12px' }}>%</span>
                              </div>
                            </div>
                            <div className="metric-box blue" style={{ padding: '12px 14px' }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><Thermometer size={11} /> Temperatura</div>
                              <div className="metric-value" style={{ fontSize: '20px' }}>
                                {payload.temperature !== undefined && !isNaN(Number(payload.temperature)) ? Number(payload.temperature).toFixed(1) : '—'}
                                <span className="metric-unit" style={{ fontSize: '12px' }}>°C</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div className="metric-box purple" style={{ padding: '12px 14px', flex: 1 }}>
                              <div className="metric-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}><Battery size={11} /> Batería</div>
                              <div className="metric-value" style={{ fontSize: '20px' }}>{payload.battery ?? '—'}<span className="metric-unit" style={{ fontSize: '12px' }}>%</span></div>
                            </div>
                            <div className="metric-box teal" style={{ padding: '12px 14px', flex: 1, background: isFull ? 'var(--red-bg)' : 'var(--teal-bg)' }}>
                              <div className="metric-label" style={{ fontSize: '11px', marginBottom: 4, color: isFull ? 'var(--red)' : 'var(--teal-dark)' }}>Estado</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: isFull ? 'var(--red)' : 'var(--teal)',
                                  display: 'inline-block'
                                }}></span>
                                <span style={{ fontSize: '13.5px', fontWeight: 650, color: isFull ? 'var(--red)' : 'var(--teal-dark)' }}>
                                  {isFull ? 'Crítico' : 'Operativo'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })()
                )}
              </div>

              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 650, color: 'var(--color-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Settings size={13} style={{ color: 'var(--teal)' }} />
                    <span>Parámetros Estáticos (Instalación & GPS)</span>
                  </h4>
                  {!isEditingStatic ? (
                    <button 
                      onClick={() => setIsEditingStatic(true)} 
                      className="btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Edit size={11} />
                      <span>Editar</span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button 
                        onClick={handleSaveStaticParams} 
                        className="btn-primary" 
                        style={{ padding: '4px 10px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--teal)' }}
                      >
                        <Check size={11} />
                        <span>Guardar</span>
                      </button>
                      <button 
                        onClick={() => setIsEditingStatic(false)} 
                        className="btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <X size={11} />
                        <span>Cancelar</span>
                      </button>
                    </div>
                  )}
                </div>

                {!isEditingStatic ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg)', padding: '14px', borderRadius: '10px', border: '0.5px solid var(--color-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'block' }}>Nombre / Alias Personalizado</span>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: selectedDevice.staticParams?.customAlias ? 'var(--color-text)' : 'var(--color-hint)' }}>
                          {selectedDevice.staticParams?.customAlias || 'Sin alias (usando original)'}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'block' }}>Fecha de Instalación</span>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: selectedDevice.staticParams?.installationDate ? 'var(--color-text)' : 'var(--color-hint)' }}>
                          {formatInstallationDate(selectedDevice.staticParams?.installationDate)}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '0.5px solid var(--color-border)', paddingTop: 8 }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'block' }}>Coordenada Latitud</span>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 550 }}>
                          {selectedDevice.lat !== undefined ? selectedDevice.lat.toFixed(6) : '—'}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'block' }}>Coordenada Longitud</span>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 550 }}>
                          {selectedDevice.lng !== undefined ? selectedDevice.lng.toFixed(6) : '—'}
                        </span>
                      </div>
                    </div>

                    <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 8 }}>
                      <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'block' }}>Ubicación / Dirección / Comentarios</span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: selectedDevice.staticParams?.locationDescription ? 'var(--color-text)' : 'var(--color-hint)' }}>
                        {selectedDevice.staticParams?.locationDescription || 'Sin detalles de ubicación estáticos'}
                      </span>
                    </div>
                    {selectedDevice.codecJs && (
                      <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 8 }}>
                        <span style={{ fontSize: '10px', color: 'var(--color-muted)', display: 'block' }}>Decodificador JS Personalizado</span>
                        <pre style={{ margin: '4px 0 0 0', background: '#151515', color: '#34d399', padding: '10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace', overflowX: 'auto', border: '1px solid var(--color-border)' }}>
                          {selectedDevice.codecJs}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--color-surface)', padding: '14px', borderRadius: '10px', border: '0.5px solid var(--color-border)' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Alias Personalizado</label>
                      <input 
                        className="form-input" 
                        value={editAlias} 
                        onChange={(e) => setEditAlias(e.target.value)} 
                        placeholder="Ej. Medidor Principal Planta 2" 
                        style={{ height: '32px', fontSize: '12px', padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Latitud (GPS)</label>
                        <input 
                          className="form-input" 
                          value={editLat} 
                          onChange={(e) => setEditLat(e.target.value)} 
                          placeholder="Ej. -0.1807" 
                          style={{ height: '32px', fontSize: '12px', padding: '4px 8px', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Longitud (GPS)</label>
                        <input 
                          className="form-input" 
                          value={editLng} 
                          onChange={(e) => setEditLng(e.target.value)} 
                          placeholder="Ej. -78.4678" 
                          style={{ height: '32px', fontSize: '12px', padding: '4px 8px', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Fecha de Instalación</label>
                        <input 
                          type="date"
                          className="form-input" 
                          value={editInstallationDate} 
                          onChange={(e) => setEditInstallationDate(e.target.value)} 
                          style={{ height: '32px', fontSize: '12px', padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Ubicación / Dirección / Comentarios</label>
                      <textarea 
                        className="form-input" 
                        value={editLocationDesc} 
                        onChange={(e) => setEditLocationDesc(e.target.value)} 
                        placeholder="Ej. Instalado en tubería matriz exterior, entrada lateral." 
                        style={{ minHeight: '60px', fontSize: '12px', padding: '6px 8px', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Decodificador JavaScript Personalizado (Opcional)</label>
                      <textarea 
                        className="form-input" 
                        value={editCodecJs} 
                        onChange={(e) => setEditCodecJs(e.target.value)} 
                        placeholder="function decode(bytes, port) { return { flow: bytes[0] }; }" 
                        style={{ minHeight: '100px', fontSize: '11px', fontFamily: 'monospace', padding: '8px', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {deviceTelemetryHistory.length > 0 && !loadingTelemetry && (
                <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 16 }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 650, color: 'var(--color-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={13} style={{ color: 'var(--teal)' }} />
                    <span>Tendencias en el Tiempo</span>
                  </h4>
                  <div className="card" style={{ padding: '14px', borderRadius: '12px', background: 'var(--color-surface)' }}>
                    <ResponsiveContainer width="100%" height={160}>
                      {selectedDevice.deviceType === 'water_meter' ? (
                        <LineChart
                          data={[...deviceTelemetryHistory].reverse().map(h => ({
                            time: safeFormatDate(h.receivedAt, 'HH:mm'),
                            caudal: (() => { const p = (h.decodedPayload as any) || {}; const v = p.flow; const n = Number(v); return isNaN(n) ? 0 : Number(n.toFixed(2)); })(),
                            nivel: (() => { const p = (h.decodedPayload as any) || {}; const v = p.level; const n = Number(v); return isNaN(n) ? 0 : Number(n.toFixed(0)); })()
                          }))}
                          margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="caudal" stroke="var(--teal)" strokeWidth={2} dot={false} name="Caudal (L/h)" />
                          <Line type="monotone" dataKey="nivel" stroke="var(--blue)" strokeWidth={2} dot={false} name="Nivel (cm)" />
                        </LineChart>
                      ) : (
                        <LineChart
                          data={[...deviceTelemetryHistory].reverse().map(h => ({
                            time: safeFormatDate(h.receivedAt, 'HH:mm'),
                            llenado: (() => { const p = (h.decodedPayload as any) || {}; const v = p.fillLevel; const n = Number(v); return isNaN(n) ? 0 : Number(n.toFixed(0)); })()
                          }))}
                          margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="llenado" stroke="var(--amber)" strokeWidth={2.5} dot={false} name="Llenado (%)" />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 250 }}>
                <h4 style={{ fontSize: '14px', fontWeight: 650, color: 'var(--color-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} />
                  <span>Historial de Paquetes Uplink (Últimos 20)</span>
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, maxHeight: 350, paddingRight: 4 }}>
                  {loadingTelemetry ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                      <RefreshCw size={18} className="animate-spin text-muted" />
                    </div>
                  ) : deviceTelemetryHistory.length === 0 ? (
                    <div style={{ color: 'var(--color-hint)', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                      No se encontraron tramas en la base de datos.
                    </div>
                  ) : (
                    deviceTelemetryHistory.map((log) => {
                      const isExpanded = !!expandedTelemetryLogs[log.id];
                      return (
                        <div key={log.id} style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11.5px', fontWeight: 600 }}>
                              <Radio size={11} style={{ color: 'var(--teal)' }} />
                              <span>{safeFormatDate(log.receivedAt, 'dd/MM/yyyy HH:mm:ss')}</span>
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--color-hint)', background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                              Port: {log.fPort} · FCnt: {log.fCnt}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: '11px', color: 'var(--color-muted)' }}>
                            <span>RSSI: <strong style={{ color: 'var(--color-text)' }}>{log.rssi} dBm</strong></span>
                            <span>SNR: <strong style={{ color: 'var(--color-text)' }}>{log.snr} dB</strong></span>
                            <span>SF: <strong style={{ color: 'var(--color-text)' }}>SF{log.spreadingFactor}</strong></span>
                          </div>
                          {log.gatewayId && (
                            <div style={{ fontSize: '10.5px', color: 'var(--color-hint)', display: 'flex', gap: 3 }}>
                              <span>GW:</span><span style={{ fontFamily: 'monospace' }}>{log.gatewayId}</span>
                            </div>
                          )}
                          <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 6, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                              onClick={() => setExpandedTelemetryLogs({ ...expandedTelemetryLogs, [log.id]: !isExpanded })}
                              className="btn-secondary"
                              style={{ padding: '2px 8px', fontSize: '10.5px', height: '22px', minHeight: '22px', borderRadius: '4px', background: isExpanded ? 'var(--teal-bg)' : 'transparent', color: isExpanded ? 'var(--teal-dark)' : 'var(--color-muted)', borderColor: isExpanded ? 'var(--teal)' : 'var(--color-border)' }}
                            >
                              {isExpanded ? 'Ocultar JSON' : 'Ver Decodificación JSON'}
                            </button>
                            <span style={{ fontSize: '10px', color: 'var(--color-hint)' }}>
                              Payload: {log.rawPayload?.substring(0, 10) || 'base64'}...
                            </span>
                          </div>
                          {isExpanded && (
                            <pre style={{ margin: '6px 0 0 0', background: '#1e1e1e', color: '#d4d4d4', padding: '10px', borderRadius: '6px', fontSize: '10.5px', fontFamily: 'monospace', overflowX: 'auto', border: '1px solid #333', lineHeight: '1.4' }}>
                              {JSON.stringify(log.decodedPayload, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="drawer-footer" style={{ padding: '14px 24px', background: 'var(--color-bg)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)' }}>
              <button className="btn-secondary" onClick={handleCloseDrawer} style={{ height: '36px', minHeight: '36px', padding: '0 16px', fontSize: '13px' }}>
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
