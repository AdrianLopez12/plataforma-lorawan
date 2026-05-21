import { useState, useEffect } from 'react';
import { 
  Droplets, Trash2, Plus, Settings, 
  Trash, Cpu, Gauge, Map as MapIcon, Thermometer, 
  Battery, Wind, X, LayoutDashboard, Activity, ArrowLeft,
  Zap, Lightbulb, Database, Waves, LineChart, BarChart3
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getDevices, getDeviceTelemetry } from '../services/api';
import type { Device, TelemetryRecord, CustomDashboard, DashboardWidget, TableColumnConfig } from '../types';
import { format } from 'date-fns';
import { generateTelemetryHistory } from '../services/mockData';
import { useAuth } from '../context/AuthContext';

// Fix de iconos Leaflet en Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const mapIcons: Record<string, L.DivIcon> = {
  water_meter: L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#185FA5;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;">💧</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  }),
  smartbin: L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#854F0B;border-radius:6px;border:2.5px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;">🗑️</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  }),
  general: L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#1D9E75;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;">📍</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  })
};

const AVAILABLE_TABLE_COLUMNS = [
  { key: 'receivedAt', label: 'Fecha/Hora', category: 'base' },
  { key: 'rssi', label: 'Señal RSSI (dBm)', category: 'base' },
  { key: 'snr', label: 'Ruido SNR (dB)', category: 'base' },
  { key: 'fPort', label: 'Puerto fPort', category: 'base' },
  { key: 'fCnt', label: 'Contador fCnt', category: 'base' },
  { key: 'flow', label: 'Caudal (L/h)', category: 'telemetry' },
  { key: 'level', label: 'Nivel (cm)', category: 'telemetry' },
  { key: 'fillLevel', label: 'Llenado (%)', category: 'telemetry' },
  { key: 'temperature', label: 'Temperatura (°C)', category: 'telemetry' },
  { key: 'battery', label: 'Batería (%)', category: 'telemetry' },
  { key: 'pressure', label: 'Presión (bar)', category: 'telemetry' },
  { key: 'totalConsumption', label: 'Consumo (m³)', category: 'telemetry' }
];

const resolveTableColumns = (
  tableColumns?: (string | TableColumnConfig)[],
  deviceType?: string
): TableColumnConfig[] => {
  if (!tableColumns || tableColumns.length === 0) {
    const defaultKeys = deviceType === 'water_meter'
      ? ['receivedAt', 'rssi', 'flow', 'level']
      : (deviceType === 'smartbin'
          ? ['receivedAt', 'rssi', 'fillLevel', 'temperature']
          : ['receivedAt', 'rssi', 'snr']);
    return defaultKeys.map(k => {
      const def = AVAILABLE_TABLE_COLUMNS.find(c => c.key === k);
      let unit: string | undefined = undefined;
      if (def && def.label.includes('(')) {
        unit = def.label.substring(def.label.indexOf('(') + 1, def.label.indexOf(')'));
      }
      return {
        key: k,
        label: def ? def.label.split(' ')[0] : k,
        unit
      };
    });
  }

  return tableColumns.map(col => {
    if (typeof col === 'string') {
      const def = AVAILABLE_TABLE_COLUMNS.find(c => c.key === col);
      let unit: string | undefined = undefined;
      if (def && def.label.includes('(')) {
        unit = def.label.substring(def.label.indexOf('(') + 1, def.label.indexOf(')'));
      }
      return {
        key: col,
        label: def ? def.label.split(' ')[0] : col,
        unit
      };
    }
    return col;
  });
};

const DEFAULT_DASHBOARD: CustomDashboard = {
  id: 'dash-default',
  name: 'Dashboard Principal',
  icon: 'LayoutDashboard',
  isPreset: false,
  widgets: []
};

export default function DashboardPage() {
  const { user, clients } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  
  // Dashboard states
  const [dashboards, setDashboards] = useState<CustomDashboard[]>(() => {
    const saved = localStorage.getItem('custom_dashboards');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parseando dashboards de localStorage', e);
      }
    }
    return [DEFAULT_DASHBOARD];
  });
  
  // activeTab es 'list' por defecto para mostrar la consola central de grandes filas
  const [activeTab, setActiveTab] = useState<string>('list');
  const [isEditing, setIsEditing] = useState(false);
  
  // Modals & Drawer
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [editingDashboard, setEditingDashboard] = useState<CustomDashboard | null>(null);
  
  // Create dashboard form state
  const [newDashName, setNewDashName] = useState('');
  const [newDashIcon, setNewDashIcon] = useState('LayoutDashboard');
  const [newDashPreset, setNewDashPreset] = useState<'blank' | 'water_meters' | 'smartbins'>('blank');
  
  // Edit dashboard form state
  const [editDashName, setEditDashName] = useState('');
  const [editDashIcon, setEditDashIcon] = useState('LayoutDashboard');

  // Create panel / widget form state
  const [newWidgetTitle, setNewWidgetTitle] = useState('');
  const [newWidgetType, setNewWidgetType] = useState<'kpi' | 'line' | 'bar' | 'map' | 'table'>('kpi');
  const [newWidgetDevice, setNewWidgetDevice] = useState('');
  const [newWidgetMetric, setNewWidgetMetric] = useState('flow');
  const [newWidgetUnit, setNewWidgetUnit] = useState('L/h');
  const [newWidgetColor, setNewWidgetColor] = useState<'teal' | 'blue' | 'amber' | 'purple' | 'red' | 'gray'>('teal');
  const [newWidgetWidth, setNewWidgetWidth] = useState<'third' | 'half' | 'two-thirds' | 'full'>('half');
  const [newWidgetIcon, setNewWidgetIcon] = useState('Gauge');
  const [newWidgetSelectedDevices, setNewWidgetSelectedDevices] = useState<string[]>([]);
  const [newWidgetTableColumns, setNewWidgetTableColumns] = useState<TableColumnConfig[]>([]);

  // Estados para agregar columnas dinámicamente en la bitácora
  const [tempColLabel, setTempColLabel] = useState('');
  const [tempColKey, setTempColKey] = useState('');
  const [tempColCustomKey, setTempColCustomKey] = useState('');
  const [tempColUnit, setTempColUnit] = useState('');
  const [showAddColForm, setShowAddColForm] = useState(false);

  // Cache para historiales de telemetría de widgets
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, TelemetryRecord[]>>({});
  
  const [newDashOrgId, setNewDashOrgId] = useState('org1');
  const [editDashOrgId, setEditDashOrgId] = useState('org1');
  const [deviceMappings, setDeviceMappings] = useState<Record<string, string>>({});

  // Cargar mappings al iniciar
  useEffect(() => {
    const stored = localStorage.getItem('device_organization_mappings');
    if (stored) {
      setDeviceMappings(JSON.parse(stored));
    }
  }, []);

  // Inicializar organización por defecto para nueva dashboard
  useEffect(() => {
    if (user?.organizationId) {
      setNewDashOrgId(user.organizationId);
    }
  }, [user]);

  // Siembra dinámica de un dashboard por defecto para el tenant si no tiene ninguno
  useEffect(() => {
    if (user && user.role !== 'superadmin') {
      const hasTenantDash = dashboards.some(d => d.organizationId === user.organizationId);
      if (!hasTenantDash) {
        const tenantDefaultDash: CustomDashboard = {
          id: `dash-default-${user.organizationId}`,
          name: `Dashboard de ${user.organizationId === 'org1' ? 'Empresa Demo S.A.' : 'Servicios Públicos Quito'}`,
          icon: 'LayoutDashboard',
          isPreset: false,
          organizationId: user.organizationId,
          widgets: []
        };
        const updated = [...dashboards, tenantDefaultDash];
        setDashboards(updated);
        localStorage.setItem('custom_dashboards', JSON.stringify(updated));
      }
    }
  }, [user, dashboards]);

  const filteredDashboards = dashboards.filter((dash) => {
    if (user?.role === 'superadmin') return true;
    return dash.organizationId === user?.organizationId;
  });

  const filteredDevices = devices.filter(d => {
    if (user?.role === 'superadmin') return true;
    const devOrg = deviceMappings[d.devEUI] || 'org1';
    return devOrg === user?.organizationId;
  });
  
  // Carga de dispositivos reales
  useEffect(() => {
    getDevices()
      .then((data) => {
        if (data && data.length > 0) {
          setDevices(data);
        }
      })
      .catch((err) => {
        console.warn('Error al conectar al backend:', err);
      });
  }, []);

  // Cargar telemetrías de line charts cuando cambia el tab o los widgets
  useEffect(() => {
    if (activeTab === 'list') return;
    const activeDash = dashboards.find(d => d.id === activeTab);
    if (!activeDash) return;

    activeDash.widgets.forEach(widget => {
      if (widget.type === 'line' && widget.deviceEUI && !telemetryHistory[widget.deviceEUI]) {
        getDeviceTelemetry(widget.deviceEUI, 24)
          .then(data => {
            if (data && data.length > 0) {
              setTelemetryHistory(prev => ({
                ...prev,
                [widget.deviceEUI!]: data
              }));
            } else {
              setTelemetryHistory(prev => ({
                ...prev,
                [widget.deviceEUI!]: generateTelemetryHistory(widget.deviceEUI!, 24)
              }));
            }
          })
          .catch(() => {
            setTelemetryHistory(prev => ({
              ...prev,
              [widget.deviceEUI!]: generateTelemetryHistory(widget.deviceEUI!, 24)
            }));
          });
      }
    });
  }, [activeTab, dashboards]);

  const saveDashboards = (newList: CustomDashboard[]) => {
    setDashboards(newList);
    localStorage.setItem('custom_dashboards', JSON.stringify(newList));
  };

  const handleCreateDashboard = () => {
    if (!newDashName.trim()) return;

    const newId = 'dash-' + Math.random().toString(36).substr(2, 9);
    const defaultWidgets: DashboardWidget[] = [];

    if (newDashPreset === 'water_meters') {
      const firstMeter = devices.find(d => d.deviceType === 'water_meter') || devices[0];
      if (firstMeter) {
        defaultWidgets.push(
          {
            id: 'w-kpi-1',
            type: 'kpi',
            title: 'Caudal en Tiempo Real',
            deviceEUI: firstMeter.devEUI,
            metricKey: 'flow',
            metricUnit: 'L/h',
            color: 'teal',
            width: 'half'
          },
          {
            id: 'w-kpi-2',
            type: 'kpi',
            title: 'Nivel del Tanque',
            deviceEUI: firstMeter.devEUI,
            metricKey: 'level',
            metricUnit: 'cm',
            color: 'blue',
            width: 'half'
          },
          {
            id: 'w-line-1',
            type: 'line',
            title: `Caudal Histórico (Últimas 24h) - ${firstMeter.name}`,
            deviceEUI: firstMeter.devEUI,
            metricKey: 'flow',
            metricUnit: 'L/h',
            color: 'teal',
            width: 'full'
          },
          {
            id: 'w-table-1',
            type: 'table',
            title: `Bitácora de Mediciones: ${firstMeter.name}`,
            deviceEUI: firstMeter.devEUI,
            width: 'full'
          }
        );
      }
    } else if (newDashPreset === 'smartbins') {
      const firstBin = devices.find(d => d.deviceType === 'smartbin') || devices[0];
      if (firstBin) {
        defaultWidgets.push(
          {
            id: 'w-kpi-1',
            type: 'kpi',
            title: 'Llenado Contenedor',
            deviceEUI: firstBin.devEUI,
            metricKey: 'fillLevel',
            metricUnit: '%',
            color: 'amber',
            width: 'half'
          },
          {
            id: 'w-kpi-2',
            type: 'kpi',
            title: 'Temperatura Sensor',
            deviceEUI: firstBin.devEUI,
            metricKey: 'temperature',
            metricUnit: '°C',
            color: 'red',
            width: 'half'
          },
          {
            id: 'w-bar-1',
            type: 'bar',
            title: 'Llenado Comparativo de SmartBins',
            metricKey: 'fillLevel',
            metricUnit: '%',
            color: 'amber',
            width: 'full'
          },
          {
            id: 'w-map-1',
            type: 'map',
            title: 'Geolocalización de Dispositivos',
            width: 'full'
          }
        );
      }
    }

    const newDash: CustomDashboard = {
      id: newId,
      name: newDashName,
      icon: newDashIcon,
      isPreset: newDashPreset !== 'blank',
      presetType: newDashPreset === 'blank' ? undefined : (newDashPreset === 'water_meters' ? 'water_meters' : 'smartbins'),
      widgets: defaultWidgets,
      organizationId: user?.role === 'superadmin' ? newDashOrgId : user?.organizationId
    };

    const updated = [...dashboards, newDash];
    saveDashboards(updated);
    setActiveTab(newId);
    
    // Reset form
    setNewDashName('');
    setNewDashIcon('LayoutDashboard');
    setNewDashPreset('blank');
    setIsCreateModalOpen(false);
  };

  const handleUpdateDashboard = () => {
    if (!editingDashboard || !editDashName.trim()) return;

    const updated = dashboards.map(d => {
      if (d.id === editingDashboard.id) {
        return {
          ...d,
          name: editDashName,
          icon: editDashIcon,
          organizationId: user?.role === 'superadmin' ? editDashOrgId : d.organizationId
        };
      }
      return d;
    });

    saveDashboards(updated);
    setEditingDashboard(null);
  };

  const handleDeleteDashboard = (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este dashboard por completo?')) {
      const updated = dashboards.filter(d => d.id !== id);
      const nextList = updated.length > 0 ? updated : [DEFAULT_DASHBOARD];
      saveDashboards(nextList);
      setActiveTab('list');
      setIsEditing(false);
    }
  };

  const handleOpenAddDrawer = () => {
    setNewWidgetTitle('');
    setNewWidgetType('kpi');
    setNewWidgetDevice('');
    setNewWidgetMetric('flow');
    setNewWidgetUnit('L/h');
    setNewWidgetColor('teal');
    setNewWidgetWidth('half');
    setNewWidgetIcon('Gauge');
    setNewWidgetSelectedDevices([]);
    setNewWidgetTableColumns(resolveTableColumns(undefined, undefined));
    setEditingWidget(null);
    setDrawerMode('add');
  };

  const handleOpenEditDrawer = (widget: DashboardWidget) => {
    setEditingWidget(widget);
    setNewWidgetTitle(widget.title);
    setNewWidgetType(widget.type);
    setNewWidgetDevice(widget.deviceEUI || '');
    setNewWidgetMetric(widget.metricKey || 'flow');
    setNewWidgetUnit(widget.metricUnit || '');
    setNewWidgetColor(widget.color || 'teal');
    setNewWidgetWidth(widget.width || 'half');
    setNewWidgetIcon(widget.icon || 'Gauge');
    setNewWidgetSelectedDevices(widget.selectedDevices || []);
    
    const targetDev = devices.find(d => d.devEUI === widget.deviceEUI);
    setNewWidgetTableColumns(resolveTableColumns(widget.tableColumns, targetDev?.deviceType));
    setDrawerMode('edit');
  };

  const handleSaveWidget = () => {
    if (!newWidgetTitle.trim()) return;

    if (drawerMode === 'add') {
      const newId = 'w-' + Math.random().toString(36).substr(2, 9);
      const newWidget: DashboardWidget = {
        id: newId,
        type: newWidgetType,
        title: newWidgetTitle,
        deviceEUI: newWidgetType !== 'bar' && newWidgetType !== 'map' ? newWidgetDevice : undefined,
        selectedDevices: (newWidgetType === 'map' || newWidgetType === 'bar') ? newWidgetSelectedDevices : undefined,
        metricKey: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetMetric : undefined,
        metricUnit: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetUnit : undefined,
        color: newWidgetColor,
        width: newWidgetWidth,
        icon: newWidgetIcon,
        tableColumns: newWidgetType === 'table' ? newWidgetTableColumns : undefined
      };

      const updated = dashboards.map(dash => {
        if (dash.id === activeTab) {
          return {
            ...dash,
            widgets: [...dash.widgets, newWidget]
          };
        }
        return dash;
      });

      saveDashboards(updated);
    } else if (drawerMode === 'edit' && editingWidget) {
      const updated = dashboards.map(dash => {
        if (dash.id === activeTab) {
          return {
            ...dash,
            widgets: dash.widgets.map(w => w.id === editingWidget.id ? {
              ...w,
              type: newWidgetType,
              title: newWidgetTitle,
              deviceEUI: newWidgetType !== 'bar' && newWidgetType !== 'map' ? newWidgetDevice : undefined,
              selectedDevices: (newWidgetType === 'map' || newWidgetType === 'bar') ? newWidgetSelectedDevices : undefined,
              metricKey: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetMetric : undefined,
              metricUnit: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetUnit : undefined,
              color: newWidgetColor,
              width: newWidgetWidth,
              icon: newWidgetIcon,
              tableColumns: newWidgetType === 'table' ? newWidgetTableColumns : undefined
            } : w)
          };
        }
        return dash;
      });

      saveDashboards(updated);
    }

    setDrawerMode(null);
    setEditingWidget(null);
    
    // Reset form
    setNewWidgetTitle('');
    setNewWidgetDevice('');
    setNewWidgetMetric('flow');
    setNewWidgetUnit('L/h');
    setNewWidgetColor('teal');
    setNewWidgetWidth('half');
    setNewWidgetIcon('Gauge');
    setNewWidgetSelectedDevices([]);
    setNewWidgetTableColumns([]);
    
    // Reset temp column states
    setTempColLabel('');
    setTempColKey('');
    setTempColCustomKey('');
    setTempColUnit('');
    setShowAddColForm(false);
  };

  const handleDeleteWidget = (widgetId: string) => {
    const updated = dashboards.map(dash => {
      if (dash.id === activeTab) {
        return {
          ...dash,
          widgets: dash.widgets.filter(w => w.id !== widgetId)
        };
      }
      return dash;
    });
    saveDashboards(updated);
  };

  const handleResizeWidget = (widgetId: string, newWidth: 'third' | 'half' | 'two-thirds' | 'full') => {
    const updated = dashboards.map(dash => {
      if (dash.id === activeTab) {
        return {
          ...dash,
          widgets: dash.widgets.map(w => w.id === widgetId ? { ...w, width: newWidth } : w)
        };
      }
      return dash;
    });
    saveDashboards(updated);
  };

  const renderDashboardIcon = (iconName: string, size = 18) => {
    const iconMap: Record<string, any> = {
      LayoutDashboard: LayoutDashboard,
      Droplets: Droplets,
      Trash2: Trash2,
      Cpu: Cpu,
      Gauge: Gauge,
      Map: MapIcon,
      Thermometer: Thermometer,
      Battery: Battery,
      Wind: Wind,
      Activity: Activity,
      Zap: Zap,
      Lightbulb: Lightbulb,
      Database: Database,
      Waves: Waves,
      LineChart: LineChart,
      BarChart3: BarChart3
    };
    const Component = iconMap[iconName] || LayoutDashboard;
    return <Component size={size} />;
  };

  const activeDashboard = filteredDashboards.find(d => d.id === activeTab);

  // Trigger para cargar formulario de edición
  useEffect(() => {
    if (editingDashboard) {
      setEditDashName(editingDashboard.name);
      setEditDashIcon(editingDashboard.icon);
      setEditDashOrgId(editingDashboard.organizationId || 'org1');
    }
  }, [editingDashboard]);

  // Renderizador de cada tipo de Widget
  const renderWidgetContent = (widget: DashboardWidget) => {
    const targetDevice = devices.find(d => d.devEUI === widget.deviceEUI);
    const telemetry = targetDevice?.lastTelemetry;
    const payload = telemetry?.decodedPayload as any;
    
    switch (widget.type) {
      case 'kpi': {
        const val = payload && widget.metricKey ? payload[widget.metricKey] : null;
        const colorClass = widget.color || 'teal';
        return (
          <div className="widget-kpi-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--color-text)' }}>
                {val !== null && val !== undefined ? (typeof val === 'number' ? val.toFixed(1) : String(val)) : '—'}
                <span style={{ fontSize: '16px', fontWeight: 500, marginLeft: '4px', color: 'var(--color-muted)' }}>
                  {widget.metricUnit}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: 4 }}>
                {targetDevice ? targetDevice.name : 'Ningún dispositivo'}
              </div>
            </div>
            <div className={`stat-card-icon ${colorClass}`} style={{ borderRadius: '50%', padding: '12px', background: `var(--color-bg)` }}>
              {widget.metricKey === 'flow' ? <Activity size={24} style={{ color: 'var(--teal-dark)' }} /> : 
               widget.metricKey === 'fillLevel' ? <Trash2 size={24} style={{ color: 'var(--amber-dark)' }} /> :
               widget.metricKey === 'temperature' ? <Thermometer size={24} style={{ color: 'var(--red)' }} /> :
               widget.metricKey === 'battery' ? <Battery size={24} style={{ color: 'var(--purple-dark)' }} /> : <Gauge size={24} />}
            </div>
          </div>
        );
      }
      case 'line': {
        const history = telemetryHistory[widget.deviceEUI || ''] || [];
        const formatted = [...history].reverse().map(h => ({
          time: format(new Date(h.receivedAt), 'HH:mm'),
          val: Number((h.decodedPayload as any)[widget.metricKey || 'flow']?.toFixed(1) ?? 0)
        }));

        const colorHex = widget.color === 'blue' ? '#185FA5' : 
                         widget.color === 'amber' ? '#BA7517' : 
                         widget.color === 'red' ? '#A32D2D' : 
                         widget.color === 'purple' ? '#8A3FFC' : '#1D9E75';

        return (
          <div style={{ width: '100%', height: 200, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colorHex} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={colorHex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [`${v} ${widget.metricUnit}`, widget.title]} />
                <Area type="monotone" dataKey="val" stroke={colorHex} fill={`url(#grad-${widget.id})`} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      }
      case 'bar': {
        const typeFilter = widget.metricKey === 'fillLevel' ? 'smartbin' : 'water_meter';
        const subset = widget.selectedDevices && widget.selectedDevices.length > 0
          ? filteredDevices.filter(d => widget.selectedDevices?.includes(d.devEUI))
          : filteredDevices.filter(d => d.deviceType === typeFilter);
        const data = subset.map(d => ({
          name: d.name.replace('Medidor ', '').replace('SmartBin ', ''),
          val: (d.lastTelemetry?.decodedPayload as any)?.[widget.metricKey || ''] ?? 0
        }));

        const colorHex = widget.color === 'blue' ? '#185FA5' : 
                         widget.color === 'teal' ? '#1D9E75' : 
                         widget.color === 'red' ? '#A32D2D' : 
                         widget.color === 'purple' ? '#8A3FFC' : '#BA7517';

        return (
          <div style={{ width: '100%', height: 200, marginTop: 12 }}>
            {data.length === 0 ? (
              <div className="text-muted" style={{ textAlign: 'center', padding: '40px 0', fontSize: 12 }}>
                No hay dispositivos seleccionados o disponibles.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, widget.metricKey === 'fillLevel' ? 100 : 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [`${v} ${widget.metricUnit}`, widget.title]} />
                  <Bar dataKey="val" fill={colorHex} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9 }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      }
      case 'map': {
        const targetDevices = widget.selectedDevices && widget.selectedDevices.length > 0
          ? filteredDevices.filter(d => widget.selectedDevices?.includes(d.devEUI))
          : filteredDevices;
        const devicesWithCoords = targetDevices.filter(d => d.lat && d.lng);
        const mapCenter: [number, number] = devicesWithCoords.length > 0 
          ? [devicesWithCoords[0].lat!, devicesWithCoords[0].lng!] 
          : [-0.1950, -78.4900];

        return (
          <div style={{ height: 220, width: '100%', borderRadius: 8, overflow: 'hidden', marginTop: 12, border: '0.5px solid var(--color-border)' }}>
            <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {devicesWithCoords.map(d => {
                const icon = mapIcons[d.deviceType] || mapIcons.general;
                const p = d.lastTelemetry?.decodedPayload as any;
                return (
                  <Marker key={d.id} position={[d.lat!, d.lng!]} icon={icon}>
                    <Popup>
                      <div style={{ fontSize: 11 }}>
                        <strong>{d.name}</strong>
                        <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>DevEUI: {d.devEUI}</div>
                        {p?.flow !== undefined && <div>Caudal: {p.flow.toFixed(1)} L/h</div>}
                        {p?.fillLevel !== undefined && <div>Llenado: {p.fillLevel}%</div>}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        );
      }
      case 'table': {
        const history = telemetryHistory[widget.deviceEUI || ''] || [];
        const resolvedCols = resolveTableColumns(widget.tableColumns, targetDevice?.deviceType);

        const renderCell = (col: TableColumnConfig, h: TelemetryRecord) => {
          const key = col.key;
          const payload = h.decodedPayload as Record<string, any>;
          switch (key) {
            case 'receivedAt':
              return format(new Date(h.receivedAt), 'dd/MM HH:mm:ss');
            case 'rssi':
              return `${h.rssi} dBm`;
            case 'snr':
              return `${h.snr} dB`;
            case 'fPort':
              return h.fPort;
            case 'fCnt':
              return h.fCnt;
            case 'devEUI':
              return h.devEUI;
            default:
              const val = payload?.[key];
              if (val === null || val === undefined) return '—';
              
              let unitSuffix = col.unit ? ` ${col.unit}` : '';
              if (!col.unit) {
                if (key === 'flow') unitSuffix = ' L/h';
                else if (key === 'level') unitSuffix = ' cm';
                else if (key === 'fillLevel') unitSuffix = ' %';
                else if (key === 'temperature') unitSuffix = ' °C';
                else if (key === 'battery') unitSuffix = ' %';
                else if (key === 'pressure') unitSuffix = ' bar';
                else if (key === 'totalConsumption') unitSuffix = ' m³';
              }
              
              return `${typeof val === 'number' ? val.toFixed(1) : String(val)}${unitSuffix}`;
          }
        };

        return (
          <div style={{ marginTop: 12, overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  {resolvedCols.map((col, idx) => (
                    <th key={`${col.key}-${idx}`} style={{ padding: '8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {col.label} {col.unit && col.key !== 'rssi' && col.key !== 'snr' ? `(${col.unit})` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={resolvedCols.length} style={{ textAlign: 'center', padding: '16px', color: 'var(--color-hint)' }}>
                      No hay telemetrías registradas
                    </td>
                  </tr>
                ) : (
                  history.slice(0, 10).map((h, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                      {resolvedCols.map((col, idx) => (
                        <td 
                          key={`${col.key}-${idx}`} 
                          style={{ 
                            padding: '8px', 
                            whiteSpace: col.key === 'receivedAt' ? 'nowrap' : 'normal',
                            fontFamily: (col.key === 'rssi' || col.key === 'snr' || col.key === 'fPort' || col.key === 'fCnt' || col.key === 'devEUI') ? 'monospace' : 'inherit',
                            color: col.key === 'receivedAt' ? 'var(--color-text)' : 'inherit'
                          }}
                        >
                          {renderCell(col, h)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <div>Widget desconocido</div>;
    }
  };

  return (
    <div className="page">
      
      {/* VISTA 1: CATALOGO CENTRAL DE FILAS GRANDES */}
      {activeTab === 'list' && (
        <div className="dashboards-container">
          
          <div className="page-header" style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 24, fontWeight: 700 }}>Mis Dashboards</h2>
              <p className="page-subtitle">Selecciona, edita o crea tus tableros de control personalizados.</p>
            </div>
            <button 
              className="btn-primary" 
              onClick={() => setIsCreateModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}
            >
              <Plus size={16} />
              <span>Crear Dashboard</span>
            </button>
          </div>

          {/* Listado de dashboards en Filas Grandes adaptables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredDashboards.map((dash) => (
              <div key={dash.id} className="dash-row-wrapper">
                {/* Lado izquierdo/Centro: Fila Grande y Bella Clickable para Entrar */}
                <div 
                  onClick={() => { setActiveTab(dash.id); setIsEditing(false); }}
                  className="dash-row-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      background: 'var(--teal-bg)',
                      color: 'var(--teal-dark)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                      flexShrink: 0
                    }}>
                      {renderDashboardIcon(dash.icon, 26)}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                        {dash.name}
                      </h3>
                      <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{dash.widgets.length} {dash.widgets.length === 1 ? 'panel configurado' : 'paneles configurados'}</span>
                        {dash.isPreset && (
                          <span 
                            style={{ 
                              fontSize: 10, 
                              fontWeight: 550,
                              padding: '2px 8px', 
                              borderRadius: 6,
                              background: 'var(--teal-bg)', 
                              color: 'var(--teal-dark)'
                            }}
                          >
                            Plantilla Preconfigurada
                          </span>
                        )}
                        {user?.role === 'superadmin' && (
                          <span 
                            style={{ 
                              fontSize: 10, 
                              fontWeight: 550,
                              padding: '2px 8px', 
                              borderRadius: 6,
                              background: 'var(--color-bg-secondary)', 
                              color: '#854F0B'
                            }}
                          >
                            Cliente: {clients.find(c => c.id === (dash.organizationId || 'org1'))?.name || 'Empresa Demo S.A.'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {/* Flecha indicativa de entrada al lado derecho de la tarjeta */}
                  <div style={{ color: 'var(--color-hint)', transition: 'transform 0.2s' }} className="enter-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                </div>

                {/* Lado derecho: Botón de Editar y Borrar "alado" (Fuera del elemento clickable) */}
                <div className="dash-row-actions">
                  <button 
                    onClick={() => setEditingDashboard(dash)}
                    className="dash-action-btn edit"
                    title="Editar nombre e icono"
                  >
                    <Settings size={20} />
                  </button>
                  
                  <button 
                    onClick={() => handleDeleteDashboard(dash.id)}
                    className="dash-action-btn delete"
                    title="Eliminar Dashboard"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISTA 2: LIENZO DEL DASHBOARD SELECCIONADO */}
      {activeTab !== 'list' && activeDashboard && (
        <div>
          {/* Cabecera del Lienzo con Botón de Regresar */}
          <div className="page-header" style={{ marginBottom: 24, borderBottom: '0.5px solid var(--color-border)', paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button 
                className="btn-secondary" 
                onClick={() => { setActiveTab('list'); setIsEditing(false); }}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                title="Volver a la lista de dashboards"
              >
                <ArrowLeft size={16} />
                <span>Volver</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--teal-bg)',
                  color: 'var(--teal-dark)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {renderDashboardIcon(activeDashboard.icon, 18)}
                </div>
                <div>
                  <h2 className="page-title" style={{ fontSize: 18, margin: 0 }}>{activeDashboard.name}</h2>
                  <p className="page-subtitle" style={{ margin: 0, marginTop: 2 }}>Visualización activa · {activeDashboard.widgets.length} paneles</p>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button 
                className={`btn-secondary ${isEditing ? 'active' : ''}`}
                onClick={() => setIsEditing(!isEditing)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Settings size={16} />
                <span>{isEditing ? 'Bloquear Edición' : 'Editar Tablero'}</span>
              </button>

              <button 
                className="btn-primary" 
                onClick={handleOpenAddDrawer}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={16} />
                <span>Agregar Panel</span>
              </button>
            </div>
          </div>

          {/* Lienzo del Dashboard */}
          <div>
            {activeDashboard.widgets.length === 0 && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center', borderStyle: 'dashed', borderWidth: '2px', borderColor: 'var(--color-border)', margin: '0 auto', maxWidth: 600 }}>
                <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: '50%', color: 'var(--color-muted)', marginBottom: 16 }}>
                  <Cpu size={36} className="text-teal-500" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>Dashboard en Blanco</h3>
                <p className="text-muted" style={{ fontSize: 13, maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.5 }}>
                  Este tablero está vacío. Presiona el botón de abajo para empezar a agregar tus paneles de control personalizados.
                </p>
                <button 
                  className="btn-primary" 
                  onClick={handleOpenAddDrawer}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} /> <span>Agregar Panel</span>
                </button>
              </div>
            )}

            {activeDashboard.widgets.length > 0 && (
              <div className="dashboard-grid-resizable" style={{ gap: '20px' }}>
                {activeDashboard.widgets.map((widget) => {
                  // Calcular el span de columna en la cuadrícula de 12
                  const getColSpan = () => {
                    const w = widget.width || 'half';
                    if (w === 'third') return 'span 4';
                    if (w === 'two-thirds') return 'span 8';
                    if (w === 'full') return 'span 12';
                    return 'span 6'; // default
                  };

                  return (
                    <div 
                      key={widget.id} 
                      className="card animate-fade-in" 
                      style={{ 
                        gridColumn: getColSpan(),
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: widget.type === 'kpi' ? 'auto' : '300px',
                        overflow: 'hidden',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: widget.type === 'kpi' ? 'none' : '1px solid var(--color-border)', paddingBottom: widget.type === 'kpi' ? 0 : 12, marginBottom: widget.type === 'kpi' ? 4 : 12 }}>
                        <div>
                          <h3 className="card-title" style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {widget.icon ? (
                              <span style={{ color: `var(--${widget.color || 'teal'})`, display: 'inline-flex', alignItems: 'center' }}>
                                {renderDashboardIcon(widget.icon, 16)}
                              </span>
                            ) : (
                              widget.type === 'kpi' && <span className={`status-dot online`} style={{ background: widget.color === 'teal' ? 'var(--teal)' : widget.color === 'blue' ? 'var(--blue)' : widget.color === 'amber' ? 'var(--amber)' : widget.color === 'red' ? 'var(--red)' : 'var(--purple)' }} />
                            )}
                            <span>{widget.title}</span>
                          </h3>
                        </div>
                        {isEditing && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              className="btn-secondary animate-pulse" 
                              onClick={() => handleOpenEditDrawer(widget)}
                              style={{ padding: 4, minWidth: 26, height: 26, background: 'var(--teal-bg)', color: 'var(--teal-dark)', borderColor: 'var(--teal)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Editar Panel"
                            >
                              <Settings size={13} style={{ display: 'block' }} />
                            </button>
                            <button 
                              className="btn-secondary animate-pulse" 
                              onClick={() => handleDeleteWidget(widget.id)}
                              style={{ padding: 4, minWidth: 26, height: 26, background: '#FCEBEB', color: 'var(--red)', borderColor: '#F5C2C0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Eliminar Panel"
                            >
                              <Trash size={13} style={{ display: 'block' }} />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: isEditing ? 8 : 0 }}>
                        {renderWidgetContent(widget)}
                      </div>

                      {/* Barra de redimensionamiento premium inline cuando el modo edición está activo */}
                      {isEditing && (
                        <div className="widget-edit-toolbar" style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'var(--color-bg-secondary)',
                          borderTop: '1px solid var(--color-border)',
                          fontSize: '11px',
                          gap: '6px',
                          marginTop: 'auto'
                        }}>
                          <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>Ajustar Ancho:</span>
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {(['third', 'half', 'two-thirds', 'full'] as const).map((wSize) => (
                              <button
                                key={wSize}
                                onClick={() => handleResizeWidget(widget.id, wSize)}
                                className={`btn-secondary ${widget.width === wSize || (!widget.width && wSize === 'half') ? 'active' : ''}`}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '10px',
                                  minWidth: 'auto',
                                  height: '24px',
                                  background: (widget.width === wSize || (!widget.width && wSize === 'half')) ? 'var(--teal-bg)' : 'transparent',
                                  borderColor: (widget.width === wSize || (!widget.width && wSize === 'half')) ? 'var(--teal)' : 'var(--color-border)',
                                  color: (widget.width === wSize || (!widget.width && wSize === 'half')) ? 'var(--teal-dark)' : 'var(--color-text)',
                                  borderRadius: '4px'
                                }}
                              >
                                {wSize === 'third' ? '1/3' : wSize === 'half' ? '1/2' : wSize === 'two-thirds' ? '2/3' : '100%'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {isEditing && (
                  <div 
                    onClick={handleOpenAddDrawer}
                    className="card" 
                    style={{ 
                      gridColumn: 'span 4',
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      borderStyle: 'dashed', 
                      borderWidth: '2px', 
                      borderColor: 'var(--teal)',
                      cursor: 'pointer',
                      minHeight: '180px',
                      transition: 'all 0.2s',
                      background: 'var(--color-surface)',
                      borderRadius: '12px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--teal-dark)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <Plus size={24} className="text-teal-500" style={{ marginBottom: 6 }} />
                    <span style={{ fontSize: 13, fontWeight: 550, color: 'var(--teal)' }}>+ Agregar Panel</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE: CREAR DASHBOARD */}
      {isCreateModalOpen && (
        <div className="slide-over-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Crear Nuevo Dashboard</h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Ingresa los detalles básicos para inicializar tu nuevo lienzo de analítica.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>
            
            <div className="drawer-body">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Nombre del Dashboard *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej. Consumo Sector Sur, Planta Purificadora" 
                  value={newDashName} 
                  onChange={(e) => setNewDashName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Plantilla de Inicio (Preset)</label>
                <select 
                  className="form-input" 
                  value={newDashPreset} 
                  onChange={(e: any) => {
                    setNewDashPreset(e.target.value);
                    if (e.target.value === 'water_meters') setNewDashIcon('Droplets');
                    else if (e.target.value === 'smartbins') setNewDashIcon('Trash2');
                  }}
                >
                  <option value="blank">Lienzo en Blanco (Empezar de cero)</option>
                  <option value="water_meters">Medidores de Agua (KPIs + Caudales preconfigurados)</option>
                  <option value="smartbins">SmartBins (Llenado + Baterías preconfigurados)</option>
                </select>
              </div>

              {user?.role === 'superadmin' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Asociar a Cliente (Tenant)</label>
                  <select 
                    className="form-input" 
                    value={newDashOrgId} 
                    onChange={(e) => setNewDashOrgId(e.target.value)}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Icono del Dashboard</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {['LayoutDashboard', 'Droplets', 'Trash2', 'Cpu', 'Gauge', 'Map', 'Thermometer', 'Battery', 'Wind', 'Activity'].map((icName) => (
                    <button
                      key={icName}
                      onClick={() => setNewDashIcon(icName)}
                      className={`btn-secondary ${newDashIcon === icName ? 'active' : ''}`}
                      style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: newDashIcon === icName ? 'var(--teal-bg)' : 'transparent', borderColor: newDashIcon === icName ? 'var(--teal)' : 'var(--color-border)', borderRadius: 6, cursor: 'pointer', height: '42px' }}
                    >
                      {renderDashboardIcon(icName, 18)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCreateDashboard} disabled={!newDashName.trim()}>Crear Dashboard</button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE: EDITAR DASHBOARD */}
      {editingDashboard && (
        <div className="slide-over-overlay" onClick={() => setEditingDashboard(null)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Editar Dashboard</h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Modifica las propiedades básicas de este tablero de analítica.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setEditingDashboard(null)} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>
            
            <div className="drawer-body">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Nombre del Dashboard *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Nombre del Dashboard" 
                  value={editDashName} 
                  onChange={(e) => setEditDashName(e.target.value)}
                />
              </div>

              {user?.role === 'superadmin' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Reasignar a Cliente (Tenant)</label>
                  <select 
                    className="form-input" 
                    value={editDashOrgId} 
                    onChange={(e) => setEditDashOrgId(e.target.value)}
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Icono del Dashboard</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {['LayoutDashboard', 'Droplets', 'Trash2', 'Cpu', 'Gauge', 'Map', 'Thermometer', 'Battery', 'Wind', 'Activity'].map((icName) => (
                    <button
                      key={icName}
                      onClick={() => setEditDashIcon(icName)}
                      className={`btn-secondary ${editDashIcon === icName ? 'active' : ''}`}
                      style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: editDashIcon === icName ? 'var(--teal-bg)' : 'transparent', borderColor: editDashIcon === icName ? 'var(--teal)' : 'var(--color-border)', borderRadius: 6, cursor: 'pointer', height: '42px' }}
                    >
                      {renderDashboardIcon(icName, 18)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setEditingDashboard(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleUpdateDashboard} disabled={!editDashName.trim()}>Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE LATERAL: AGREGAR O EDITAR PANEL */}
      {drawerMode !== null && (
        <div className="slide-over-overlay" onClick={() => { setDrawerMode(null); setEditingWidget(null); }}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            
            {/* Cabecera del Drawer */}
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  {drawerMode === 'add' ? 'Configurar Nuevo Panel' : 'Editar Panel'}
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  {drawerMode === 'add' ? 'Elige la visualización, personaliza su diseño y vincula tus sensores.' : 'Modifica la visualización y cambia los dispositivos asociados.'}
                </p>
              </div>
              <button 
                className="btn-secondary" 
                onClick={() => { setDrawerMode(null); setEditingWidget(null); }}
                style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo del Drawer */}
            <div className="drawer-body">
              
              {/* 1. SELECCIÓN DE TIPO DE VISUALIZACIÓN */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 650, color: 'var(--color-text)', marginBottom: '8px', display: 'block' }}>
                  1. Tipo de Visualización *
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                  gap: '10px'
                }}>
                  {[
                    {
                      value: 'kpi',
                      label: 'Tarjeta KPI',
                      desc: 'Métrica simple',
                      preview: (
                        <div style={{ padding: '4px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 750, color: 'var(--teal-dark)' }}>32.5 <span style={{ fontSize: '8px' }}>L/h</span></span>
                          <div style={{ width: '80%', height: '3px', background: 'var(--teal)', borderRadius: '1px', marginTop: '2px' }}></div>
                        </div>
                      )
                    },
                    {
                      value: 'line',
                      label: 'Línea / Área',
                      desc: 'Histórico 24h',
                      preview: (
                        <div style={{ padding: '4px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '2px', height: '24px' }}>
                          <svg width="60" height="18" viewBox="0 0 60 18" fill="none" style={{ overflow: 'visible' }}>
                            <path d="M 0,16 Q 15,2 30,12 T 60,4" stroke="var(--blue-dark)" strokeWidth="1.5" fill="none" />
                            <path d="M 0,16 Q 15,2 30,12 T 60,4 L 60,18 L 0,18 Z" fill="var(--blue-bg)" opacity="0.25" />
                          </svg>
                        </div>
                      )
                    },
                    {
                      value: 'bar',
                      label: 'Barras',
                      desc: 'Comparativa',
                      preview: (
                        <div style={{ padding: '4px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '3px', height: '24px', marginTop: '2px' }}>
                          <div style={{ width: '6px', height: '10px', background: 'var(--amber)', borderRadius: '1px' }}></div>
                          <div style={{ width: '6px', height: '18px', background: 'var(--amber-dark)', borderRadius: '1px' }}></div>
                          <div style={{ width: '6px', height: '14px', background: 'var(--amber)', borderRadius: '1px' }}></div>
                        </div>
                      )
                    },
                    {
                      value: 'map',
                      label: 'Mapa Satelital',
                      desc: 'Geoposición GPS',
                      preview: (
                        <div style={{ padding: '4px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', height: '24px', overflow: 'hidden', marginTop: '2px' }}>
                          <div style={{ width: '100%', height: '100%', background: '#e0f2f1', position: 'absolute', opacity: 0.4 }}></div>
                          <span style={{ fontSize: '10px', zIndex: 1 }}>📍 Pin GPS</span>
                        </div>
                      )
                    },
                    {
                      value: 'table',
                      label: 'Tabla Bitácora',
                      desc: 'Telemetrías raw',
                      preview: (
                        <div style={{ padding: '3px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '6px', fontFamily: 'monospace', marginTop: '2px' }}>
                          <div style={{ borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                            <span>Hora</span><span>Val</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>14:32</span><span style={{ color: 'green' }}>25.1</span>
                          </div>
                        </div>
                      )
                    }
                  ].map((item) => (
                    <div
                      key={item.value}
                      onClick={() => {
                        setNewWidgetType(item.value as any);
                        if (item.value === 'map') {
                          setNewWidgetTitle(editingWidget ? newWidgetTitle : 'Mapa de Dispositivos');
                          setNewWidgetWidth('full');
                          setNewWidgetIcon('Map');
                        } else if (item.value === 'table') {
                          setNewWidgetTitle(editingWidget ? newWidgetTitle : 'Bitácora de Mediciones');
                          setNewWidgetWidth('full');
                          setNewWidgetIcon('Database');
                        } else if (item.value === 'bar') {
                          setNewWidgetTitle(editingWidget ? newWidgetTitle : 'Comparativo de Dispositivos');
                          setNewWidgetMetric('fillLevel');
                          setNewWidgetUnit('%');
                          setNewWidgetWidth('full');
                          setNewWidgetIcon('BarChart3');
                        } else if (item.value === 'line') {
                          setNewWidgetTitle(editingWidget ? newWidgetTitle : 'Historial de Medición');
                          setNewWidgetIcon('LineChart');
                          setNewWidgetWidth('full');
                        } else {
                          setNewWidgetTitle(editingWidget ? newWidgetTitle : '');
                          setNewWidgetIcon('Gauge');
                          setNewWidgetWidth('half');
                        }
                      }}
                      className={`visual-type-card ${newWidgetType === item.value ? 'active' : ''}`}
                      style={{
                        border: newWidgetType === item.value ? '2px solid var(--teal)' : '1px solid var(--color-border)',
                        borderRadius: '10px',
                        padding: '10px 8px',
                        cursor: 'pointer',
                        background: newWidgetType === item.value ? 'var(--teal-bg)' : 'var(--color-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: newWidgetType === item.value ? '0 4px 10px rgba(29,158,117,0.08)' : 'none'
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 650, color: newWidgetType === item.value ? 'var(--teal-dark)' : 'var(--color-text)' }}>
                        {item.label}
                      </span>
                      {item.preview}
                      <span style={{ fontSize: '9px', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {item.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. TÍTULO E ICONO PERSONALIZADO */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>2. Título del Panel *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej. Caudal Zona Norte, Sensor Llenado..." 
                    value={newWidgetTitle} 
                    onChange={(e) => setNewWidgetTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Icono Visual</label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: '4px'
                  }}>
                    {[
                      'Gauge', 'Droplets', 'Trash2', 'Thermometer', 'Battery', 'Activity',
                      'Wind', 'Zap', 'Lightbulb', 'Map', 'Database', 'Waves'
                    ].map((icName) => (
                      <button
                        key={icName}
                        type="button"
                        onClick={() => setNewWidgetIcon(icName)}
                        className={`btn-secondary ${newWidgetIcon === icName ? 'active' : ''}`}
                        style={{
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: newWidgetIcon === icName ? 'var(--teal-bg)' : 'transparent',
                          borderColor: newWidgetIcon === icName ? 'var(--teal)' : 'var(--color-border)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          height: '38px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ color: newWidgetIcon === icName ? 'var(--teal-dark)' : 'var(--color-text)', display: 'inline-flex' }}>
                          {renderDashboardIcon(icName, 15)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. SELECCIÓN DE DISPOSITIVO (KPI, LÍNEA, TABLA) */}
              {newWidgetType !== 'bar' && newWidgetType !== 'map' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>3. Dispositivo IoT de Origen *</label>
                  <select 
                    className="form-input" 
                    value={newWidgetDevice} 
                    onChange={(e) => {
                      setNewWidgetDevice(e.target.value);
                      const dev = devices.find(d => d.devEUI === e.target.value);
                      if (dev) {
                        if (dev.deviceType === 'water_meter') {
                          setNewWidgetMetric('flow');
                          setNewWidgetUnit('L/h');
                          setNewWidgetColor('teal');
                        } else {
                          setNewWidgetMetric('fillLevel');
                          setNewWidgetUnit('%');
                          setNewWidgetColor('amber');
                        }
                      }
                    }}
                  >
                    <option value="">Selecciona un dispositivo...</option>
                    {filteredDevices.map(d => (
                      <option key={d.devEUI} value={d.devEUI}>
                        {d.name} ({d.deviceType === 'water_meter' ? '💧 Medidor' : '🗑️ SmartBin'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 4. SELECCIÓN DE COLUMNAS DE LA TABLA (SOLO TIPO TABLA) */}
              {newWidgetType === 'table' && (() => {
                const selectedDeviceTelemetry = telemetryHistory[newWidgetDevice] || [];
                const latestTelemetry = selectedDeviceTelemetry[0];
                const detectedParams = latestTelemetry && latestTelemetry.decodedPayload
                  ? Object.keys(latestTelemetry.decodedPayload)
                  : [];

                return (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="form-label" style={{ fontWeight: 650, margin: 0 }}>
                        4. Columnas de la Tabla a Mostrar *
                      </label>
                    </div>
                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--color-muted)', lineHeight: '1.4' }}>
                      Gestiona, reordena y agrega las columnas dinámicas que deseas visualizar en la bitácora de este panel.
                    </p>

                    {/* Lista de columnas activas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      {newWidgetTableColumns.length === 0 ? (
                        <div style={{ padding: '12px', border: '1px dashed var(--color-border)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: 'var(--color-muted)' }}>
                          No hay columnas configuradas. Agrega una o carga un preset.
                        </div>
                      ) : (
                        newWidgetTableColumns.map((col, index) => (
                          <div 
                            key={`${col.key}-${index}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              fontSize: '13px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{col.label}</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-muted)', background: 'var(--color-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                                {col.key}
                              </span>
                              {col.unit && (
                                <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 500, background: 'var(--teal-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                                  {col.unit}
                                </span>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => {
                                  const updated = [...newWidgetTableColumns];
                                  const temp = updated[index];
                                  updated[index] = updated[index - 1];
                                  updated[index - 1] = temp;
                                  setNewWidgetTableColumns(updated);
                                }}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: index === 0 ? 'var(--color-border)' : 'var(--color-muted)',
                                  cursor: index === 0 ? 'default' : 'pointer',
                                  fontWeight: 'bold'
                                }}
                                title="Mover arriba"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={index === newWidgetTableColumns.length - 1}
                                onClick={() => {
                                  const updated = [...newWidgetTableColumns];
                                  const temp = updated[index];
                                  updated[index] = updated[index + 1];
                                  updated[index + 1] = temp;
                                  setNewWidgetTableColumns(updated);
                                }}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: index === newWidgetTableColumns.length - 1 ? 'var(--color-border)' : 'var(--color-muted)',
                                  cursor: index === newWidgetTableColumns.length - 1 ? 'default' : 'pointer',
                                  fontWeight: 'bold'
                                }}
                                title="Mover abajo"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewWidgetTableColumns(newWidgetTableColumns.filter((_, i) => i !== index));
                                }}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--color-red, #dc3545)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginLeft: '4px'
                                }}
                                title="Eliminar columna"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Formulario para agregar columna */}
                    {!showAddColForm ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setShowAddColForm(true);
                          setTempColLabel('');
                          setTempColKey(detectedParams.length > 0 ? detectedParams[0] : 'receivedAt');
                          setTempColCustomKey('');
                          setTempColUnit('');
                        }}
                        style={{
                          width: '100%',
                          border: '1.5px dashed var(--color-border)',
                          background: 'transparent',
                          borderRadius: '8px',
                          padding: '10px',
                          color: 'var(--teal)',
                          fontWeight: 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          minHeight: '38px'
                        }}
                      >
                        <Plus size={15} /> Agregar Columna Personalizada
                      </button>
                    ) : (
                      <div style={{
                        padding: '12px',
                        border: '1px dashed var(--teal)',
                        borderRadius: '8px',
                        background: 'rgba(29, 158, 117, 0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        animation: 'fadeIn 0.2s ease'
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--teal)', borderBottom: '1px solid rgba(29, 158, 117, 0.15)', paddingBottom: '4px', marginBottom: '2px' }}>
                          Nueva Columna de Bitácora
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: '11px', marginBottom: '3px', fontWeight: 600 }}>Nombre / Etiqueta *</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Ej. Nivel, Caudal"
                              value={tempColLabel}
                              onChange={(e) => setTempColLabel(e.target.value)}
                              style={{ fontSize: '12px', padding: '6px 10px', minHeight: '36px' }}
                            />
                          </div>

                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: '11px', marginBottom: '3px', fontWeight: 600 }}>Unidad (Opcional)</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Ej. L/min, °C, %"
                              value={tempColUnit}
                              onChange={(e) => setTempColUnit(e.target.value)}
                              style={{ fontSize: '12px', padding: '6px 10px', minHeight: '36px' }}
                            />
                          </div>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', marginBottom: '3px', fontWeight: 600 }}>Parámetro del Dispositivo *</label>
                          <select
                            className="form-input"
                            value={tempColKey}
                            onChange={(e) => setTempColKey(e.target.value)}
                            style={{ fontSize: '12px', padding: '6px 10px', minHeight: '36px', backgroundPosition: 'calc(100% - 10px) 50%' }}
                          >
                            {/* Sección 1: Parámetros autodetectados */}
                            {detectedParams.length > 0 && (
                              <optgroup label={`Parámetros detectados en ${devices.find(d => d.devEUI === newWidgetDevice)?.name || 'sensor'}`}>
                                {detectedParams.map(param => (
                                  <option key={param} value={param}>{param}</option>
                                ))}
                              </optgroup>
                            )}

                            {/* Sección 2: Comunes */}
                            <optgroup label="Parámetros Comunes de Telemetría">
                              <option value="flow">flow (Caudal)</option>
                              <option value="level">level (Nivel)</option>
                              <option value="fillLevel">fillLevel (Llenado)</option>
                              <option value="temperature">temperature (Temperatura)</option>
                              <option value="battery">battery (Batería)</option>
                              <option value="pressure">pressure (Presión)</option>
                              <option value="totalConsumption">totalConsumption (Consumo)</option>
                              <option value="vibration">vibration (Vibración)</option>
                              <option value="humidity">humidity (Humedad)</option>
                              <option value="status">status (Estado)</option>
                            </optgroup>

                            {/* Sección 3: Sistema */}
                            <optgroup label="Campos del Sistema (Red)">
                              <option value="receivedAt">receivedAt (Fecha y Hora)</option>
                              <option value="rssi">rssi (Señal RSSI)</option>
                              <option value="snr">snr (Ruido SNR)</option>
                              <option value="fPort">fPort (Puerto LoRa)</option>
                              <option value="fCnt">fCnt (Contador de Tramas)</option>
                              <option value="devEUI">devEUI (EUI Dispositivo)</option>
                            </optgroup>

                            {/* Campo de escritura manual */}
                            <optgroup label="Otro">
                              <option value="custom_manual">Escribir parámetro personalizado...</option>
                            </optgroup>
                          </select>
                        </div>

                        {tempColKey === 'custom_manual' && (
                          <div className="form-group" style={{ margin: 0, animation: 'fadeIn 0.15s ease' }}>
                            <label className="form-label" style={{ fontSize: '11px', marginBottom: '3px', fontWeight: 600 }}>Escribe el parámetro exacto *</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Ej. tension_red, ph_valor"
                              value={tempColCustomKey}
                              onChange={(e) => setTempColCustomKey(e.target.value)}
                              style={{ fontSize: '12px', padding: '6px 10px', minHeight: '36px' }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setShowAddColForm(false)}
                            style={{ padding: '4px 10px', fontSize: '12px', minHeight: '32px', height: '32px', minWidth: 'auto' }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => {
                              const finalKey = tempColKey === 'custom_manual' ? tempColCustomKey.trim() : tempColKey;
                              if (!tempColLabel.trim()) {
                                alert('Escribe el nombre/etiqueta de la columna.');
                                return;
                              }
                              if (!finalKey) {
                                alert('Selecciona o escribe el parámetro del dispositivo.');
                                return;
                              }
                              
                              const newCol: TableColumnConfig = {
                                key: finalKey,
                                label: tempColLabel.trim(),
                                unit: tempColUnit.trim() || undefined
                              };

                              setNewWidgetTableColumns([...newWidgetTableColumns, newCol]);
                              
                              setTempColLabel('');
                              setTempColCustomKey('');
                              setTempColUnit('');
                              setShowAddColForm(false);
                            }}
                            style={{ padding: '4px 12px', fontSize: '12px', minHeight: '32px', height: '32px', background: 'var(--teal)', color: 'white', minWidth: 'auto' }}
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Botones de presets rápidos */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const defaultWater = resolveTableColumns(undefined, 'water_meter');
                          setNewWidgetTableColumns(defaultWater);
                        }}
                        style={{ padding: '2px 8px', fontSize: '11px', height: '24px', minWidth: 'auto', flex: 1 }}
                      >
                        Preset Medidor💧
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const defaultBin = resolveTableColumns(undefined, 'smartbin');
                          setNewWidgetTableColumns(defaultBin);
                        }}
                        style={{ padding: '2px 8px', fontSize: '11px', height: '24px', minWidth: 'auto', flex: 1 }}
                      >
                        Preset SmartBin🗑️
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setNewWidgetTableColumns([])}
                        style={{ padding: '2px 4px', fontSize: '11px', height: '24px', minWidth: 'auto', flex: 0.5 }}
                      >
                        Limpiar🧹
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 4. SELECCIÓN DE DISPOSITIVOS MULTIPLE (MAPA O BARRAS) */}
              {(newWidgetType === 'map' || newWidgetType === 'bar') && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                      3. Dispositivos IoT a Mostrar *
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setNewWidgetSelectedDevices(filteredDevices.map(d => d.devEUI))}
                        style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setNewWidgetSelectedDevices([])}
                        style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--color-muted)' }}>
                    Marca los dispositivos que quieras ver. Si no seleccionas ninguno, se mostrarán todos por defecto.
                  </p>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    padding: '8px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    background: 'var(--color-bg)'
                  }}>
                    {filteredDevices.map((d) => {
                      const isSelected = newWidgetSelectedDevices.includes(d.devEUI);
                      return (
                        <div
                          key={d.devEUI}
                          className={`device-select-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              setNewWidgetSelectedDevices(newWidgetSelectedDevices.filter(id => id !== d.devEUI));
                            } else {
                              setNewWidgetSelectedDevices([...newWidgetSelectedDevices, d.devEUI]);
                            }
                          }}
                          style={{
                            padding: '8px 10px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            userSelect: 'none'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{ cursor: 'pointer', accentColor: 'var(--teal)' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontWeight: 550, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {d.name}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--color-hint)', fontFamily: 'monospace' }}>
                              {d.devEUI}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {filteredDevices.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-hint)', fontSize: '12px', gridColumn: '1 / -1' }}>
                        No hay dispositivos registrados para este cliente.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. MÉTRICAS Y UNIDADES (KPI, LÍNEA, BARRAS) */}
              {(newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Métrica de Telemetría</label>
                    <select 
                      className="form-input" 
                      value={newWidgetMetric} 
                      onChange={(e) => {
                        setNewWidgetMetric(e.target.value);
                        if (e.target.value === 'flow') setNewWidgetUnit('L/h');
                        else if (e.target.value === 'fillLevel') setNewWidgetUnit('%');
                        else if (e.target.value === 'temperature') setNewWidgetUnit('°C');
                        else if (e.target.value === 'level') setNewWidgetUnit('cm');
                        else if (e.target.value === 'battery') setNewWidgetUnit('%');
                      }}
                    >
                      <option value="flow">💧 Caudal en Tiempo Real (flow)</option>
                      <option value="level">🌊 Nivel de Agua (level)</option>
                      <option value="fillLevel">🗑️ Porcentaje de Llenado (fillLevel)</option>
                      <option value="temperature">🌡️ Temperatura Sensor (temperature)</option>
                      <option value="battery">🔋 Nivel de Batería (battery)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Unidad de Medida</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Ej. L/h, %, °C, cm" 
                      value={newWidgetUnit} 
                      onChange={(e) => setNewWidgetUnit(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 6. ANCHO DE GRID Y COLOR TEMÁTICO */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Ancho en Cuadrícula</label>
                  <select 
                    className="form-input" 
                    value={newWidgetWidth} 
                    onChange={(e: any) => setNewWidgetWidth(e.target.value)}
                    disabled={newWidgetType === 'map' || newWidgetType === 'table'}
                  >
                    <option value="third">1/3 Ancho (Pequeño)</option>
                    <option value="half">1/2 Ancho (Mediano)</option>
                    <option value="two-thirds">2/3 Ancho (Grande)</option>
                    <option value="full">100% Ancho (Fila Completa)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Color de Acento</label>
                  <select 
                    className="form-input" 
                    value={newWidgetColor} 
                    onChange={(e: any) => setNewWidgetColor(e.target.value)}
                  >
                    <option value="teal">🟢 Verde Esmeralda (Teal)</option>
                    <option value="blue">🔵 Azul Océano (Blue)</option>
                    <option value="amber">🟠 Naranja Ámbar (Amber)</option>
                    <option value="purple">🟣 Púrpura Profundo (Purple)</option>
                    <option value="red">🔴 Rojo Alerta (Red)</option>
                    <option value="gray">⚫ Gris Neutro (Gray)</option>
                  </select>
                </div>
              </div>

            </div>

            {/* Pie del Drawer con Acciones */}
            <div className="drawer-footer">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => { setDrawerMode(null); setEditingWidget(null); }}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleSaveWidget} 
                disabled={!newWidgetTitle.trim() || (newWidgetType !== 'bar' && newWidgetType !== 'map' && !newWidgetDevice)}
                style={{ 
                  opacity: (!newWidgetTitle.trim() || (newWidgetType !== 'bar' && newWidgetType !== 'map' && !newWidgetDevice)) ? 0.6 : 1,
                  cursor: (!newWidgetTitle.trim() || (newWidgetType !== 'bar' && newWidgetType !== 'map' && !newWidgetDevice)) ? 'not-allowed' : 'pointer'
                }}
              >
                {drawerMode === 'add' ? 'Agregar Panel' : 'Guardar Cambios'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
