import { useState, useEffect } from 'react';
import { 
  Bell, CheckCheck, Plus, Eye, Edit2, Trash2, X, 
  Sliders, ShieldAlert, ToggleLeft, ToggleRight, Info, AlertTriangle, Play
} from 'lucide-react';
import AlertItem from '../components/alerts/AlertItem';
import { MOCK_ALERTS, MOCK_DEVICES } from '../services/mockData';
import type { Alert, AlertRule, Device, DeviceGroup } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  getAlertRules, saveAlertRules, getAlerts, saveAlerts 
} from '../services/alertsEngine';
import { getDevices } from '../services/api';

export default function AlertsPage() {
  const { user, clients } = useAuth();
  
  // Tabs: 'history' (received alerts) | 'rules' (threshold rules config)
  const [activeTab, setActiveTab] = useState<'history' | 'rules'>('history');
  
  // States for alerts history
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged'>('active');
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // States for alert rules
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);

  // Drawer form states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Form fields
  const [ruleName, setRuleName] = useState('');
  const [ruleDeviceType, setRuleDeviceType] = useState<'water_meter' | 'smartbin'>('water_meter');
  const [ruleApplyTo, setRuleApplyTo] = useState<'all' | 'group' | 'single'>('all');
  const [ruleDeviceGroupId, setRuleDeviceGroupId] = useState('');
  const [ruleDeviceEUI, setRuleDeviceEUI] = useState('');
  const [ruleMetricKey, setRuleMetricKey] = useState('flow');
  const [ruleOperator, setRuleOperator] = useState<AlertRule['operator']>('>');
  const [ruleThresholdValue, setRuleThresholdValue] = useState(50);
  const [ruleSeverity, setRuleSeverity] = useState<AlertRule['severity']>('warning');
  const [ruleMessageTemplate, setRuleMessageTemplate] = useState('');
  const [ruleOrgId, setRuleOrgId] = useState('org1');

  // Load rules, alerts and devices on startup
  useEffect(() => {
    // 1. Devices
    getDevices()
      .then(data => {
        if (data && data.length > 0) {
          setDevices(data);
        }
      })
      .catch(() => {});

    // 2. Mappings
    const storedMappings = localStorage.getItem('device_organization_mappings');
    if (storedMappings) {
      setMappings(JSON.parse(storedMappings));
    }

    // 3. Device Groups
    const storedGroups = localStorage.getItem('device_groups');
    if (storedGroups) {
      setDeviceGroups(JSON.parse(storedGroups));
    }

    // 4. Alerts
    const storedAlerts = getAlerts();
    if (storedAlerts.length === 0) {
      saveAlerts(MOCK_ALERTS);
      setAlerts(MOCK_ALERTS);
    } else {
      setAlerts(storedAlerts);
    }

    // 5. Rules
    const currentOrg = user?.role === 'superadmin' ? 'org1' : user?.organizationId || 'org1';
    setRules(getAlertRules());
    setRuleOrgId(currentOrg);
  }, [user]);

  // Acknowledge alert
  const acknowledge = (id: string) => {
    const updated = alerts.map((a) => a.id === id ? { ...a, acknowledged: true } : a);
    setAlerts(updated);
    saveAlerts(updated);
  };

  // Delete alert
  const deleteAlert = (id: string) => {
    const updated = alerts.filter((a) => a.id !== id);
    setAlerts(updated);
    saveAlerts(updated);
  };

  // Acknowledge all alerts
  const acknowledgeAll = () => {
    const updated = alerts.map((a) => ({ ...a, acknowledged: true }));
    setAlerts(updated);
    saveAlerts(updated);
  };

  // Filter alerts by multi-tenant mapping
  const tenantAlerts = alerts.filter((a) => {
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[a.devEUI] || 'org1';
      if (deviceOrg !== user?.organizationId) {
        return false;
      }
    }
    return true;
  });

  const filteredAlerts = tenantAlerts.filter((a) => {
    if (filter === 'active') return !a.acknowledged;
    if (filter === 'acknowledged') return a.acknowledged;
    return true;
  });

  const activeCount = tenantAlerts.filter((a) => !a.acknowledged).length;

  // Filter rules by organization if not superadmin
  const targetOrgId = user?.role === 'superadmin' ? ruleOrgId : user?.organizationId || 'org1';
  const tenantRules = rules.filter(r => {
    if (user?.role !== 'superadmin') {
      return r.organizationId === user?.organizationId;
    }
    return r.organizationId === ruleOrgId;
  });

  // Handle toggle rule status
  const handleToggleRule = (ruleId: string) => {
    const updatedRules = rules.map(r => r.id === ruleId ? { ...r, active: !r.active } : r);
    setRules(updatedRules);
    saveAlertRules(updatedRules);
  };

  // Delete dynamic rule
  const handleDeleteRule = (ruleId: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta regla de monitoreo?')) {
      const updatedRules = rules.filter(r => r.id !== ruleId);
      setRules(updatedRules);
      saveAlertRules(updatedRules);
    }
  };

  // Open rules configuration drawer
  const handleOpenAddDrawer = () => {
    setDrawerMode('add');
    setEditingRuleId(null);
    setRuleName('');
    setRuleDeviceType('water_meter');
    setRuleApplyTo('all');
    setRuleDeviceGroupId('');
    setRuleDeviceEUI('');
    setRuleMetricKey('flow');
    setRuleOperator('>');
    setRuleThresholdValue(50);
    setRuleSeverity('warning');
    setRuleMessageTemplate('¡Alerta! Sensor {deviceName} reportó {value} L/h');
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (rule: AlertRule) => {
    setDrawerMode('edit');
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleDeviceType(rule.deviceType);
    setRuleApplyTo(rule.applyToAll ? 'all' : rule.deviceGroupId ? 'group' : 'single');
    setRuleDeviceGroupId(rule.deviceGroupId || '');
    setRuleDeviceEUI(rule.deviceEUI || '');
    setRuleMetricKey(rule.metricKey);
    setRuleOperator(rule.operator);
    setRuleThresholdValue(rule.thresholdValue);
    setRuleSeverity(rule.severity);
    setRuleMessageTemplate(rule.messageTemplate);
    setRuleOrgId(rule.organizationId);
    setIsDrawerOpen(true);
  };

  // Metric options helper
  const getMetricLabel = (key: string) => {
    const labels: Record<string, string> = {
      flow: '🌊 Caudal (L/h)',
      level: '💧 Nivel (cm)',
      fillLevel: '🗑️ Llenado (%)',
      temperature: '🌡️ Temperatura (°C)',
      battery: '🔋 Batería (%)',
      pressure: '🎈 Presión (bar)'
    };
    return labels[key] || key;
  };

  // Save rule trigger
  const handleSaveRule = () => {
    if (!ruleName.trim()) {
      alert('Por favor, ingresa el nombre de la regla.');
      return;
    }

    const currentOrg = user?.role === 'superadmin' ? ruleOrgId : user?.organizationId || 'org1';

    const ruleData: AlertRule = {
      id: drawerMode === 'add' ? 'rule-' + Math.random().toString(36).substr(2, 9) : editingRuleId!,
      name: ruleName.trim(),
      applyToAll: ruleApplyTo === 'all',
      deviceType: ruleDeviceType,
      deviceGroupId: ruleApplyTo === 'group' ? ruleDeviceGroupId : undefined,
      deviceEUI: ruleApplyTo === 'single' ? ruleDeviceEUI : undefined,
      metricKey: ruleMetricKey,
      operator: ruleOperator,
      thresholdValue: Number(ruleThresholdValue),
      severity: ruleSeverity,
      messageTemplate: ruleMessageTemplate.trim() || `¡Alerta en {deviceName}! Métrica {metric} es {value}`,
      active: drawerMode === 'add' ? true : rules.find(r => r.id === editingRuleId)?.active ?? true,
      organizationId: currentOrg,
      createdAt: new Date().toISOString()
    };

    let updatedRules: AlertRule[] = [];
    if (drawerMode === 'add') {
      updatedRules = [...rules, ruleData];
    } else {
      updatedRules = rules.map(r => r.id === editingRuleId ? ruleData : r);
    }

    setRules(updatedRules);
    saveAlertRules(updatedRules);
    setIsDrawerOpen(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 15 }}>
        <div>
          <h2 className="page-title">Centro de Monitoreo</h2>
          <p className="page-subtitle">
            {activeTab === 'history' 
              ? `${activeCount} alertas activas · ${tenantAlerts.length} total`
              : `${tenantRules.length} reglas de alertas personalizadas configuradas`
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'history' ? (
            activeCount > 0 && (
              <button className="btn-secondary" onClick={acknowledgeAll} style={{ height: 42 }}>
                <CheckCheck size={16} /> Atender todas
              </button>
            )
          ) : (
            <button className="btn-primary" onClick={handleOpenAddDrawer} style={{ height: 42, background: 'var(--teal)', color: 'white' }}>
              <Plus size={16} /> Nueva Regla
            </button>
          )}
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="filter-tabs" style={{ marginBottom: 20 }}>
        <button 
          className={`filter-tab ${activeTab === 'history' ? 'active' : ''}`} 
          onClick={() => setActiveTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Bell size={14} /> Historial de Alertas
        </button>
        <button 
          className={`filter-tab ${activeTab === 'rules' ? 'active' : ''}`} 
          onClick={() => setActiveTab('rules')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Sliders size={14} /> Reglas de Alarma
        </button>
      </div>

      {/* Superadmin Org Selector (only in Rules tab) */}
      {user?.role === 'superadmin' && activeTab === 'rules' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(29, 158, 117, 0.05)',
          padding: '10px 15px',
          borderRadius: 8,
          border: '1px solid rgba(29, 158, 117, 0.15)',
          marginBottom: 15
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal-dark)' }}>Visualizar reglas del cliente:</span>
          <select 
            className="form-input" 
            value={ruleOrgId} 
            onChange={(e) => setRuleOrgId(e.target.value)}
            style={{ width: 'auto', minWidth: 200, minHeight: 36, padding: '4px 10px', fontSize: 13 }}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === 'history' ? (
        <>
          <div className="filter-tabs" style={{ background: 'transparent', padding: 0, border: 'none', marginBottom: 15 }}>
            {(['all', 'active', 'acknowledged'] as const).map((f) => (
              <button 
                key={f} 
                className={`filter-tab ${filter === f ? 'active' : ''}`} 
                onClick={() => setFilter(f)}
                style={{ fontSize: 13, padding: '5px 12px' }}
              >
                {f === 'all' ? 'Todas' : f === 'active' ? 'Sin atender' : 'Atendidas'}
              </button>
            ))}
          </div>

          <div className="card" style={{ marginTop: 0 }}>
            {filteredAlerts.length === 0 ? (
              <div className="empty-state">
                <Bell size={32} style={{ color: 'var(--color-text-tertiary)' }} />
                <div>No hay alertas {filter === 'active' ? 'activas' : ''}</div>
              </div>
            ) : (
              <div className="alerts-list">
                {filteredAlerts.map((a) => (
                  <AlertItem key={a.id} alert={a} onAcknowledge={acknowledge} onDelete={deleteAlert} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 15 }}>
          {tenantRules.map((rule) => {
            const ruleDevice = devices.find(d => d.devEUI === rule.deviceEUI);
            const ruleGroup = deviceGroups.find(g => g.id === rule.deviceGroupId);
            
            return (
              <div 
                key={rule.id} 
                className="card rule-card"
                style={{ 
                  margin: 0, 
                  padding: 16, 
                  border: '1px solid var(--color-border)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  gap: 12,
                  position: 'relative',
                  opacity: rule.active ? 1 : 0.75,
                  transition: 'opacity 0.2s ease',
                  background: rule.severity === 'critical' && rule.active 
                    ? 'linear-gradient(to right, rgba(239, 68, 68, 0.03), var(--color-card))' 
                    : 'var(--color-card)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                      {rule.name}
                    </h3>
                    <span 
                      style={{ 
                        fontSize: 10, 
                        fontWeight: 600, 
                        padding: '2px 8px', 
                        borderRadius: 20, 
                        background: rule.severity === 'critical' ? 'var(--red-bg)' : rule.severity === 'warning' ? 'var(--amber-bg)' : 'var(--teal-bg)',
                        color: rule.severity === 'critical' ? 'var(--red)' : rule.severity === 'warning' ? 'var(--amber-dark)' : 'var(--teal-dark)'
                      }}
                    >
                      {rule.severity === 'critical' ? 'Crítica' : rule.severity === 'warning' ? 'Advertencia' : 'Información'}
                    </span>
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                    {rule.messageTemplate}
                  </p>

                  <div style={{ 
                    fontSize: 11, 
                    background: 'var(--color-bg)', 
                    padding: '8px 10px', 
                    borderRadius: 6,
                    border: '1.5px solid var(--color-border)',
                    fontFamily: 'monospace',
                    color: 'var(--color-text)'
                  }}>
                    <strong style={{ color: 'var(--teal)' }}>Regla:</strong> {getMetricLabel(rule.metricKey)} {rule.operator} {rule.thresholdValue}
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-hint)' }}>
                      🔑 Aplica a:{' '}
                      {rule.applyToAll 
                        ? `Todos los ${rule.deviceType === 'water_meter' ? 'Medidores' : 'Contenedores'}` 
                        : rule.deviceGroupId 
                          ? `Grupo: ${ruleGroup?.name || rule.deviceGroupId}` 
                          : `Sensor: ${ruleDevice?.name || rule.deviceEUI}`
                      }
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 4 }}>
                  <button 
                    onClick={() => handleToggleRule(rule.id)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: rule.active ? 'var(--teal)' : 'var(--color-muted)',
                      padding: 0
                    }}
                  >
                    {rule.active ? (
                      <>
                        <ToggleRight size={22} style={{ color: 'var(--teal)' }} /> Activa
                      </>
                    ) : (
                      <>
                        <ToggleLeft size={22} style={{ color: 'var(--color-muted)' }} /> Inactiva
                      </>
                    )}
                  </button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => handleOpenEditDrawer(rule)}
                      style={{ padding: 6, minWidth: 'auto', height: 28, borderRadius: 6 }}
                      title="Editar regla"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      className="btn-secondary" 
                      onClick={() => handleDeleteRule(rule.id)}
                      style={{ padding: 6, minWidth: 'auto', height: 28, borderRadius: 6, color: 'var(--red)' }}
                      title="Eliminar regla"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {tenantRules.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', background: 'var(--color-card)', borderRadius: 12, border: '1px dashed var(--color-border)' }}>
              <Sliders size={32} style={{ color: 'var(--color-text-tertiary)', marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>No se encontraron reglas de alarma</div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>Crea una regla de alerta personalizada para comenzar a monitorear tus dispositivos de forma inteligente.</div>
            </div>
          )}
        </div>
      )}

      {/* Slide-over Drawer for rules CRUD */}
      {isDrawerOpen && (
        <div className="slide-over-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()} style={{ width: '480px', maxWidth: '100%' }}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  {drawerMode === 'add' ? 'Nueva Regla de Monitoreo' : 'Editar Regla de Monitoreo'}
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Define límites analíticos dinámicos y dispara alertas automáticas cuando los uplinks superen las condiciones.
                </p>
              </div>
              <button 
                className="btn-secondary" 
                onClick={() => setIsDrawerOpen(false)} 
                style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span>×</span>
              </button>
            </div>

            <div className="drawer-body">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Nombre de la Regla *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej. Fuga en Sensor Caudal A" 
                  value={ruleName} 
                  onChange={(e) => setRuleName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Tipo de Dispositivo</label>
                <select 
                  className="form-input" 
                  value={ruleDeviceType} 
                  onChange={(e: any) => {
                    const type = e.target.value;
                    setRuleDeviceType(type);
                    setRuleMetricKey(type === 'water_meter' ? 'flow' : 'fillLevel');
                    setRuleDeviceGroupId('');
                    setRuleDeviceEUI('');
                  }}
                >
                  <option value="water_meter">💧 Medidores de Agua (Water Meters)</option>
                  <option value="smartbin">🗑️ SmartBins (Contenedores)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Alcance de la Regla (Aplicar a)</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button 
                    type="button" 
                    className={`btn-secondary ${ruleApplyTo === 'all' ? 'active' : ''}`}
                    onClick={() => { setRuleApplyTo('all'); setRuleDeviceGroupId(''); setRuleDeviceEUI(''); }}
                    style={{ flex: 1, height: 38, fontSize: 12, background: ruleApplyTo === 'all' ? 'var(--teal-bg)' : '', borderColor: ruleApplyTo === 'all' ? 'var(--teal)' : '', color: ruleApplyTo === 'all' ? 'var(--teal-dark)' : '' }}
                  >
                    Todos
                  </button>
                  <button 
                    type="button" 
                    className={`btn-secondary ${ruleApplyTo === 'group' ? 'active' : ''}`}
                    onClick={() => { setRuleApplyTo('group'); setRuleDeviceEUI(''); }}
                    style={{ flex: 1, height: 38, fontSize: 12, background: ruleApplyTo === 'group' ? 'var(--teal-bg)' : '', borderColor: ruleApplyTo === 'group' ? 'var(--teal)' : '', color: ruleApplyTo === 'group' ? 'var(--teal-dark)' : '' }}
                  >
                    Grupo
                  </button>
                  <button 
                    type="button" 
                    className={`btn-secondary ${ruleApplyTo === 'single' ? 'active' : ''}`}
                    onClick={() => { setRuleApplyTo('single'); setRuleDeviceGroupId(''); }}
                    style={{ flex: 1, height: 38, fontSize: 12, background: ruleApplyTo === 'single' ? 'var(--teal-bg)' : '', borderColor: ruleApplyTo === 'single' ? 'var(--teal)' : '', color: ruleApplyTo === 'single' ? 'var(--teal-dark)' : '' }}
                  >
                    Sensor Individual
                  </button>
                </div>
              </div>

              {/* Conditionally render Group selector */}
              {ruleApplyTo === 'group' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Selecciona el Grupo de Dispositivos *</label>
                  <select 
                    className="form-input" 
                    value={ruleDeviceGroupId}
                    onChange={(e) => setRuleDeviceGroupId(e.target.value)}
                  >
                    <option value="">Selecciona un grupo...</option>
                    {deviceGroups.filter(g => g.deviceType === ruleDeviceType && (user?.role === 'superadmin' ? g.organizationId === ruleOrgId : true)).map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.deviceEUIs.length} dispositivos)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditionally render Device selector */}
              {ruleApplyTo === 'single' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Selecciona el Sensor IoT *</label>
                  <select 
                    className="form-input" 
                    value={ruleDeviceEUI}
                    onChange={(e) => setRuleDeviceEUI(e.target.value)}
                  >
                    <option value="">Selecciona un dispositivo...</option>
                    {devices.filter(d => d.deviceType === ruleDeviceType && (user?.role === 'superadmin' ? mappings[d.devEUI] === ruleOrgId : true)).map(d => (
                      <option key={d.devEUI} value={d.devEUI}>{d.name} ({d.devEUI})</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Métrica *</label>
                  <select 
                    className="form-input" 
                    value={ruleMetricKey}
                    onChange={(e) => setRuleMetricKey(e.target.value)}
                  >
                    {ruleDeviceType === 'water_meter' ? (
                      <>
                        <option value="flow">🌊 Caudal (flow)</option>
                        <option value="level">💧 Nivel (level)</option>
                        <option value="temperature">🌡️ Temperatura (temperature)</option>
                        <option value="battery">🔋 Batería (battery)</option>
                        <option value="pressure">🎈 Presión (pressure)</option>
                      </>
                    ) : (
                      <>
                        <option value="fillLevel">🗑️ Nivel de Llenado (fillLevel)</option>
                        <option value="temperature">🌡️ Temperatura (temperature)</option>
                        <option value="battery">🔋 Batería (battery)</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Operador *</label>
                  <select 
                    className="form-input" 
                    value={ruleOperator}
                    onChange={(e: any) => setRuleOperator(e.target.value)}
                  >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">==</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Umbral *</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="50" 
                    value={ruleThresholdValue}
                    onChange={(e) => setRuleThresholdValue(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Severidad de la Alarma</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button 
                    type="button" 
                    className={`btn-secondary ${ruleSeverity === 'info' ? 'active' : ''}`}
                    onClick={() => setRuleSeverity('info')}
                    style={{ flex: 1, height: 38, fontSize: 11, background: ruleSeverity === 'info' ? 'var(--teal-bg)' : '', borderColor: ruleSeverity === 'info' ? 'var(--teal)' : '', color: ruleSeverity === 'info' ? 'var(--teal-dark)' : '' }}
                  >
                    <Info size={13} style={{ marginRight: 4 }} /> Informativa
                  </button>
                  <button 
                    type="button" 
                    className={`btn-secondary ${ruleSeverity === 'warning' ? 'active' : ''}`}
                    onClick={() => setRuleSeverity('warning')}
                    style={{ flex: 1, height: 38, fontSize: 11, background: ruleSeverity === 'warning' ? 'var(--amber-bg)' : '', borderColor: ruleSeverity === 'warning' ? 'var(--amber)' : '', color: ruleSeverity === 'warning' ? 'var(--amber-dark)' : '' }}
                  >
                    <AlertTriangle size={13} style={{ marginRight: 4 }} /> Advertencia
                  </button>
                  <button 
                    type="button" 
                    className={`btn-secondary ${ruleSeverity === 'critical' ? 'active' : ''}`}
                    onClick={() => setRuleSeverity('critical')}
                    style={{ flex: 1, height: 38, fontSize: 11, background: ruleSeverity === 'critical' ? 'var(--red-bg)' : '', borderColor: ruleSeverity === 'critical' ? 'var(--red)' : '', color: ruleSeverity === 'critical' ? 'var(--red)' : '' }}
                  >
                    <ShieldAlert size={13} style={{ marginRight: 4 }} /> Crítica
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Plantilla del Mensaje de Alerta *</label>
                <textarea 
                  className="form-input" 
                  rows={3}
                  placeholder="¡Alerta! {deviceName} superó el límite. Valor reportado: {value}"
                  value={ruleMessageTemplate}
                  onChange={(e) => setRuleMessageTemplate(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'inherit', padding: '10px 14px' }}
                />
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: 'var(--color-muted)', lineHeight: '1.4' }}>
                  Puedes usar comodines automáticos: <code style={{ background: 'var(--color-bg)', padding: '2px 4px', borderRadius: 4 }}>{`{deviceName}`}</code>, <code style={{ background: 'var(--color-bg)', padding: '2px 4px', borderRadius: 4 }}>{`{value}`}</code>, y <code style={{ background: 'var(--color-bg)', padding: '2px 4px', borderRadius: 4 }}>{`{metric}`}</code>.
                </p>
              </div>

              {user?.role === 'superadmin' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Asignar al Cliente (Tenant)</label>
                  <select 
                    className="form-input" 
                    value={ruleOrgId} 
                    onChange={(e) => setRuleOrgId(e.target.value)}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setIsDrawerOpen(false)}>Cancelar</button>
              <button 
                className="btn-primary" 
                onClick={handleSaveRule}
                disabled={!ruleName.trim() || (ruleApplyTo === 'group' && !ruleDeviceGroupId) || (ruleApplyTo === 'single' && !ruleDeviceEUI)}
                style={{ 
                  opacity: (!ruleName.trim() || (ruleApplyTo === 'group' && !ruleDeviceGroupId) || (ruleApplyTo === 'single' && !ruleDeviceEUI)) ? 0.6 : 1,
                  cursor: (!ruleName.trim() || (ruleApplyTo === 'group' && !ruleDeviceGroupId) || (ruleApplyTo === 'single' && !ruleDeviceEUI)) ? 'not-allowed' : 'pointer',
                  background: 'var(--teal)', 
                  color: 'white'
                }}
              >
                {drawerMode === 'add' ? 'Crear Regla' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
