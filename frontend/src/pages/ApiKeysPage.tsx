import { useState, useEffect } from 'react';
import {
  Key, Copy, Check, Eye, EyeOff, Plus, Trash2, Terminal, Play,
  BookOpen, RefreshCw, AlertTriangle, Info
} from 'lucide-react';
import { getIntegrations, createIntegration, deleteIntegration } from '../services/api';
import type { Integration } from '../types';
import { useAuth } from '../context/AuthContext';

export default function ApiKeysPage() {
  const { user, clients } = useAuth();
  
  // Claves API (Integraciones)
  const [apiKeys, setApiKeys] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<Integration | null>(null);
  
  // Visibilidad de secretos
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  // Pestañas principales
  const [activeTab, setActiveTab] = useState<'keys' | 'docs' | 'playground'>('keys');

  // Modal Crear Clave
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDesc, setNewKeyDesc] = useState('');
  const [newKeyOrgId, setNewKeyOrgId] = useState('org1');
  const [creating, setCreating] = useState(false);

  // Copiado
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Playground & Consola
  const [playgroundEndpoint, setPlaygroundEndpoint] = useState('/devices');
  const [playgroundMethod, setPlaygroundMethod] = useState<'GET' | 'POST'>('GET');
  const [playgroundDevEUI, setPlaygroundDevEUI] = useState('AA00000000000001');
  const [playgroundValveOpen, setPlaygroundValveOpen] = useState(true);
  const [executingPlayground, setExecutingPlayground] = useState(false);
  const [playgroundResponse, setPlaygroundResponse] = useState<any>(null);
  const [playgroundReqHeaders, setPlaygroundReqHeaders] = useState<any>(null);

  // Documentación
  const [docLanguage, setDocLanguage] = useState<'curl' | 'node' | 'python'>('curl');

  // Cargar lista de claves
  const loadApiKeys = async () => {
    setLoading(true);
    try {
      const data = await getIntegrations();
      // Filtrar por organización del cliente si no es superadmin
      const filtered = data.filter((int: Integration) => {
        if (user?.role === 'superadmin') return true;
        const orgs = (int.organizationId || 'org1').split(',').map(s => s.trim());
        return orgs.includes(user?.organizationId || '');
      });
      setApiKeys(filtered);
      if (filtered.length > 0) {
        setSelectedKey(filtered[0]);
      }
    } catch (err) {
      console.error('Error cargando claves API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApiKeys();
  }, [user]);

  // Inicializar organización por defecto para nueva clave
  useEffect(() => {
    if (user?.organizationId) {
      setNewKeyOrgId(user.organizationId);
    }
  }, [user]);

  const toggleSecretVisibility = (id: string) => {
    setVisibleSecrets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopySecret = (secret: string, id: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyCodeSnippet = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  // Crear nueva clave API (Integración genérica para la API)
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const targetOrgId = user?.role === 'superadmin' ? newKeyOrgId : (user?.organizationId || 'org1');
      const created = await createIntegration({
        name: newKeyName,
        description: newKeyDesc || 'Clave API generada para consumos externos.',
        preset: 'generic', // Sin decodificación particular para hooks, actúa como canal genérico de API
        organizationId: targetOrgId
      });

      setShowCreateModal(false);
      setNewKeyName('');
      setNewKeyDesc('');
      await loadApiKeys();
      setSelectedKey(created);
    } catch (err: any) {
      alert('Error creando clave API: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  // Eliminar clave API
  const handleDeleteKey = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Estás seguro de que deseas revocar esta clave API? Cualquier sistema de terceros que la use perderá el acceso inmediatamente.')) return;
    try {
      await deleteIntegration(id);
      if (selectedKey?.id === id) {
        setSelectedKey(null);
      }
      await loadApiKeys();
    } catch (err: any) {
      alert('Error revocando clave: ' + err.message);
    }
  };

  // Ejecutar petición en Playground
  const handleExecutePlayground = async () => {
    if (!selectedKey) {
      alert('Por favor, selecciona una Clave API primero.');
      return;
    }

    setExecutingPlayground(true);
    setPlaygroundResponse(null);

    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    let urlPath = playgroundEndpoint;
    let body: any = null;

    if (playgroundEndpoint === '/devices/:devEUI') {
      urlPath = `/devices/${playgroundDevEUI}`;
    } else if (playgroundEndpoint === '/telemetry/:devEUI') {
      urlPath = `/telemetry/${playgroundDevEUI}?limit=10`;
    } else if (playgroundEndpoint === '/devices/:devEUI/valve') {
      urlPath = `/devices/${playgroundDevEUI}/valve`;
      body = { open: playgroundValveOpen };
    }

    const headers = {
      'X-API-Key': selectedKey.secret,
      'Content-Type': 'application/json'
    };

    setPlaygroundReqHeaders({
      url: `${baseUrl}/external-api${urlPath}`,
      method: playgroundMethod,
      headers
    });

    try {
      const response = await fetch(`${baseUrl}/external-api${urlPath}`, {
        method: playgroundMethod,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.json();
      setPlaygroundResponse({
        status: response.status,
        statusText: response.statusText,
        body: data
      });
    } catch (err: any) {
      setPlaygroundResponse({
        status: 500,
        statusText: 'Internal Connection Error',
        body: { error: err.message || 'No se pudo conectar con el servidor.' }
      });
    } finally {
      setExecutingPlayground(false);
    }
  };

  // Actualizar el método en base al endpoint elegido en el Playground
  const handleEndpointChange = (endpoint: string) => {
    setPlaygroundEndpoint(endpoint);
    if (endpoint === '/devices/:devEUI/valve') {
      setPlaygroundMethod('POST');
    } else {
      setPlaygroundMethod('GET');
    }
  };

  // Generar bloques de código para documentación
  const getCodeSnippet = () => {
    const activeKeyToken = selectedKey ? selectedKey.secret : 'TU_CLAVE_API_AQUÍ';
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    if (docLanguage === 'curl') {
      if (playgroundEndpoint === '/devices') {
        return `curl -X GET "${baseUrl}/external-api/devices" \\
  -H "X-API-Key: ${activeKeyToken}" \\
  -H "Content-Type: application/json"`;
      }
      if (playgroundEndpoint === '/telemetry' || playgroundEndpoint === '/telemetry/:devEUI') {
        const eui = playgroundEndpoint.includes(':') ? playgroundDevEUI : 'AA00000000000001';
        return `curl -X GET "${baseUrl}/external-api/telemetry/${eui}?limit=15" \\
  -H "X-API-Key: ${activeKeyToken}"`;
      }
      if (playgroundEndpoint === '/devices/:devEUI/valve') {
        return `curl -X POST "${baseUrl}/external-api/devices/${playgroundDevEUI}/valve" \\
  -H "X-API-Key: ${activeKeyToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"open": ${playgroundValveOpen}}'`;
      }
      return `curl -X GET "${baseUrl}/external-api/alerts?limit=10" \\
  -H "X-API-Key: ${activeKeyToken}"`;
    }

    if (docLanguage === 'node') {
      if (playgroundEndpoint === '/devices/:devEUI/valve') {
        return `// Control de Actuador Remoto en Node.js (fetch)
const fetch = require('node-fetch'); // Omitir en entornos modernos (Node 18+)

const url = '${baseUrl}/external-api/devices/${playgroundDevEUI}/valve';
const options = {
  method: 'POST',
  headers: {
    'X-API-Key': '${activeKeyToken}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ open: ${playgroundValveOpen} })
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log('Válvula Controlada:', json))
  .catch(err => console.error('Error:', err));`;
      }
      const finalEndpoint = playgroundEndpoint === '/devices' ? '/devices' : `/telemetry/${playgroundDevEUI}?limit=10`;
      return `// Consultar Datos de Sensores en Node.js
const url = '${baseUrl}/external-api${finalEndpoint}';

fetch(url, {
  method: 'GET',
  headers: {
    'X-API-Key': '${activeKeyToken}'
  }
})
  .then(res => res.json())
  .then(data => console.log('Respuesta API:', data))
  .catch(err => console.error('Error:', err));`;
    }

    if (docLanguage === 'python') {
      if (playgroundEndpoint === '/devices/:devEUI/valve') {
        return `# Control de Actuadores en Python
import requests

url = "${baseUrl}/external-api/devices/${playgroundDevEUI}/valve"
headers = {
    "X-API-Key": "${activeKeyToken}",
    "Content-Type": "application/json"
}
payload = {
    "open": ${playgroundValveOpen ? 'True' : 'False'}
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print("Respuesta:", data)`;
      }
      const finalEndpoint = playgroundEndpoint === '/devices' ? '/devices' : `/telemetry/${playgroundDevEUI}?limit=10`;
      return `# Obtener Datos de Telemetría en Python
import requests

url = "${baseUrl}/external-api${finalEndpoint}"
headers = {
    "X-API-Key": "${activeKeyToken}"
}

response = requests.get(url, headers=headers)
data = response.json()
print("Consumo e Instrumentación:", data)`;
    }

    return '';
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key size={26} className="text-teal-500" />
            <span>Portal de Desarrolladores & Claves API</span>
          </h2>
          <p className="page-subtitle">Crea tokens seguros de API y consume telemetrías o controla actuadores desde tus sistemas de terceros.</p>
        </div>
        
        <button 
          className="btn-primary" 
          onClick={() => setShowCreateModal(true)} 
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} />
          <span>Generar Clave API</span>
        </button>
      </div>

      <div className="filter-tabs" style={{ marginBottom: 20 }}>
        <button 
          className={`filter-tab ${activeTab === 'keys' ? 'active' : ''}`} 
          onClick={() => setActiveTab('keys')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Key size={14} /> Claves API Activas
        </button>
        <button 
          className={`filter-tab ${activeTab === 'docs' ? 'active' : ''}`} 
          onClick={() => setActiveTab('docs')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <BookOpen size={14} /> Documentación Interactiva
        </button>
        <button 
          className={`filter-tab ${activeTab === 'playground' ? 'active' : ''}`} 
          onClick={() => setActiveTab('playground')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Terminal size={14} /> Consola de Pruebas
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <RefreshCw size={24} className="animate-spin text-muted" />
        </div>
      ) : (
        <>
          {/* TAB 1: KEYS LIST */}
          {activeTab === 'keys' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {apiKeys.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', borderStyle: 'dashed', borderColor: '#ccc' }}>
                  <Key size={48} className="text-muted" style={{ margin: '0 auto 16px auto', display: 'block' }} />
                  <h3>No tienes Claves API creadas</h3>
                  <p className="text-muted" style={{ fontSize: 13, margin: '8px 0 20px 0' }}>
                    Genera una clave para que tus clientes o tus ingenieros de software puedan consumir las telemetrías vía REST.
                  </p>
                  <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ margin: '0 auto' }}>
                    Crear mi primera Clave API
                  </button>
                </div>
              ) : (
                <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                  {apiKeys.map((key) => {
                    const isVisible = visibleSecrets[key.id] || false;
                    const isSelected = selectedKey?.id === key.id;

                    return (
                      <div 
                        key={key.id}
                        className={`card hoverable-card ${isSelected ? 'selected-border' : ''}`}
                        onClick={() => setSelectedKey(key)}
                        style={{ 
                          cursor: 'pointer',
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between',
                          border: isSelected ? '2px solid var(--color-teal)' : '1px solid var(--color-bg-secondary)',
                          position: 'relative'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="device-type-icon" style={{ background: '#E0F2F1', width: 36, height: 36 }}>
                                <Key size={16} style={{ color: 'var(--color-teal)' }} />
                              </div>
                              <div>
                                <h4 style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{key.name}</h4>
                                <span className="text-muted" style={{ fontSize: 10 }}>Filtro: {key.id.substring(0, 8)}...</span>
                              </div>
                            </div>
                            <span className="type-badge water" style={{ fontSize: 10, padding: '2px 8px', background: '#D2EBD9', color: '#1B5E20' }}>
                              Activo
                            </span>
                          </div>

                          <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 16px 0', minHeight: 36 }}>
                            {key.description}
                          </p>

                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 10, fontWeight: 700 }}>Token de Acceso (Clave API)</label>
                            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                              <input 
                                type={isVisible ? 'text' : 'password'}
                                className="form-input"
                                readOnly
                                value={key.secret}
                                style={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: 11, 
                                  background: 'var(--color-bg-secondary)',
                                  paddingRight: '64px'
                                }}
                              />
                              <div style={{ position: 'absolute', right: 4, top: 4, display: 'flex', gap: 4 }}>
                                <button 
                                  className="btn-secondary" 
                                  onClick={(e) => { e.stopPropagation(); toggleSecretVisibility(key.id); }}
                                  style={{ padding: 4, border: 'none', background: 'transparent' }}
                                  title={isVisible ? 'Ocultar clave' : 'Mostrar clave'}
                                >
                                  {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <button 
                                  className="btn-secondary" 
                                  onClick={(e) => { e.stopPropagation(); handleCopySecret(key.secret, key.id); }}
                                  style={{ padding: 4, border: 'none', background: 'transparent' }}
                                  title="Copiar al portapapeles"
                                >
                                  {copiedIndex === key.id ? <Check size={14} className="text-teal-500" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {user?.role === 'superadmin' && (
                            <div style={{ marginTop: 12, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Asociado a Cliente:</span>
                              <span style={{ color: '#854F0B', fontWeight: 600 }}>
                                {clients.find(c => c.id === (key.organizationId || 'org1'))?.name || 'Empresa Demo S.A.'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-bg-secondary)' }}>
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            Creada: {new Date(key.createdAt).toLocaleDateString()}
                          </span>
                          
                          <button 
                            className="btn-secondary"
                            onClick={(e) => handleDeleteKey(key.id, e)}
                            style={{ padding: 6, color: '#A32D2D', display: 'flex', alignItems: 'center', gap: 4, border: 'none' }}
                            title="Revocar Clave API"
                          >
                            <Trash2 size={13} />
                            <span style={{ fontSize: 11 }}>Revocar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Developer Callout Info */}
              <div className="active-alerts" style={{ background: '#E0F2F1', borderColor: '#B2DFDB', color: 'var(--color-teal)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Info size={20} style={{ color: 'var(--color-teal)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <h5 style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#004D40' }}>Información de Consumo REST</h5>
                    <p style={{ margin: 0, marginTop: 4, fontSize: 12, lineHeight: 1.4, color: '#00695C' }}>
                      Las claves API de arriba son tokens portadores seguros. Proporcionan acceso de lectura y escritura a los recursos de tu organización. 
                      Para usarlas, simplemente envía la cabecera HTTP <code>X-API-Key: sec_tu_clave</code> o la cabecera estándar <code>Authorization: Bearer sec_tu_clave</code> en todas tus peticiones REST.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE DOCUMENTATION */}
          {activeTab === 'docs' && (
            <div className="dashboard-grid" style={{ gridTemplateColumns: '0.8fr 1.2fr', gap: 20 }}>
              {/* Endpoint selection & details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BookOpen size={16} /> <span>Elegir Recurso API</span>
                    </h3>
                  </div>
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
                    Selecciona un recurso para ver la especificación del endpoint e inyectar automáticamente tu clave en los fragmentos de código.
                  </p>

                  <div className="form-group">
                    <label className="form-label">Clave API Activa</label>
                    <select 
                      className="form-input"
                      value={selectedKey?.id || ''}
                      onChange={(e) => setSelectedKey(apiKeys.find(k => k.id === e.target.value) || null)}
                      style={{ padding: '6px 12px', fontSize: 13, height: '36px' }}
                    >
                      {apiKeys.map(k => (
                        <option key={k.id} value={k.id}>{k.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">Endpoint de Destino</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button 
                        className={`btn-secondary ${playgroundEndpoint === '/devices' ? 'active' : ''}`}
                        onClick={() => handleEndpointChange('/devices')}
                        style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: 12, textAlign: 'left' }}
                      >
                        <span className="type-badge bin" style={{ background: '#E3F2FD', color: '#0D47A1', padding: '1px 6px', marginRight: 8, fontSize: 9 }}>GET</span>
                        /devices (Lista de equipos)
                      </button>

                      <button 
                        className={`btn-secondary ${playgroundEndpoint === '/telemetry' ? 'active' : ''}`}
                        onClick={() => handleEndpointChange('/telemetry')}
                        style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: 12, textAlign: 'left' }}
                      >
                        <span className="type-badge bin" style={{ background: '#E3F2FD', color: '#0D47A1', padding: '1px 6px', marginRight: 8, fontSize: 9 }}>GET</span>
                        /telemetry (Últimas lecturas)
                      </button>

                      <button 
                        className={`btn-secondary ${playgroundEndpoint === '/telemetry/:devEUI' ? 'active' : ''}`}
                        onClick={() => handleEndpointChange('/telemetry/:devEUI')}
                        style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: 12, textAlign: 'left' }}
                      >
                        <span className="type-badge bin" style={{ background: '#E3F2FD', color: '#0D47A1', padding: '1px 6px', marginRight: 8, fontSize: 9 }}>GET</span>
                        /telemetry/:devEUI (Historial de equipo)
                      </button>

                      <button 
                        className={`btn-secondary ${playgroundEndpoint === '/devices/:devEUI/valve' ? 'active' : ''}`}
                        onClick={() => handleEndpointChange('/devices/:devEUI/valve')}
                        style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: 12, textAlign: 'left' }}
                      >
                        <span className="type-badge water" style={{ background: '#FFE0B2', color: '#E65100', padding: '1px 6px', marginRight: 8, fontSize: 9 }}>POST</span>
                        /devices/:devEUI/valve (Válvula)
                      </button>

                      <button 
                        className={`btn-secondary ${playgroundEndpoint === '/alerts' ? 'active' : ''}`}
                        onClick={() => handleEndpointChange('/alerts')}
                        style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: 12, textAlign: 'left' }}
                      >
                        <span className="type-badge bin" style={{ background: '#E3F2FD', color: '#0D47A1', padding: '1px 6px', marginRight: 8, fontSize: 9 }}>GET</span>
                        /alerts (Bitácora de alertas)
                      </button>
                    </div>
                  </div>

                  {(playgroundEndpoint.includes(':devEUI') || playgroundEndpoint === '/telemetry/:devEUI') && (
                    <div className="form-group" style={{ marginTop: 14 }}>
                      <label className="form-label">DevEUI del Sensor de Prueba</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={playgroundDevEUI}
                        onChange={(e) => setPlaygroundDevEUI(e.target.value)}
                        placeholder="Ej. AA00000000000001"
                      />
                    </div>
                  )}

                  {playgroundEndpoint === '/devices/:devEUI/valve' && (
                    <div style={{ marginTop: 14, display: 'flex', justifySelf: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Comando a enviar (Válvula):</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          className={`btn-secondary ${playgroundValveOpen ? 'active' : ''}`} 
                          onClick={() => setPlaygroundValveOpen(true)}
                          style={{ padding: '3px 10px', fontSize: 11 }}
                        >
                          Abrir (True)
                        </button>
                        <button 
                          className={`btn-secondary ${!playgroundValveOpen ? 'active' : ''}`} 
                          onClick={() => setPlaygroundValveOpen(false)}
                          style={{ padding: '3px 10px', fontSize: 11 }}
                        >
                          Cerrar (False)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Code interactive display card */}
              <div className="card" style={{ background: '#1E1E1E', color: '#D4D4D4', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className={`filter-tab ${docLanguage === 'curl' ? 'active' : ''}`}
                      onClick={() => setDocLanguage('curl')}
                      style={{ padding: '4px 10px', fontSize: 11, background: docLanguage === 'curl' ? '#333' : 'transparent', color: '#fff', border: 'none', borderRadius: 4 }}
                    >
                      curl (Terminal)
                    </button>
                    <button 
                      className={`filter-tab ${docLanguage === 'node' ? 'active' : ''}`}
                      onClick={() => setDocLanguage('node')}
                      style={{ padding: '4px 10px', fontSize: 11, background: docLanguage === 'node' ? '#333' : 'transparent', color: '#fff', border: 'none', borderRadius: 4 }}
                    >
                      Node.js (Fetch)
                    </button>
                    <button 
                      className={`filter-tab ${docLanguage === 'python' ? 'active' : ''}`}
                      onClick={() => setDocLanguage('python')}
                      style={{ padding: '4px 10px', fontSize: 11, background: docLanguage === 'python' ? '#333' : 'transparent', color: '#fff', border: 'none', borderRadius: 4 }}
                    >
                      Python
                    </button>
                  </div>

                  <button 
                    className="btn-secondary"
                    onClick={() => handleCopyCodeSnippet(getCodeSnippet())}
                    style={{ padding: '4px 8px', fontSize: 11, background: '#333', color: '#fff', border: 'none' }}
                  >
                    {copiedSnippet ? (
                      <>
                        <Check size={12} className="text-teal-500" style={{ marginRight: 4 }} />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} style={{ marginRight: 4 }} />
                        <span>Copiar código</span>
                      </>
                    )}
                  </button>
                </div>

                <div style={{ flex: 1, position: 'relative' }}>
                  <pre style={{ 
                    fontFamily: 'monospace', 
                    fontSize: 12, 
                    margin: 0, 
                    padding: 12, 
                    background: '#151515', 
                    borderRadius: 6,
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                    color: '#9CDCFE',
                    lineHeight: 1.5,
                    minHeight: 200
                  }}>
                    {getCodeSnippet()}
                  </pre>
                </div>

                <div style={{ marginTop: 12, fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={13} />
                  <span>Copia este fragmento de código directamente en tus sistemas para empezar a canalizar instrumentación IoT LoRaWAN en tiempo real.</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PLAYGROUND & API CONSOLE */}
          {activeTab === 'playground' && (
            <div className="dashboard-grid" style={{ gridTemplateColumns: '0.8fr 1.2fr', gap: 20 }}>
              {/* Form config for request */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Terminal size={16} /> <span>Parámetros de Simulación</span>
                  </h3>
                </div>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
                  Configura y ejecuta una petición REST real en vivo. Los resultados se procesarán al instante y se mostrarán en la terminal.
                </p>

                <div className="form-group">
                  <label className="form-label">Clave API a usar</label>
                  <select 
                    className="form-input"
                    value={selectedKey?.id || ''}
                    onChange={(e) => setSelectedKey(apiKeys.find(k => k.id === e.target.value) || null)}
                    style={{ padding: '6px 12px', fontSize: 13, height: '36px' }}
                  >
                    {apiKeys.map(k => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Endpoint</label>
                  <select 
                    className="form-input"
                    value={playgroundEndpoint}
                    onChange={(e) => handleEndpointChange(e.target.value)}
                    style={{ padding: '6px 12px', fontSize: 13, height: '36px' }}
                  >
                    <option value="/devices">GET /external-api/devices (Listar dispositivos)</option>
                    <option value="/devices/:devEUI">GET /external-api/devices/:devEUI (Obtener un dispositivo)</option>
                    <option value="/telemetry">GET /external-api/telemetry (Telemetrías globales)</option>
                    <option value="/telemetry/:devEUI">GET /external-api/telemetry/:devEUI (Historial de sensor)</option>
                    <option value="/devices/:devEUI/valve">POST /external-api/devices/:devEUI/valve (Válvula)</option>
                    <option value="/alerts">GET /external-api/alerts (Bitácora de alertas)</option>
                  </select>
                </div>

                {(playgroundEndpoint.includes(':devEUI') || playgroundEndpoint === '/telemetry/:devEUI') && (
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">DevEUI del Sensor</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={playgroundDevEUI}
                      onChange={(e) => setPlaygroundDevEUI(e.target.value)}
                      placeholder="Ej. AA00000000000001"
                    />
                  </div>
                )}

                {playgroundEndpoint === '/devices/:devEUI/valve' && (
                  <div style={{ marginTop: 14, display: 'flex', justifySelf: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Comando de Válvula:</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button 
                        className={`btn-secondary ${playgroundValveOpen ? 'active' : ''}`} 
                        onClick={() => setPlaygroundValveOpen(true)}
                        style={{ padding: '3px 10px', fontSize: 11 }}
                      >
                        Abrir (True)
                      </button>
                      <button 
                        className={`btn-secondary ${!playgroundValveOpen ? 'active' : ''}`} 
                        onClick={() => setPlaygroundValveOpen(false)}
                        style={{ padding: '3px 10px', fontSize: 11 }}
                      >
                        Cerrar (False)
                      </button>
                    </div>
                  </div>
                )}

                <button 
                  className="btn-primary"
                  onClick={handleExecutePlayground}
                  disabled={executingPlayground || !selectedKey}
                  style={{ width: '100%', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {executingPlayground ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Ejecutando petición...</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} fill="currentColor" />
                      <span>Ejecutar Petición API</span>
                    </>
                  )}
                </button>
              </div>

              {/* Terminal Dark response Display */}
              <div 
                className="card" 
                style={{ 
                  background: '#121212', 
                  color: '#EDEDED', 
                  fontFamily: 'monospace', 
                  fontSize: 12, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  border: '1px solid #2d2d2d',
                  padding: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1c1c1c', padding: '10px 14px', borderBottom: '1px solid #2d2d2d', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }}></div>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }}></div>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }}></div>
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>Terminal de Pruebas de API</span>
                </div>

                <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 300, maxHeight: 420 }}>
                  {playgroundReqHeaders ? (
                    <div>
                      <span style={{ color: '#888' }}>$ host-query --request {playgroundReqHeaders.method} "{playgroundReqHeaders.url}" \</span>
                      <br />
                      <span style={{ color: '#888' }}>&nbsp;&nbsp;--header "X-API-Key: {playgroundReqHeaders.headers['X-API-Key'].substring(0, 8)}..."</span>
                      {playgroundEndpoint.includes('valve') && (
                        <>
                          <br />
                          <span style={{ color: '#888' }}>&nbsp;&nbsp;--data '{JSON.stringify({ open: playgroundValveOpen })}'</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#666', textAlign: 'center', marginTop: 40, fontFamily: 'sans-serif' }}>
                      <Terminal size={40} style={{ margin: '0 auto 12px auto', color: '#444', display: 'block' }} />
                      <p style={{ margin: 0, fontSize: 13 }}>Configura los parámetros a la izquierda y presiona "Ejecutar Petición".</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: 11 }}>La respuesta HTTP se mostrará aquí en tiempo real con colores de consola.</p>
                    </div>
                  )}

                  {executingPlayground && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-teal)' }}>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Conectando con el Servidor NestJS...</span>
                    </div>
                  )}

                  {playgroundResponse && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#888' }}>HTTP STATUS:</span>
                        <span className="type-badge" style={{ 
                          fontSize: 10, 
                          padding: '2px 8px', 
                          background: playgroundResponse.status >= 200 && playgroundResponse.status < 300 ? '#1B5E20' : '#C62828',
                          color: '#fff' 
                        }}>
                          {playgroundResponse.status} {playgroundResponse.statusText}
                        </span>
                      </div>

                      <pre style={{ 
                        margin: 0, 
                        background: '#0a0a0a', 
                        padding: 12, 
                        borderRadius: 6, 
                        border: '1px solid #222', 
                        overflowX: 'auto',
                        color: playgroundResponse.status >= 200 && playgroundResponse.status < 300 ? '#7CD87C' : '#FF6B6B',
                        fontSize: 11,
                        lineHeight: 1.4
                      }}>
                        {JSON.stringify(playgroundResponse.body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= DRAWER CREAR CLAVE API ================= */}
      {showCreateModal && (
        <div className="slide-over-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Key size={20} className="text-teal-500" /> Generar Nueva Clave API
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Genera una credencial portadora segura de API REST para consumos externos.
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

            <form onSubmit={(e) => { e.preventDefault(); handleCreateKey(); }} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
              <div className="drawer-body">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nombre de la Clave API *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej. Integración ERP Plásticos Rival" 
                    value={newKeyName} 
                    onChange={(e) => setNewKeyName(e.target.value)} 
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Descripción / Propósito</label>
                  <textarea 
                    className="form-input" 
                    placeholder="Describir qué sistema externo o cliente utilizará esta credencial." 
                    value={newKeyDesc} 
                    onChange={(e) => setNewKeyDesc(e.target.value)}
                    style={{ minHeight: 80, resize: 'vertical', padding: '10px 12px' }}
                  />
                </div>

                {user?.role === 'superadmin' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Asociar a Cliente (Multi-tenant)</label>
                    <select 
                      className="form-input" 
                      value={newKeyOrgId} 
                      onChange={(e) => setNewKeyOrgId(e.target.value)}
                    >
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="active-alerts" style={{ background: '#FFF9C4', borderColor: '#FFF176', color: '#F57F17', marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <AlertTriangle size={16} />
                    <span style={{ fontWeight: 700, fontSize: 12 }}>Aviso de Seguridad</span>
                  </div>
                  <p style={{ margin: 0, marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>
                    Cualquier persona que posea esta clave de API podrá leer las telemetrías y controlar las válvulas de la organización asignada. Por favor, compártela de forma segura y revoque tokens sospechosos de inmediato.
                  </p>
                </div>
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
                  disabled={creating || !newKeyName.trim()}
                >
                  {creating ? 'Generando...' : 'Generar Clave API'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// React Icons fallback for close X button in modal
function X({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
