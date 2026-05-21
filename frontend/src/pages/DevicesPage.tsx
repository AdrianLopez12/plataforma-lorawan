import { useState, useEffect } from 'react';
import { 
  Droplets, Trash2, Wifi, WifiOff, Search, Cpu, RefreshCw, 
  Shield, Plus, FolderOpen, Layers, Settings 
} from 'lucide-react';
import { MOCK_DEVICES } from '../services/mockData';
import { getDevices, getIntegrations } from '../services/api';
import type { Device, Integration, DeviceGroup } from '../types';
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

  // Pestañas generales: 'devices' (Dispositivos) y 'groups' (Grupos)
  const [activeTab, setActiveTab] = useState<'devices' | 'groups'>('devices');

  // Estados de grupos de dispositivos
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [isGroupDrawerOpen, setIsGroupDrawerOpen] = useState(false);
  const [groupDrawerMode, setGroupDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null);

  // Formulario de grupo
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'water_meter' | 'smartbin'>('water_meter');
  const [groupSelectedDevices, setGroupSelectedDevices] = useState<string[]>([]);
  const [groupOrgId, setGroupOrgId] = useState('org1');

  // Cargar mappings y grupos al iniciar
  useEffect(() => {
    let storedMappings = localStorage.getItem('device_organization_mappings');
    if (!storedMappings) {
      localStorage.setItem('device_organization_mappings', JSON.stringify(DEFAULT_DEVICE_MAPPINGS));
      storedMappings = JSON.stringify(DEFAULT_DEVICE_MAPPINGS);
    }
    setMappings(JSON.parse(storedMappings));

    const savedGroups = localStorage.getItem('device_groups');
    if (savedGroups) {
      try {
        setGroups(JSON.parse(savedGroups));
      } catch (e) {
        console.error('Error cargando grupos de dispositivos de localStorage', e);
      }
    }
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
          setIntegrations(data);
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

  // Filtrado de dispositivos
  const filtered = devices.filter((d) => {
    const nameStr = d.name || '';
    const matchSearch = nameStr.toLowerCase().includes(search.toLowerCase()) || d.devEUI.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || d.deviceType === typeFilter;
    
    // Filtro de multi-tenancy
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[d.devEUI] || 'org1';
      if (deviceOrg !== user?.organizationId) {
        return false;
      }
    }

    return matchSearch && matchType;
  });

  // Guardar y sincronizar grupos de dispositivos
  const saveGroups = (newGroups: DeviceGroup[]) => {
    setGroups(newGroups);
    localStorage.setItem('device_groups', JSON.stringify(newGroups));
  };

  // CRUD handlers para Grupos
  const handleOpenAddGroup = () => {
    setGroupName('');
    setGroupType('water_meter');
    setGroupSelectedDevices([]);
    setGroupOrgId(user?.organizationId || 'org1');
    setEditingGroup(null);
    setGroupDrawerMode('add');
    setIsGroupDrawerOpen(true);
  };

  const handleOpenEditGroup = (group: DeviceGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupType(group.deviceType);
    setGroupSelectedDevices(group.deviceEUIs);
    setGroupOrgId(group.organizationId || 'org1');
    setGroupDrawerMode('edit');
    setIsGroupDrawerOpen(true);
  };

  const handleSaveGroup = () => {
    if (!groupName.trim() || groupSelectedDevices.length === 0) return;

    if (groupDrawerMode === 'add') {
      const newId = 'grp-' + Math.random().toString(36).substr(2, 9);
      const newGroup: DeviceGroup = {
        id: newId,
        name: groupName.trim(),
        deviceType: groupType,
        deviceEUIs: groupSelectedDevices,
        organizationId: user?.role === 'superadmin' ? groupOrgId : user?.organizationId || 'org1',
        createdAt: new Date().toISOString()
      };
      saveGroups([...groups, newGroup]);
    } else if (groupDrawerMode === 'edit' && editingGroup) {
      const updated = groups.map(g => {
        if (g.id === editingGroup.id) {
          return {
            ...g,
            name: groupName.trim(),
            deviceType: groupType,
            deviceEUIs: groupSelectedDevices,
            organizationId: user?.role === 'superadmin' ? groupOrgId : g.organizationId
          };
        }
        return g;
      });
      saveGroups(updated);
    }
    setIsGroupDrawerOpen(false);
    setGroupDrawerMode(null);
    setEditingGroup(null);
  };

  const handleDeleteGroup = (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este grupo de dispositivos?')) {
      const updated = groups.filter(g => g.id !== id);
      saveGroups(updated);
    }
  };

  // Filtrado de grupos basado en multi-tenant
  const filteredGroups = groups.filter(g => {
    if (user?.role === 'superadmin') return true;
    return g.organizationId === user?.organizationId;
  });

  // Filtra los dispositivos válidos que pueden agregarse al grupo según tipo y cliente
  const availableDevicesForGroup = devices.filter(d => {
    if (d.deviceType !== groupType) return false;
    const targetOrg = user?.role === 'superadmin' ? groupOrgId : user?.organizationId || 'org1';
    const deviceOrg = mappings[d.devEUI] || 'org1';
    return deviceOrg === targetOrg;
  });

  return (
    <div className="page">
      {/* Cabecera Principal con Pestañas de Vista */}
      <div className="page-header" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="page-title">Dispositivos y Grupos</h2>
            <p className="page-subtitle">
              Administra tus sensores LoRaWAN, asigna clientes y configura conjuntos comparativos de telemetría.
              {user?.role !== 'superadmin' && ` · Cliente: ${clients.find(c => c.id === user?.organizationId)?.name || 'Empresa Demo S.A.'}`}
            </p>
          </div>
        </div>

        {/* Pestañas de navegación estilo píldora premium */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className={`btn-secondary ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 550,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'devices' ? 'var(--teal-bg)' : 'transparent',
              borderColor: activeTab === 'devices' ? 'var(--teal)' : 'var(--color-border)',
              color: activeTab === 'devices' ? 'var(--teal-dark)' : 'var(--color-text)',
              height: '36px'
            }}
          >
            <Cpu size={14} />
            <span>Dispositivos Registrados</span>
          </button>
          
          <button 
            className={`btn-secondary ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 550,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'groups' ? 'var(--teal-bg)' : 'transparent',
              borderColor: activeTab === 'groups' ? 'var(--teal)' : 'var(--color-border)',
              color: activeTab === 'groups' ? 'var(--teal-dark)' : 'var(--color-text)',
              height: '36px'
            }}
          >
            <Layers size={14} />
            <span>Grupos de Dispositivos ({filteredGroups.length})</span>
          </button>
        </div>
      </div>

      {/* VISTA 1: DISPOSITIVOS REGISTRADOS */}
      {activeTab === 'devices' && (
        <>
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
        </>
      )}

      {/* VISTA 2: GRUPOS DE DISPOSITIVOS */}
      {activeTab === 'groups' && (
        <>
          <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>Grupos de Dispositivos Comparativos</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-muted)' }}>Crea conjuntos de sensores homólogos para visualizar líneas de telemetría comparativas en un mismo panel.</p>
            </div>
            
            <button 
              className="btn-primary" 
              onClick={handleOpenAddGroup}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: '38px', padding: '0 16px' }}
            >
              <Plus size={16} />
              <span>Crear Grupo</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
            {filteredGroups.map(grp => {
              const isWater = grp.deviceType === 'water_meter';
              return (
                <div 
                  key={grp.id} 
                  className="card animate-fade-in" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 12, 
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="device-type-icon" style={{ background: isWater ? '#E6F1FB' : '#FAEEDA', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isWater ? <Droplets size={16} style={{ color: '#185FA5' }} /> : <Trash2 size={16} style={{ color: '#854F0B' }} />}
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>{grp.name}</h4>
                        <span className={`type-badge ${isWater ? 'water' : 'bin'}`} style={{ marginTop: 4, display: 'inline-block' }}>
                          {isWater ? 'Grupo Medidores' : 'Grupo SmartBins'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Botones de acción del grupo */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button 
                        className="btn-secondary" 
                        onClick={() => handleOpenEditGroup(grp)}
                        style={{ padding: 4, minWidth: 28, height: 28, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Editar Grupo"
                      >
                        <Settings size={13} style={{ color: 'var(--color-text)' }} />
                      </button>
                      <button 
                        className="btn-secondary" 
                        onClick={() => handleDeleteGroup(grp.id)}
                        style={{ padding: 4, minWidth: 28, height: 28, background: '#FCEBEB', color: 'var(--red)', borderColor: '#F5C2C0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Eliminar Grupo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 10, flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 650, color: 'var(--color-muted)', marginBottom: 6 }}>
                      Dispositivos Integrados ({grp.deviceEUIs.length}):
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto', paddingRight: '4px' }}>
                      {grp.deviceEUIs.map(eui => {
                        const dev = devices.find(d => d.devEUI === eui);
                        return (
                          <div 
                            key={eui} 
                            style={{ 
                              fontSize: 12, 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              color: 'var(--color-text)',
                              padding: '2px 0'
                            }}
                          >
                            <span style={{ fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                              {dev ? dev.name : `Dispositivo ${eui.substring(0, 6)}`}
                            </span>
                            <code style={{ fontSize: 9, color: 'var(--color-hint)', fontFamily: 'monospace' }}>{eui}</code>
                          </div>
                        );
                      })}
                      {grp.deviceEUIs.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--color-hint)', fontStyle: 'italic', padding: '6px 0' }}>
                          Sin dispositivos asociados.
                        </div>
                      )}
                    </div>
                  </div>

                  {user?.role === 'superadmin' && (
                    <div style={{ 
                      fontSize: 10, 
                      color: 'var(--color-hint)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      marginTop: 8, 
                      background: 'var(--color-bg)', 
                      padding: '4px 8px', 
                      borderRadius: 4,
                      border: '0.5px solid var(--color-border)'
                    }}>
                      <Shield size={10} style={{ color: 'var(--teal)' }} />
                      <span>Tenant: {clients.find(c => c.id === grp.organizationId)?.name || 'Empresa Demo S.A.'}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <div 
                className="card" 
                style={{ 
                  gridColumn: '1 / -1', 
                  padding: '48px 24px', 
                  textAlign: 'center', 
                  borderStyle: 'dashed', 
                  borderWidth: 2, 
                  borderColor: 'var(--color-border)',
                  maxWidth: '550px',
                  margin: '0 auto',
                  width: '100%'
                }}
              >
                <FolderOpen size={36} className="text-teal-500" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aún no has creado ningún grupo</h4>
                <p className="text-muted" style={{ fontSize: 13, margin: '8px 0 20px', lineHeight: 1.5 }}>
                  Los grupos de dispositivos te permiten mapear en un solo clic múltiples sensores homólogos para compararlos en tiempo real en tus gráficos lineales de Dashboard.
                </p>
                <button className="btn-primary" onClick={handleOpenAddGroup} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={15} />
                  <span>Crear mi Primer Grupo</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* DRAWER DESLIZANTE LATERAL: AGREGAR O EDITAR GRUPO */}
      {isGroupDrawerOpen && (
        <div className="slide-over-overlay" onClick={() => setIsGroupDrawerOpen(false)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  {groupDrawerMode === 'add' ? 'Crear Grupo de Dispositivos' : 'Editar Grupo de Dispositivos'}
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Agrupa sensores del mismo tipo y cliente para habilitar comparaciones de telemetría inmediatas.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setIsGroupDrawerOpen(false)} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WifiOff size={16} style={{ display: 'none' }} /> <span>×</span>
              </button>
            </div>

            <div className="drawer-body">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Nombre del Grupo *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej. Humedad de Suelo - Sector A" 
                  value={groupName} 
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Tipo de Dispositivos en el Grupo</label>
                <select 
                  className="form-input" 
                  value={groupType} 
                  onChange={(e: any) => {
                    setGroupType(e.target.value);
                    setGroupSelectedDevices([]);
                  }}
                  disabled={groupDrawerMode === 'edit'}
                >
                  <option value="water_meter">💧 Medidores de Agua (Telemetría Caudal / Nivel)</option>
                  <option value="smartbin">🗑️ SmartBins (Telemetría Llenado / Batería)</option>
                </select>
              </div>

              {user?.role === 'superadmin' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Cliente Asignado (Tenant)</label>
                  <select 
                    className="form-input" 
                    value={groupOrgId} 
                    onChange={(e) => {
                      setGroupOrgId(e.target.value);
                      setGroupSelectedDevices([]);
                    }}
                    disabled={groupDrawerMode === 'edit'}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Selecciona los Dispositivos a Integrar *
                </label>
                <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--color-muted)', lineHeight: '1.4' }}>
                  Solo se listan sensores homologados correspondientes al tipo e inquilino (tenant) seleccionados.
                </p>

                <div 
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 200,
                    overflowY: 'auto',
                    padding: 8,
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    background: 'var(--color-bg)'
                  }}
                >
                  {availableDevicesForGroup.map(d => {
                    const isChecked = groupSelectedDevices.includes(d.devEUI);
                    return (
                      <div 
                        key={d.devEUI} 
                        className={`device-select-item ${isChecked ? 'selected' : ''}`}
                        onClick={() => {
                          if (isChecked) {
                            setGroupSelectedDevices(groupSelectedDevices.filter(id => id !== d.devEUI));
                          } else {
                            setGroupSelectedDevices([...groupSelectedDevices, d.devEUI]);
                          }
                        }}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 10, 
                          padding: '8px 10px', 
                          borderRadius: 6, 
                          cursor: 'pointer',
                          fontSize: 12,
                          userSelect: 'none'
                        }}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          style={{ cursor: 'pointer', accentColor: 'var(--teal)' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 550, color: 'var(--color-text)' }}>{d.name}</span>
                          <span style={{ fontSize: 9, color: 'var(--color-hint)', fontFamily: 'monospace' }}>{d.devEUI}</span>
                        </div>
                      </div>
                    );
                  })}

                  {availableDevicesForGroup.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-hint)', fontSize: 12 }}>
                      No se encontraron dispositivos de este tipo disponibles para agrupar.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setIsGroupDrawerOpen(false)}>Cancelar</button>
              <button 
                className="btn-primary" 
                onClick={handleSaveGroup}
                disabled={!groupName.trim() || groupSelectedDevices.length === 0}
                style={{ 
                  opacity: (!groupName.trim() || groupSelectedDevices.length === 0) ? 0.6 : 1,
                  cursor: (!groupName.trim() || groupSelectedDevices.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                {groupDrawerMode === 'add' ? 'Crear Grupo' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
