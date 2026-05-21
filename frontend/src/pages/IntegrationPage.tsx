import { useState, useEffect } from 'react';
import { 
  Cpu, Copy, Play, Check, Send, AlertCircle, RefreshCw, Terminal, Save, 
  Plus, Trash2, ArrowLeft, Settings, Code, FileText, X 
} from 'lucide-react';
import { 
  getIntegrations, createIntegration, updateIntegration, deleteIntegration, 
  postWebhookUplink, getTelemetry 
} from '../services/api';
import type { Integration } from '../types';
import { useAuth } from '../context/AuthContext';

interface LogEntry {
  time: string;
  devEUI: string;
  fPort: number;
  rawPayload: string;
  hex: string;
  decoded: any;
  rssi: number;
  snr: number;
}

const DECODER_PRESETS = {
  water_meter: `// Decodificador de Medidor de Agua (fPort = 1)
function decode(bytes, port) {
  if (port === 1) {
    const flow = ((bytes[0] << 8) | bytes[1]) / 100;
    const level = ((bytes[2] << 8) | bytes[3]) / 10;
    const alerts = bytes[4] || 0;
    const alertLeak = (alerts & 0x01) !== 0;
    const alertOverflow = (alerts & 0x02) !== 0;
    return {
      flow: Number(flow.toFixed(2)),
      level: Number(level.toFixed(1)),
      alertLeak,
      alertOverflow,
      battery: 98
    };
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`,
  smartbin: `// Decodificador de Contenedor de Basura (SmartBin, fPort = 2)
function decode(bytes, port) {
  if (port === 2) {
    const fillLevel = bytes[0];
    let temperature = bytes[1];
    if (temperature > 127) temperature -= 256;
    const battery = bytes[2];
    return {
      fillLevel,
      temperature,
      battery,
      alertCritical: fillLevel >= 80
    };
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`,
  tektelic_room: `// Decodificador de Sensor de Ambiente Tektelic (fPort = 10)
function decode(bytes, port) {
  if (port === 10) {
    const result = {};
    let i = 0;
    while (i < bytes.length) {
      const channel = bytes[i++];
      const type = bytes[i++];
      if (channel === 0x03 && type === 0x67) {
        let temp = (bytes[i++] << 8) | bytes[i++];
        if (temp > 0x7FFF) temp -= 0x10000;
        result.temperature = Number((temp / 10).toFixed(1));
      } else if (channel === 0x04 && type === 0x68) {
        result.humidity = Number((bytes[i++] / 2).toFixed(1));
      } else if (channel === 0x05 && type === 0x00) {
        result.presence = bytes[i++] === 0xFF;
      } else {
        break;
      }
    }
    return result;
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`,
  generic: `// Decodificador LoRaWAN Genérico
function decode(bytes, port) {
  // Retorna bytes en Hex
  return {
    hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(''),
    port: port
  };
}`
};

export default function IntegrationPage() {
  const { user, clients } = useAuth();

  // Integraciones
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  // Modal Crear Integración
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newIntName, setNewIntName] = useState('');
  const [newIntDesc, setNewIntDesc] = useState('');
  const [newIntPreset, setNewIntPreset] = useState('water_meter');
  const [creating, setCreating] = useState(false);
  const [newIntOrgId, setNewIntOrgId] = useState('org1');
  const [integrationMappings, setIntegrationMappings] = useState<Record<string, string>>({});

  // Cargar mappings al iniciar
  useEffect(() => {
    const stored = localStorage.getItem('integration_organization_mappings');
    if (stored) {
      setIntegrationMappings(JSON.parse(stored));
    }
  }, []);

  // Inicializar organización por defecto para nueva integración
  useEffect(() => {
    if (user?.organizationId) {
      setNewIntOrgId(user.organizationId);
    }
  }, [user]);

  // Detalle e Inspección
  const [activeTab, setActiveTab] = useState<'config' | 'decoder' | 'logs'>('config');
  const [code, setCode] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedHeader, setCopiedHeader] = useState(false);
  const [savingDecoder, setSavingDecoder] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Playground & Simulación
  const [payloadType, setPayloadType] = useState<'hex' | 'base64'>('hex');
  const [testPayload, setTestPayload] = useState('0758004000');
  const [testPort, setTestPort] = useState(1);
  const [decodeResult, setDecodeResult] = useState<any>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [simDevEUI, setSimDevEUI] = useState('0102030405060708');
  const [simPayload, setSimPayload] = useState('0758004000');
  const [simPort, setSimPort] = useState(1);
  const [sendingSim, setSendingSim] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Cargar lista de integraciones al iniciar
  const loadIntegrationsList = async () => {
    setLoadingList(true);
    try {
      const data = await getIntegrations();
      setIntegrations(data || []);
    } catch (err) {
      console.error('Error al cargar integraciones:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadIntegrationsList();
  }, []);

  // Cargar telemetría filtrada por integración elegida
  const loadTelemetryLogs = async () => {
    if (!selectedIntegration) return;
    try {
      const records = await getTelemetry(50, selectedIntegration.id);
      if (records) {
        const mappedLogs: LogEntry[] = records.map((r: any) => {
          let hex = '';
          if (r.rawPayload) {
            try {
              const binary = atob(r.rawPayload);
              const hexArr = [];
              for (let i = 0; i < binary.length; i++) {
                hexArr.push(binary.charCodeAt(i).toString(16).padStart(2, '0'));
              }
              hex = hexArr.join('').toUpperCase();
            } catch (e) {}
          }
          return {
            time: new Date(r.receivedAt).toLocaleTimeString(),
            devEUI: r.devEUI,
            fPort: r.fPort,
            rawPayload: r.rawPayload || '',
            hex: hex,
            decoded: r.decodedPayload,
            rssi: r.rssi || 0,
            snr: r.snr || 0
          };
        });
        setLogs(mappedLogs);
      }
    } catch (err) {
      console.error('Error al cargar telemetría para integración:', err);
    }
  };

  // Efecto para polling de logs en la pestaña de logs
  useEffect(() => {
    if (selectedIntegration) {
      loadTelemetryLogs();
      if (activeTab === 'logs') {
        const interval = setInterval(loadTelemetryLogs, 4000);
        return () => clearInterval(interval);
      }
    }
  }, [selectedIntegration, activeTab]);

  // Manejo de clicks en cards
  const handleSelectIntegration = (integration: Integration) => {
    setSelectedIntegration(integration);
    setCode(integration.decoderCode || '');
    setActiveTab('config');
    setDecodeResult(null);
    setDecodeError(null);
    
    // Configurar Playground según el preset aproximado
    const lowerCode = (integration.decoderCode || '').toLowerCase();
    if (lowerCode.includes('fport === 1') || lowerCode.includes('port === 1')) {
      setTestPayload('0758004000');
      setTestPort(1);
      setSimPayload('0758004000');
      setSimPort(1);
    } else if (lowerCode.includes('fport === 2') || lowerCode.includes('port === 2')) {
      setTestPayload('541546');
      setTestPort(2);
      setSimPayload('541546');
      setSimPort(2);
    } else if (lowerCode.includes('fport === 10') || lowerCode.includes('port === 10')) {
      setTestPayload('036700E204683C0500FF');
      setTestPort(10);
      setSimPayload('036700E204683C0500FF');
      setSimPort(10);
    } else {
      setTestPayload('00112233');
      setTestPort(1);
      setSimPayload('00112233');
      setSimPort(1);
    }
  };

  const handleCopy = (text: string, type: 'url' | 'header') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedHeader(true);
      setTimeout(() => setCopiedHeader(false), 2000);
    }
  };

  // Crear integración
  const handleCreate = async () => {
    if (!newIntName.trim()) return;
    setCreating(true);
    try {
      const created = await createIntegration({
        name: newIntName,
        description: newIntDesc,
        preset: newIntPreset
      });

      // Guardar mapping en localStorage
      const stored = localStorage.getItem('integration_organization_mappings');
      const currentMappings = stored ? JSON.parse(stored) : {};
      currentMappings[created.id] = newIntOrgId;
      localStorage.setItem('integration_organization_mappings', JSON.stringify(currentMappings));
      setIntegrationMappings(currentMappings);

      setShowCreateModal(false);
      setNewIntName('');
      setNewIntDesc('');
      await loadIntegrationsList();
      handleSelectIntegration(created);
    } catch (err: any) {
      alert('Error creando integración: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  // Eliminar integración
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Estás seguro de que deseas eliminar esta integración? Se desvincularán los dispositivos correspondientes.')) return;
    try {
      await deleteIntegration(id);
      if (selectedIntegration?.id === id) {
        setSelectedIntegration(null);
      }
      await loadIntegrationsList();
    } catch (err: any) {
      alert('Error eliminando integración: ' + err.message);
    }
  };

  // Guardar decodificador modificado
  const handleSaveDecoder = async () => {
    if (!selectedIntegration) return;
    setSavingDecoder(true);
    try {
      const updated = await updateIntegration(selectedIntegration.id, { decoderCode: code });
      setSelectedIntegration(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      alert('Error guardando el decodificador: ' + err.message);
    } finally {
      setSavingDecoder(false);
    }
  };

  // Cargar preset temporalmente en el editor
  const handleLoadPreset = (presetKey: keyof typeof DECODER_PRESETS) => {
    setCode(DECODER_PRESETS[presetKey]);
  };

  // Ejecutar decodificador en playground local
  const handleTestDecode = () => {
    setDecodeError(null);
    setDecodeResult(null);
    try {
      const bytes: number[] = [];
      if (payloadType === 'hex') {
        const cleaned = testPayload.replace(/\s+/g, '');
        if (!/^[0-9A-Fa-f]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
          throw new Error('Formato Hexadecimal inválido (debe tener longitud par)');
        }
        for (let i = 0; i < cleaned.length; i += 2) {
          bytes.push(parseInt(cleaned.substring(i, 2), 16));
        }
      } else {
        const binary = atob(testPayload);
        for (let i = 0; i < binary.length; i++) {
          bytes.push(binary.charCodeAt(i));
        }
      }

      // Evaluar localmente la función
      const fullFnText = `${code}\nreturn decode(bytes, port);`;
      const runDecoder = new Function('bytes', 'port', fullFnText);
      const output = runDecoder(bytes, testPort);
      setDecodeResult(output);
    } catch (err: any) {
      setDecodeError(err.message || 'Error en decodificador');
    }
  };

  // Simular envío de trama al webhook dinámico
  const handleSimulateUplink = async () => {
    if (!selectedIntegration) return;
    setSendingSim(true);
    try {
      let b64 = simPayload;
      if (payloadType === 'hex') {
        const cleaned = simPayload.replace(/\s+/g, '');
        const bytes = [];
        for (let i = 0; i < cleaned.length; i += 2) {
          bytes.push(parseInt(cleaned.substring(i, 2), 16));
        }
        b64 = btoa(String.fromCharCode.apply(null, bytes));
      }

      const mockPayload = {
        devEUI: simDevEUI,
        fPort: simPort,
        fCnt: Math.floor(Math.random() * 500) + 1,
        data: b64,
        rxInfo: [{
          gatewayId: 'GWAY-DYN-9988A2',
          rssi: -72 - Math.floor(Math.random() * 25),
          loRaSNR: Number((6 + Math.random() * 8).toFixed(1))
        }],
        txInfo: {
          dataRate: {
            spreadFactor: 7
          }
        }
      };

      await postWebhookUplink(selectedIntegration.id, mockPayload, selectedIntegration.secret);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await loadTelemetryLogs();
      setActiveTab('logs');
    } catch (err: any) {
      alert('Error en simulación: ' + (err.response?.data?.message || err.message));
    } finally {
      setSendingSim(false);
    }
  };

  const getPresetBadge = (presetCode: string) => {
    const codeLower = (presetCode || '').toLowerCase();
    if (codeLower.includes('medidor de agua') || codeLower.includes('port === 1')) {
      return { text: 'Medidor de Agua', class: 'water' };
    }
    if (codeLower.includes('contenedor de basura') || codeLower.includes('smartbin') || codeLower.includes('port === 2')) {
      return { text: 'SmartBin', class: 'bin' };
    }
    if (codeLower.includes('sensor de ambiente') || codeLower.includes('port === 10')) {
      return { text: 'Tektelic Room', class: 'water' }; // Usar badge water (azul)
    }
    return { text: 'Genérico', class: 'generic' };
  };

  const filteredList = integrations.filter((int) => {
    if (user?.role === 'superadmin') return true;
    const org = integrationMappings[int.id] || 'org1';
    return org === user?.organizationId;
  });

  return (
    <div className="page">
      {!selectedIntegration ? (
        // ================= VISTA CATALOGO =================
        <>
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="page-title">Gestión de Integraciones Webhook</h2>
              <p className="page-subtitle">Crea y administra diferentes canales LNS con decodificadores de bytes independientes.</p>
            </div>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} />
              <span>Nueva Integración</span>
            </button>
          </div>

          {loadingList ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <RefreshCw size={24} className="animate-spin text-muted" />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', borderStyle: 'dashed', borderColor: '#ccc' }}>
              <Cpu size={48} className="text-muted" style={{ margin: '0 auto 16px auto', display: 'block' }} />
              <h3>No tienes integraciones creadas</h3>
              <p className="text-muted" style={{ fontSize: 13, margin: '8px 0 20px 0' }}>
                Crea una nueva integración para recibir datos de tus dispositivos LoRaWAN Tektelic.
              </p>
              <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ margin: '0 auto' }}>
                Crear mi primera integración
              </button>
            </div>
          ) : (
            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
              {filteredList.map((int) => {
                const presetBadge = getPresetBadge(int.decoderCode);
                return (
                  <div 
                    key={int.id} 
                    className="card hoverable-card" 
                    onClick={() => handleSelectIntegration(int)}
                    style={{ 
                      cursor: 'pointer', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="device-type-icon" style={{ background: '#E6F1FB', width: 36, height: 36 }}>
                            <Cpu size={16} style={{ color: '#185FA5' }} />
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{int.name}</h4>
                            <span className="text-muted" style={{ fontSize: 10 }}>ID: {int.id.substring(0, 8)}...</span>
                          </div>
                        </div>
                        <span className={`type-badge ${presetBadge.class}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                          {presetBadge.text}
                        </span>
                      </div>

                      <p className="text-muted" style={{ fontSize: 12, lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36 }}>
                        {int.description || 'Sin descripción adicional establecida para este canal.'}
                      </p>
                      {user?.role === 'superadmin' && (
                        <div style={{ marginTop: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Cliente:</span> 
                          <span style={{ color: '#854F0B', fontWeight: 550 }}>
                            {clients.find(c => c.id === (integrationMappings[int.id] || 'org1'))?.name || 'Empresa Demo S.A.'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-bg-secondary)' }}>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        Creado: {new Date(int.createdAt).toLocaleDateString()}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          className="btn-secondary" 
                          onClick={(e) => handleDelete(int.id, e)} 
                          style={{ padding: 6, color: '#A32D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Eliminar Integración"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ================= DRAWER CREAR INTEGRACIÓN ================= */}
          {showCreateModal && (
            <div className="slide-over-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-header">
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Cpu size={20} className="text-teal-500" /> Crear Nueva Integración LNS
                    </h3>
                    <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                      Registra un nuevo canal de ingesta de datos LoRaWAN.
                    </p>
                  </div>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setShowCreateModal(false)} 
                    style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
                  <div className="drawer-body">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Nombre de Integración *</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ej. Medidores Sector Norte Quito" 
                        value={newIntName} 
                        onChange={(e) => setNewIntName(e.target.value)} 
                        required
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Descripción</label>
                      <textarea 
                        className="form-input" 
                        placeholder="Propósito, ubicación o notas de esta ingesta." 
                        value={newIntDesc} 
                        onChange={(e) => setNewIntDesc(e.target.value)}
                        style={{ minHeight: 80, resize: 'vertical', padding: '10px 12px' }}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Plantilla Inicial de Decodificador (Preset)</label>
                      <select 
                        className="form-input" 
                        value={newIntPreset} 
                        onChange={(e) => setNewIntPreset(e.target.value)}
                      >
                        <option value="water_meter">Medidor de Agua (Quito / Tektelic, fPort = 1)</option>
                        <option value="smartbin">Contenedor Inteligente (SmartBin, fPort = 2)</option>
                        <option value="tektelic_room">Sensor de Ambiente Tektelic Smart Room (fPort = 10)</option>
                        <option value="generic">Decodificador LoRaWAN Genérico (Hex bytes)</option>
                      </select>
                    </div>

                    {user?.role === 'superadmin' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Asociar a Cliente (Tenant)</label>
                        <select 
                          className="form-input" 
                          value={newIntOrgId} 
                          onChange={(e) => setNewIntOrgId(e.target.value)}
                        >
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="drawer-footer">
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => setShowCreateModal(false)}
                      disabled={creating}
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={creating || !newIntName.trim()}
                    >
                      {creating ? 'Creando...' : 'Crear Integración'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      ) : (
        // ================= VISTA DETALLE =================
        <>
          <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-secondary" onClick={() => setSelectedIntegration(null)} style={{ padding: 6, display: 'flex', alignItems: 'center' }}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="page-title">{selectedIntegration.name}</h2>
                <span className="type-badge water" style={{ fontSize: 11, padding: '2px 8px' }}>Integración Activa</span>
              </div>
              <p className="page-subtitle">
                {selectedIntegration.description || 'Personaliza el canal, ajusta el decodificador de bytes y visualiza datos en tiempo real.'}
              </p>
            </div>
          </div>

          <div className="filter-tabs" style={{ marginBottom: 20 }}>
            <button 
              className={`filter-tab ${activeTab === 'config' ? 'active' : ''}`} 
              onClick={() => setActiveTab('config')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Settings size={14} /> Webhook & Simulación
            </button>
            <button 
              className={`filter-tab ${activeTab === 'decoder' ? 'active' : ''}`} 
              onClick={() => setActiveTab('decoder')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Code size={14} /> Editor de Decodificador
            </button>
            <button 
              className={`filter-tab ${activeTab === 'logs' ? 'active' : ''}`} 
              onClick={() => setActiveTab('logs')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <FileText size={14} /> Consola en Vivo
            </button>
          </div>

          {/* TAB 1: CONFIG & SIMULATION */}
          {activeTab === 'config' && (
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
              {/* Webhook Config Card */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Endpoint HTTP Exclusivo</h3>
                </div>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
                  Copia esta URL en tu LNS de Tektelic KORE. Las tramas enviadas a este endpoint usarán el decodificador de esta integración y se aislarán de las demás.
                </p>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">URL del Webhook (Uplink)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      readOnly
                      value={`http://localhost:3000/webhook/uplink/${selectedIntegration.id}`}
                      style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--color-bg-secondary)' }}
                    />
                    <button className="btn-secondary" onClick={() => handleCopy(`http://localhost:3000/webhook/uplink/${selectedIntegration.id}`, 'url')} style={{ padding: '0 12px' }}>
                      {copiedUrl ? <Check size={16} className="text-teal-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Token de Seguridad (Header Authorization)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      readOnly
                      value={`Bearer ${selectedIntegration.secret}`}
                      style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--color-bg-secondary)' }}
                    />
                    <button className="btn-secondary" onClick={() => handleCopy(`Bearer ${selectedIntegration.secret}`, 'header')} style={{ padding: '0 12px' }}>
                      {copiedHeader ? <Check size={16} className="text-teal-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {user?.role === 'superadmin' && (
                  <div className="form-group" style={{ marginTop: 14 }}>
                    <label className="form-label">Asociar a Cliente (Multi-tenant)</label>
                    <select
                      className="form-input"
                      value={integrationMappings[selectedIntegration.id] || 'org1'}
                      onChange={(e) => {
                        const updated = { ...integrationMappings, [selectedIntegration.id]: e.target.value };
                        setIntegrationMappings(updated);
                        localStorage.setItem('integration_organization_mappings', JSON.stringify(updated));
                      }}
                      style={{ padding: '6px 12px', fontSize: 13, height: '36px' }}
                    >
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="active-alerts" style={{ background: '#E6F1FB', borderColor: '#B1D5F6', color: '#185FA5', marginTop: 24 }}>
                  <div className="active-alerts-title" style={{ color: '#185FA5', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Cpu size={16} /> Canalización Independiente
                  </div>
                  <p style={{ fontSize: 12, margin: 0, marginTop: 4, lineHeight: 1.4 }}>
                    Al disparar tramas a este webhook, los dispositivos creados automáticamente (según su devEUI) se asociarán a la integración <strong>{selectedIntegration.name}</strong>, permitiendo clasificar y filtrar los tableros de control y reportes de manera aislada.
                  </p>
                </div>
              </div>

              {/* LNS webhook simulator */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Simulador LNS para esta Integración</h3>
                </div>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Despacha una trama HTTP POST de prueba emulando a Tektelic KORE usando las credenciales exactas de este webhook.
                </p>

                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">devEUI del Dispositivo</label>
                  <input type="text" className="form-input" value={simDevEUI} onChange={(e) => setSimDevEUI(e.target.value)} />
                </div>

                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Puerto (fPort)</label>
                  <input type="number" className="form-input" value={simPort} onChange={(e) => setSimPort(Number(e.target.value))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Payload ({payloadType === 'hex' ? 'Hexadecimal' : 'Base64'})</label>
                  <input type="text" className="form-input" value={simPayload} onChange={(e) => setSimPayload(e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    className={`btn-secondary ${payloadType === 'hex' ? 'active' : ''}`}
                    onClick={() => { setPayloadType('hex'); setSimPayload(simPort === 1 ? '0758004000' : simPort === 2 ? '541546' : '036700E204683C0500FF'); }}
                    style={{ flex: 1, padding: '4px 0', fontSize: 11 }}
                  >
                    Hexadecimal
                  </button>
                  <button
                    className={`btn-secondary ${payloadType === 'base64' ? 'active' : ''}`}
                    onClick={() => { setPayloadType('base64'); setSimPayload(simPort === 1 ? 'B1gAQA==' : simPort === 2 ? 'VBUG' : 'A2cAAgRoPAUA/w=='); }}
                    style={{ flex: 1, padding: '4px 0', fontSize: 11 }}
                  >
                    Base64
                  </button>
                </div>

                <button 
                  className="btn-primary" 
                  onClick={handleSimulateUplink} 
                  disabled={sendingSim} 
                  style={{ marginTop: 20, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {sendingSim ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Enviando uplink...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Enviar Trama a Webhook</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CODE DECODER EDITOR */}
          {activeTab === 'decoder' && (
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1.1fr 0.9fr' }}>
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <h3 className="card-title">Editor JS de Bytes</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      className="form-input"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: 12, height: 'auto' }}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleLoadPreset(e.target.value as any);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="" disabled>Cargar plantilla...</option>
                      <option value="water_meter">Preset: Medidor de Agua (fPort=1)</option>
                      <option value="smartbin">Preset: SmartBin (fPort=2)</option>
                      <option value="tektelic_room">Preset: Tektelic Smart Room (fPort=10)</option>
                      <option value="generic">Preset: Hexadecimal Genérico</option>
                    </select>

                    <button
                      className="btn-primary"
                      onClick={handleSaveDecoder}
                      disabled={savingDecoder}
                      style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {savingDecoder ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : saveSuccess ? (
                        <Check size={13} />
                      ) : (
                        <Save size={13} />
                      )}
                      <span>{saveSuccess ? 'Guardado con éxito' : 'Guardar Cambios'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ position: 'relative', marginTop: 12 }}>
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{
                      width: '100%',
                      height: 380,
                      fontFamily: 'Consolas, Monaco, monospace',
                      fontSize: 12,
                      background: '#121212',
                      color: '#A9FFCD',
                      padding: 16,
                      borderRadius: 8,
                      border: '1px solid #333',
                      lineHeight: '1.5',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <p className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
                  💡 Este script se evaluará en el sandbox del backend inmediatamente al recibir tramas LoRaWAN en este webhook.
                </p>
              </div>

              {/* Sandbox Playground */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Playground de Pruebas</h3>
                </div>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Inserta bytes en crudo para simular cómo reacciona el decodificador arriba editado en tiempo real.
                </p>

                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Tipo de datos</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" checked={payloadType === 'hex'} onChange={() => { setPayloadType('hex'); setTestPayload(testPort === 1 ? '0758004000' : testPort === 2 ? '541546' : '036700E204683C0500FF'); }} />
                      Hexadecimal
                    </label>
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" checked={payloadType === 'base64'} onChange={() => { setPayloadType('base64'); setTestPayload(testPort === 1 ? 'B1gAQA==' : testPort === 2 ? 'VBUG' : 'A2cAAgRoPAUA/w=='); }} />
                      Base64
                    </label>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Payload crudo</label>
                  <input type="text" className="form-input" value={testPayload} onChange={(e) => setTestPayload(e.target.value)} style={{ fontFamily: 'monospace' }} />
                </div>

                <div className="form-group">
                  <label className="form-label">Puerto (fPort)</label>
                  <input type="number" className="form-input" value={testPort} onChange={(e) => setTestPort(Number(e.target.value))} />
                </div>

                <button className="btn-primary" onClick={handleTestDecode} style={{ marginTop: 20, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Play size={14} />
                  <span>Testear Decodificador</span>
                </button>

                {(decodeResult || decodeError) && (
                  <div style={{ marginTop: 20 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Terminal size={14} /> Consola de Resultado
                    </label>
                    {decodeError ? (
                      <div style={{ padding: 12, borderRadius: 6, background: '#FCEBEB', border: '1px solid #F3AEAE', color: '#A32D2D', fontSize: 12, fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold', marginBottom: 4 }}>
                          <AlertCircle size={14} /> Error de Compilación/Ejecución
                        </div>
                        {decodeError}
                      </div>
                    ) : (
                      <pre style={{ margin: 0, padding: 12, borderRadius: 6, background: '#1A1A1A', border: '1px solid #333', color: '#85D4FF', fontSize: 12, overflow: 'auto', fontFamily: 'monospace', maxHeight: 150 }}>
                        {JSON.stringify(decodeResult, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LIVE POLLING LOGS */}
          {activeTab === 'logs' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title">Logs de Entrada en Vivo para esta Integración</h3>
                <button className="btn-secondary" onClick={loadTelemetryLogs} style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={13} /> Recargar Ahora
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Listado filtrado en tiempo real que contiene únicamente las tramas LoRaWAN transmitidas hacia este webhook específico.
              </p>

              <div style={{ overflowX: 'auto' }}>
                {logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#888' }}>
                    <FileText size={32} style={{ margin: '0 auto 10px auto', display: 'block', opacity: 0.6 }} />
                    <p style={{ fontSize: 13 }}>No se han recibido tramas en este canal aún.</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>devEUI</th>
                        <th>Puerto</th>
                        <th>Base64</th>
                        <th>Hex</th>
                        <th>Señal</th>
                        <th>Datos Parseados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, idx) => (
                        <tr key={idx}>
                          <td><code style={{ fontSize: 11 }}>{log.time}</code></td>
                          <td><code className="eui-code">{log.devEUI}</code></td>
                          <td><span className="type-badge water" style={{ padding: '2px 8px' }}>{log.fPort}</span></td>
                          <td><code style={{ fontSize: 11, color: '#888' }}>{log.rawPayload}</code></td>
                          <td><code style={{ fontSize: 11 }}>{log.hex}</code></td>
                          <td style={{ fontSize: 12 }}>
                            <span style={{ color: log.rssi >= -80 ? '#1D9E75' : '#EF9F27' }}>
                              {log.rssi} dBm
                            </span>
                            <span style={{ color: '#888', marginLeft: 6 }}>
                              ({log.snr} dB)
                            </span>
                          </td>
                          <td>
                            <pre style={{ margin: 0, padding: '4px 8px', background: 'var(--color-bg-secondary)', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', color: '#185FA5' }}>
                              {JSON.stringify(log.decoded)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
