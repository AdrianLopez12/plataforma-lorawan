import React, { useState, useEffect } from 'react';
import {
  Droplets, Trash2, Plus, Settings,
  Trash, Cpu, Gauge, Map as MapIcon, Thermometer,
  Battery, Wind, X, LayoutDashboard, Activity, ArrowLeft,
  Zap, Lightbulb, Database, Waves, LineChart as LineChartIcon, BarChart3,
  RefreshCw, Shield, Calendar, ChevronLeft, ChevronRight, MapPin
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getDevices, getDeviceTelemetry } from '../services/api';
import type { Device, TelemetryRecord, CustomDashboard, DashboardWidget, TableColumnConfig, DeviceGroup } from '../types';
import { format } from 'date-fns';
import { generateTelemetryHistory } from '../services/mockData';
import { useAuth } from '../context/AuthContext';
import { evaluateTelemetry } from '../services/alertsEngine';

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
    html: `<div style="width:28px;height:28px;background:#185FA5;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
    </div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  }),
  smartbin: L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#854F0B;border-radius:6px;border:2.5px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    </div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  }),
  general: L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#1D9E75;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
    </div>`,
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

class WidgetErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Widget Error Captured:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: 'var(--color-muted)' }}>
          <div style={{ background: '#FCEBEB', color: 'var(--red)', padding: '8px', borderRadius: '50%', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Error al cargar panel</span>
          <span style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>Hubo un problema al renderizar este panel.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DashboardPage() {
  const { user, clients } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  
  // Dashboard states
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Reloj dinámico de 10 segundos para actualizar las consultas de telemetría en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Carga robusta de dashboards sin siembra automática
  useEffect(() => {
    const saved = localStorage.getItem('custom_dashboards');
    let loadedDashboards: CustomDashboard[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          loadedDashboards = parsed.map((d: any) => ({
            ...d,
            widgets: d.widgets || []
          }));
        }
      } catch (e) {
        console.error('Error parseando dashboards de localStorage', e);
      }
    }
    setDashboards(loadedDashboards);
  }, [user, clients]);
  
  // activeTab es 'list' por defecto para mostrar la consola central de grandes filas
  const [activeTab, setActiveTab] = useState<string>('list');
  const [isEditing, setIsEditing] = useState(false);
  
  // Drag & Resize states for custom dashboard grid
  const [tempResizing, setTempResizing] = useState<{ id: string; gridCols: number; heightPx: number } | null>(null);
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  
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
  const [newWidgetHeight, setNewWidgetHeight] = useState<'short' | 'medium' | 'tall' | 'extra-tall'>('medium');
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

  // Filtrado temporal dinámico
  const [timeFilter, setTimeFilter] = useState<'2h' | '4h' | '24h' | 'custom'>('24h');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date());
  const [calendarHoverDate, setCalendarHoverDate] = useState<Date | null>(null);
  const [calendarSelectStep, setCalendarSelectStep] = useState<'start' | 'end'>('start');

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const formatDateLabel = (isoString: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return isoString;
    }
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const isWithinRange = (date: Date) => {
    if (!customStart || !customEnd) return false;
    const t = new Date(date).setHours(0,0,0,0);
    const start = new Date(customStart).setHours(0,0,0,0);
    const end = new Date(customEnd).setHours(0,0,0,0);
    return t > start && t < end;
  };

  const isHoverRange = (date: Date) => {
    if (calendarSelectStep !== 'end' || !customStart || !calendarHoverDate) return false;
    const t = new Date(date).setHours(0,0,0,0);
    const start = new Date(customStart).setHours(0,0,0,0);
    const hover = new Date(calendarHoverDate).setHours(0,0,0,0);
    if (hover >= start) {
      return t > start && t <= hover;
    } else {
      return t >= hover && t < start;
    }
  };

  const getCalendarCells = () => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const startDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      cells.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    const totalCells = 42;
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return cells;
  };

  const handleCalendarDayClick = (clickedDate: Date) => {
    const formatDT = (d: Date, timeStr: string) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayVal = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dayVal}T${timeStr}`;
    };

    if (calendarSelectStep === 'start') {
      const startHourMin = customStart ? customStart.split('T')[1] || '00:00' : '00:00';
      setCustomStart(formatDT(clickedDate, startHourMin));
      const endHourMin = customEnd ? customEnd.split('T')[1] || '23:59' : '23:59';
      setCustomEnd(formatDT(clickedDate, endHourMin));
      setCalendarSelectStep('end');
    } else {
      const startObj = new Date(customStart);
      const endHourMin = customEnd ? customEnd.split('T')[1] || '23:59' : '23:59';
      
      if (clickedDate.getTime() < startObj.getTime()) {
        const startHourMin = customStart ? customStart.split('T')[1] || '00:00' : '00:00';
        setCustomStart(formatDT(clickedDate, startHourMin));
        setCustomEnd(formatDT(startObj, endHourMin));
      } else {
        setCustomEnd(formatDT(clickedDate, endHourMin));
      }
      setCalendarSelectStep('start');
    }
  };


  const getFilteredTelemetry = (history: TelemetryRecord[]): TelemetryRecord[] => {
    if (!history || history.length === 0) return [];
    const now = currentTime;
    let minTime = 0;
    let maxTime = Infinity;

    if (timeFilter === '2h') {
      minTime = now - 2 * 3600000;
    } else if (timeFilter === '4h') {
      minTime = now - 4 * 3600000;
    } else if (timeFilter === '24h') {
      minTime = now - 24 * 3600000;
    } else if (timeFilter === 'custom') {
      if (customStart) minTime = new Date(customStart).getTime();
      if (customEnd) maxTime = new Date(customEnd).getTime();
    }

    return history.filter(record => {
      const t = new Date(record.receivedAt).getTime();
      return t >= minTime && t <= maxTime;
    });
  };
  
  // Grupos de dispositivos
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [newWidgetDeviceGroupId, setNewWidgetDeviceGroupId] = useState('');
  const [newWidgetSourceType, setNewWidgetSourceType] = useState<'single' | 'multi' | 'group'>('single');

  // Vista de la pantalla de lista: 'dashboards' | 'groups'
  const [listView, setListView] = useState<'dashboards' | 'groups'>('dashboards');

  // CRUD de grupos desde la pantalla de Dashboard
  const [isGroupDrawerOpen, setIsGroupDrawerOpen] = useState(false);
  const [groupDrawerMode, setGroupDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'water_meter' | 'smartbin'>('water_meter');
  const [groupSelectedDevices, setGroupSelectedDevices] = useState<string[]>([]);
  const [groupOrgId, setGroupOrgId] = useState('plasticos_rival');
  const [groupDeviceSearch, setGroupDeviceSearch] = useState('');

  // Estado para la notificación flotante de alertas en tiempo real
  const [activeToast, setActiveToast] = useState<{ id: string, title: string, message: string, severity: 'critical' | 'warning' | 'info' } | null>(null);

  // Sintetizador de tonos de alerta retro IoT
  const playChime = (severity: 'critical' | 'warning' | 'info') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (severity === 'critical') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota La5 (A5)
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(880, ctx.currentTime);
          gain2.gain.setValueAtTime(0.12, ctx.currentTime);
          osc2.start();
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          setTimeout(() => osc2.stop(), 200);
        }, 180);
        setTimeout(() => osc.stop(), 200);
      } else if (severity === 'warning') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // Nota Re5 (D5)
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        setTimeout(() => osc.stop(), 300);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime); // Nota Do6 (C6)
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        setTimeout(() => osc.stop(), 200);
      }
    } catch (e) {
      console.warn('Audio synthesis skipped due to user interaction policy', e);
    }
  };

  // Motor de evaluación de reglas de monitoreo en tiempo real
  useEffect(() => {
    if (devices.length === 0 || Object.keys(telemetryHistory).length === 0) return;
    
    const targetOrg = user?.role === 'superadmin' 
      ? activeDashboard?.organizationId || 'org1' 
      : user?.organizationId || 'org1';

    Object.entries(telemetryHistory).forEach(([eui, history]) => {
      if (!history || history.length === 0) return;
      const device = devices.find(d => d.devEUI === eui);
      if (!device) return;

      const latestRecord = history[0]; // El reporte más reciente

      const triggeredAlert = evaluateTelemetry(device, latestRecord, targetOrg);
      if (triggeredAlert) {
        // Ejecutar sonido interactivo
        playChime(triggeredAlert.severity);

        // Mostrar notificación tipo Toast flotante
        setActiveToast({
          id: triggeredAlert.id,
          title: triggeredAlert.severity === 'critical' 
            ? 'Alarma Crítica' 
            : triggeredAlert.severity === 'warning' 
              ? 'Advertencia IoT' 
              : 'Evento del Dispositivo',
          message: triggeredAlert.message,
          severity: triggeredAlert.severity
        });
      }
    });
  }, [telemetryHistory, devices, activeTab]);

  const loadDeviceGroups = () => {
    const saved = localStorage.getItem('device_groups');
    if (saved) {
      try {
        setDeviceGroups(JSON.parse(saved));
      } catch (e) {
        setDeviceGroups([]);
      }
    } else {
      setDeviceGroups([]);
    }
  };

  useEffect(() => {
    loadDeviceGroups();
  }, []);

  const saveGroups = (newGroups: DeviceGroup[]) => {
    setDeviceGroups(newGroups);
    localStorage.setItem('device_groups', JSON.stringify(newGroups));
  };

  const handleOpenAddGroup = () => {
    const targetOrg = activeDashboard?.organizationId || user?.organizationId || 'plasticos_rival';
    setGroupName('');
    setGroupType('water_meter');
    setGroupSelectedDevices([]);
    setGroupOrgId(targetOrg);
    setGroupDeviceSearch('');
    setEditingGroup(null);
    setGroupDrawerMode('add');
    setIsGroupDrawerOpen(true);
  };

  const handleOpenEditGroup = (group: DeviceGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupType(group.deviceType);
    setGroupSelectedDevices(group.deviceEUIs);
    setGroupOrgId(group.organizationId || 'plasticos_rival');
    setGroupDeviceSearch('');
    setGroupDrawerMode('edit');
    setIsGroupDrawerOpen(true);
  };

  const handleSaveGroup = () => {
    if (!groupName.trim() || groupSelectedDevices.length === 0) return;
    if (groupDrawerMode === 'add') {
      const newGroup: DeviceGroup = {
        id: 'grp-' + Math.random().toString(36).substr(2, 9),
        name: groupName.trim(),
        deviceType: groupType,
        deviceEUIs: groupSelectedDevices,
        organizationId: groupOrgId,
        createdAt: new Date().toISOString()
      };
      saveGroups([...deviceGroups, newGroup]);
    } else if (groupDrawerMode === 'edit' && editingGroup) {
      saveGroups(deviceGroups.map(g => g.id === editingGroup.id
        ? { ...g, name: groupName.trim(), deviceType: groupType, deviceEUIs: groupSelectedDevices }
        : g
      ));
    }
    setIsGroupDrawerOpen(false);
    setGroupDrawerMode(null);
    setEditingGroup(null);
  };

  const handleDeleteGroup = (id: string) => {
    if (window.confirm('¿Eliminar este grupo de dispositivos?')) {
      saveGroups(deviceGroups.filter(g => g.id !== id));
    }
  };

  
  const [newDashOrgId, setNewDashOrgId] = useState('plasticos_rival');
  const [editDashOrgId, setEditDashOrgId] = useState('plasticos_rival');

  // Inicializar organización por defecto para nueva dashboard
  useEffect(() => {
    if (user?.organizationId) {
      setNewDashOrgId(user.organizationId);
    }
  }, [user]);

  // Siembra dinámica removida (integrada en la carga robusta del useEffect superior)

  const filteredDashboards = dashboards.filter((dash) => {
    if (user?.role === 'superadmin') return true;
    return dash.organizationId === user?.organizationId;
  });

  // activeDashboard must be computed BEFORE filteredDevices so device filtering
  // can be scoped to the dashboard's org (not just the logged-in user's org).
  const activeDashboard = filteredDashboards.find(d => d.id === activeTab);

  const filteredDevices = devices.filter(d => {
    if (user?.role === 'superadmin') return true; // El Super Admin ve TODOS los dispositivos globalmente en los paneles

    // Determine the org that should gate device visibility.
    // Priority: dashboard's org → user's org → no filter (superadmin on list view).
    // Dashboards without an explicit organizationId implicitly belong to 'org1'.
    let targetOrg: string | undefined;
    if (activeTab !== 'list') {
      targetOrg = activeDashboard?.organizationId || 'plasticos_rival';
    } else {
      targetOrg = user?.organizationId || 'plasticos_rival';
    }
    if (!targetOrg) return true;
    const devOrg = d.organizationId || 'plasticos_rival';
    return devOrg === targetOrg;
  });

  // Dispositivos disponibles para el grupo (filtrados por org del grupo y tipo de dispositivo)
  const groupAvailableDevices = devices.filter(d => {
    const targetOrg = user?.role === 'superadmin' ? groupOrgId : (user?.organizationId || 'plasticos_rival');
    const devOrg = d.organizationId || 'plasticos_rival';
    return d.deviceType === groupType && devOrg === targetOrg;
  });
  const groupFilteredDevices = groupAvailableDevices.filter(d => {
    if (!groupDeviceSearch.trim()) return true;
    const q = groupDeviceSearch.toLowerCase();
    return (d.name || '').toLowerCase().includes(q) || d.devEUI.toLowerCase().includes(q);
  });

  // Grupos visibles según org del usuario o dashboard activo
  const filteredGroups = deviceGroups.filter(g => {
    const targetOrg = activeTab !== 'list'
      ? (activeDashboard?.organizationId || 'plasticos_rival')
      : (user?.role !== 'superadmin' ? user?.organizationId : undefined);
    if (!targetOrg) return true;
    return g.organizationId === targetOrg;
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

  // Cargar telemetrías cuando cambia el tab, los widgets o los dispositivos
  useEffect(() => {
    if (activeTab === 'list') return;
    const activeDash = dashboards.find(d => d.id === activeTab);
    if (!activeDash) return;

    loadDeviceGroups();

    // Deduplicate by devEUI+fCnt (same frame received by multiple gateways)
    // keeping the record with the best RSSI per uplink frame
    const deduplicateTelemetry = (records: TelemetryRecord[]): TelemetryRecord[] => {
      const best = new Map<string, TelemetryRecord>();
      for (const r of records) {
        const key = `${r.devEUI}-${r.fCnt}`;
        const existing = best.get(key);
        if (!existing || r.rssi > existing.rssi) best.set(key, r);
      }
      return Array.from(best.values()).sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
    };

    const loadEUI = (eui: string, limit = 200) => {
      if (telemetryHistory[eui]) return;
      getDeviceTelemetry(eui, limit)
        .then(data => {
          setTelemetryHistory(prev => ({
            ...prev,
            [eui]: data && data.length > 0 ? deduplicateTelemetry(data) : generateTelemetryHistory(eui, limit)
          }));
        })
        .catch(() => {
          setTelemetryHistory(prev => ({ ...prev, [eui]: generateTelemetryHistory(eui, limit) }));
        });
    };

    // Cargar automáticamente el historial de todos los dispositivos visibles en este dashboard
    filteredDevices.forEach(d => loadEUI(d.devEUI));
  }, [activeTab, dashboards, devices]);

  const saveDashboards = (newList: CustomDashboard[]) => {
    setDashboards(newList);
    localStorage.setItem('custom_dashboards', JSON.stringify(newList));
  };

  const handleCreateDashboard = () => {
    if (!newDashName.trim()) return;

    const newId = 'dash-' + Math.random().toString(36).substr(2, 9);
    const defaultWidgets: DashboardWidget[] = [];

    if (newDashPreset === 'water_meters') {
      const presetOrg = user?.role === 'superadmin' ? newDashOrgId : user?.organizationId;
      const presetDevices = presetOrg
        ? devices.filter(d => (d.organizationId || 'org1') === presetOrg)
        : devices;
      const firstMeter = presetDevices.find(d => d.deviceType === 'water_meter') || presetDevices[0];
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
      const presetOrg = user?.role === 'superadmin' ? newDashOrgId : user?.organizationId;
      const presetDevices = presetOrg
        ? devices.filter(d => (d.organizationId || 'org1') === presetOrg)
        : devices;
      const firstBin = presetDevices.find(d => d.deviceType === 'smartbin') || presetDevices[0];
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
    setNewWidgetDeviceGroupId('');
    setNewWidgetSourceType('single');
    setNewWidgetMetric('flow');
    setNewWidgetUnit('L/h');
    setNewWidgetColor('teal');
    setNewWidgetWidth('half');
    setNewWidgetHeight('medium');
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
    
    // Detect source type for the widget
    if (widget.type === 'table' && widget.selectedDevices && widget.selectedDevices.length > 0) {
      setNewWidgetSourceType('multi');
      setNewWidgetSelectedDevices(widget.selectedDevices);
      setNewWidgetDevice('');
      setNewWidgetDeviceGroupId('');
    } else if (widget.deviceGroupId) {
      setNewWidgetDeviceGroupId(widget.deviceGroupId);
      setNewWidgetSourceType('group');
      setNewWidgetDevice('');
    } else {
      setNewWidgetDeviceGroupId('');
      setNewWidgetSourceType('single');
      setNewWidgetDevice(widget.deviceEUI || '');
    }

    setNewWidgetMetric(widget.metricKey || 'flow');
    setNewWidgetUnit(widget.metricUnit || '');
    setNewWidgetColor(widget.color || 'teal');
    setNewWidgetWidth(widget.width || 'half');
    setNewWidgetHeight(widget.height || 'medium');
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
      const isBarOrMap = newWidgetType === 'bar' || newWidgetType === 'map';
      const isTableMulti = newWidgetType === 'table' && newWidgetSourceType === 'multi';
      const newWidget: DashboardWidget = {
        id: newId,
        type: newWidgetType,
        title: newWidgetTitle,
        deviceEUI: !isBarOrMap && newWidgetSourceType === 'single' ? newWidgetDevice : undefined,
        deviceGroupId: !isBarOrMap && newWidgetSourceType === 'group' ? newWidgetDeviceGroupId : undefined,
        selectedDevices: (isBarOrMap || isTableMulti) ? newWidgetSelectedDevices : undefined,
        metricKey: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetMetric : undefined,
        metricUnit: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetUnit : undefined,
        color: newWidgetColor,
        width: newWidgetWidth,
        height: newWidgetHeight,
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
      const isBarOrMap2 = newWidgetType === 'bar' || newWidgetType === 'map';
      const isTableMulti2 = newWidgetType === 'table' && newWidgetSourceType === 'multi';
      const updated = dashboards.map(dash => {
        if (dash.id === activeTab) {
          return {
            ...dash,
            widgets: dash.widgets.map(w => w.id === editingWidget.id ? {
              ...w,
              type: newWidgetType,
              title: newWidgetTitle,
              deviceEUI: !isBarOrMap2 && newWidgetSourceType === 'single' ? newWidgetDevice : undefined,
              deviceGroupId: !isBarOrMap2 && newWidgetSourceType === 'group' ? newWidgetDeviceGroupId : undefined,
              selectedDevices: (isBarOrMap2 || isTableMulti2) ? newWidgetSelectedDevices : undefined,
              metricKey: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetMetric : undefined,
              metricUnit: newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar' ? newWidgetUnit : undefined,
              color: newWidgetColor,
              width: newWidgetWidth,
              height: newWidgetHeight,
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
    setNewWidgetHeight('medium');
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

  const updateWidgetDimensions = (widgetId: string, gridCols: number, heightPx: number) => {
    const updated = dashboards.map(dash => {
      if (dash.id === activeTab) {
        return {
          ...dash,
          widgets: dash.widgets.map(w => w.id === widgetId ? { ...w, gridCols, heightPx } : w)
        };
      }
      return dash;
    });
    saveDashboards(updated);
  };

  const handleResizeStart = (e: React.PointerEvent, widget: DashboardWidget) => {
    e.preventDefault();
    e.stopPropagation();
    
    const cardElement = (e.currentTarget as HTMLElement).closest('.card') as HTMLElement;
    const gridElement = cardElement?.parentElement as HTMLElement;
    if (!cardElement || !gridElement) return;

    const cardRect = cardElement.getBoundingClientRect();
    const gridRect = gridElement.getBoundingClientRect();
    
    const singleColWidth = (gridRect.width - 11 * 24) / 12;
    
    const startWidth = cardRect.width;
    const startHeight = cardRect.height;
    const startX = e.clientX;
    const startY = e.clientY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const newWidth = startWidth + deltaX;
      const newHeight = startHeight + deltaY;
      
      const computedCols = Math.round((newWidth + 24) / (singleColWidth + 24));
      const gridCols = Math.max(2, Math.min(12, computedCols));
      
      const minHeight = widget.type === 'kpi' ? 110 : 180;
      const heightPx = Math.max(minHeight, Math.min(1000, newHeight));
      
      setTempResizing({ id: widget.id, gridCols, heightPx });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      setTempResizing(prev => {
        if (prev && prev.id === widget.id) {
          updateWidgetDimensions(widget.id, prev.gridCols, prev.heightPx);
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // # Plan de Reordenamiento Dinámico Avanzado y Llenado Automático de Espacios Vacíos (Dense CSS Grid)
  // Este plan detalla la solución definitiva para el movimiento de paneles en el dashboard. 
  // Implementa un sistema de arrastre basado en inserción por proximidad (reordering) 
  // combinado con un flujo denso en la cuadrícula CSS (gridAutoFlow: 'dense').

  const handleDragStart = (e: React.PointerEvent, widgetId: string) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setDraggingWidgetId(widgetId);

    let overIdLocal: string | null = null;
    let insertAfterLocal = false;

    const handlePointerMove = (mv: PointerEvent) => {
      const x = mv.clientX;
      const y = mv.clientY;

      const cards = Array.from(document.querySelectorAll('[data-widget-id]')) as HTMLElement[];
      const otherCards = cards.filter(c => c.dataset.widgetId !== widgetId);

      if (otherCards.length === 0) return;

      let closestCard: HTMLElement | null = null;
      let minDistance = Infinity;

      for (const card of otherCards) {
        const rect = card.getBoundingClientRect();
        const closestX = Math.max(rect.left, Math.min(x, rect.right));
        const closestY = Math.max(rect.top, Math.min(y, rect.bottom));
        const dx = x - closestX;
        const dy = y - closestY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
          minDistance = distance;
          closestCard = card;
        }
      }

      if (closestCard) {
        const overId = closestCard.dataset.widgetId ?? null;
        if (overId !== overIdLocal) {
          overIdLocal = overId;
          setDragOverWidgetId(overId);
        }
        const rect = closestCard.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        insertAfterLocal = (y > centerY + 20) || (y > rect.top - 15 && y < rect.bottom + 15 && x > centerX);
      } else if (overIdLocal !== null) {
        overIdLocal = null;
        setDragOverWidgetId(null);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (overIdLocal && overIdLocal !== widgetId) {
        setDashboards(prev => {
          const updated = prev.map(dash => {
            if (dash.id !== activeTab) return dash;
            const widgets = [...dash.widgets];
            const dragIdx = widgets.findIndex(w => w.id === widgetId);
            const targetIdx = widgets.findIndex(w => w.id === overIdLocal);
            if (dragIdx !== -1 && targetIdx !== -1) {
              const [draggedWidget] = widgets.splice(dragIdx, 1);
              let insertIdx = widgets.findIndex(w => w.id === overIdLocal);
              if (insertAfterLocal) insertIdx += 1;
              widgets.splice(insertIdx, 0, draggedWidget);
            }
            return { ...dash, widgets };
          });
          localStorage.setItem('custom_dashboards', JSON.stringify(updated));
          return updated;
        });
      }
      setDraggingWidgetId(null);
      setDragOverWidgetId(null);
      overIdLocal = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
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
      LineChart: LineChartIcon,
      BarChart3: BarChart3
    };
    const Component = iconMap[iconName] || LayoutDashboard;
    return <Component size={size} />;
  };

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
    const targetDevice = filteredDevices.find(d => d.devEUI === widget.deviceEUI);
    const getContentHeight = (w: DashboardWidget) => {
      const h = w.height || 'medium';
      if (h === 'short') return 120;
      if (h === 'tall') return 340;
      if (h === 'extra-tall') return 460;
      return 220; // 'medium'
    };
    
    switch (widget.type) {
      case 'kpi': {
        const deviceHistory = telemetryHistory[widget.deviceEUI || ''] || [];
        const filteredHistory = getFilteredTelemetry(deviceHistory);
        const latestRecord = filteredHistory[0];
        const val = latestRecord && latestRecord.decodedPayload && widget.metricKey ? (latestRecord.decodedPayload as any)[widget.metricKey] : null;
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
                {filteredHistory.length === 0 && (
                  <span style={{ color: 'var(--color-red, #dc3545)', fontSize: '10px', marginLeft: '6px', fontWeight: 550 }}>(Sin telemetría en período)</span>
                )}
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
        // CASO A: Comparativa de Grupo de Dispositivos
        if (widget.deviceGroupId) {
          const activeGroup = deviceGroups.find(g => g.id === widget.deviceGroupId) || 
                              JSON.parse(localStorage.getItem('device_groups') || '[]').find((g: any) => g.id === widget.deviceGroupId);
            
          if (!activeGroup) {
            return (
              <div className="text-muted" style={{ padding: '40px 0', fontSize: 12, textAlign: 'center' }}>
                Grupo de dispositivos no encontrado.
              </div>
            );
          }

          // Verify group belongs to dashboard organization
          if (activeDashboard?.organizationId && activeGroup.organizationId !== activeDashboard.organizationId) {
            return (
              <div className="text-muted" style={{ padding: '40px 0', fontSize: 12, textAlign: 'center' }}>
                Grupo no autorizado para este dashboard.
              </div>
            );
          }

          const missingData = activeGroup.deviceEUIs.some((eui: string) => !telemetryHistory[eui]);
          if (missingData) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                <RefreshCw size={18} className="animate-spin text-muted" />
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
                  Cargando telemetrías comparativas...
                </span>
              </div>
            );
          }

          // Alinear telemetrías por fecha
          const masterEUI = activeGroup.deviceEUIs[0];
          const masterFiltered = getFilteredTelemetry(telemetryHistory[masterEUI] || []);
          
          if (masterFiltered.length === 0) {
            return (
              <div className="text-muted" style={{ padding: '80px 0', fontSize: 12, textAlign: 'center', color: 'var(--color-muted)' }}>
                No hay datos en el período seleccionado.
              </div>
            );
          }

          const masterHistory = [...masterFiltered].reverse(); // del más antiguo al más nuevo

          const mergedData = masterHistory.map((h, index) => {
            const dateObj = new Date(h.receivedAt);
            const formatStr = timeFilter === 'custom' || timeFilter === '24h' ? 'dd/MM HH:mm' : 'HH:mm';
            const timeStr = format(dateObj, formatStr);
            const dataPoint: any = { time: timeStr };
            
            activeGroup.deviceEUIs.forEach((eui: string) => {
              const dev = devices.find(d => d.devEUI === eui);
              const name = dev ? dev.name : `Sensor ${eui.substring(0, 6)}`;
              
              const devHist = getFilteredTelemetry(telemetryHistory[eui] || []);
              const revIdx = devHist.length - 1 - index;
              const devRecord = devHist[revIdx] || devHist[index];
              
              const rawVal = devRecord && devRecord.decodedPayload ? (devRecord.decodedPayload as any)[widget.metricKey || 'flow'] : null;
              const parsedNum = rawVal !== null && rawVal !== undefined ? Number(rawVal) : NaN;
              const val = devRecord ? (!isNaN(parsedNum) ? Number(parsedNum.toFixed(1)) : 0) : null;
              dataPoint[name] = val;
            });
            
            return dataPoint;
          });

          const PRESET_COLORS = ['#1D9E75', '#185FA5', '#BA7517', '#8A3FFC', '#A32D2D', '#EC4899', '#4B5563'];

          return (
            <div style={{ width: '100%', height: getContentHeight(widget), marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergedData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={Math.ceil(mergedData.length / 8)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any, name?: any) => [`${v} ${widget.metricUnit}`, name || '']} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  {activeGroup.deviceEUIs.map((eui: string, idx: number) => {
                    const dev = devices.find(d => d.devEUI === eui);
                    const name = dev ? dev.name : `Sensor ${eui.substring(0, 6)}`;
                    const color = PRESET_COLORS[idx % PRESET_COLORS.length];
                    return (
                      <Line 
                        key={eui}
                        type="monotone"
                        dataKey={name}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls={true}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        }

        // CASO B: Dispositivo Único
        const history = telemetryHistory[widget.deviceEUI || ''] || [];
        const filteredHistory = getFilteredTelemetry(history);
        
        if (filteredHistory.length === 0) {
          return (
            <div className="text-muted" style={{ padding: '80px 0', fontSize: 12, textAlign: 'center', color: 'var(--color-muted)' }}>
              No hay datos en el período seleccionado.
            </div>
          );
        }

        const formatted = [...filteredHistory].reverse().map(h => {
          const raw = h.decodedPayload ? (h.decodedPayload as any)[widget.metricKey || 'flow'] : null;
          const num = raw !== null && raw !== undefined ? Number(raw) : NaN;
          const dateObj = new Date(h.receivedAt);
          const formatStr = timeFilter === 'custom' || timeFilter === '24h' ? 'dd/MM HH:mm' : 'HH:mm';
          return {
            time: format(dateObj, formatStr),
            val: !isNaN(num) ? Number(num.toFixed(1)) : 0
          };
        });

        const colorHex = widget.color === 'blue' ? '#185FA5' : 
                         widget.color === 'amber' ? '#BA7517' : 
                         widget.color === 'red' ? '#A32D2D' : 
                         widget.color === 'purple' ? '#8A3FFC' : '#1D9E75';

        return (
          <div style={{ width: '100%', height: getContentHeight(widget), marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colorHex} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={colorHex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={Math.ceil(formatted.length / 8)} />
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
        const data = subset.map(d => {
          const devHistory = telemetryHistory[d.devEUI] || [];
          const filteredHistory = getFilteredTelemetry(devHistory);
          const latest = filteredHistory[0];
          return {
            name: d.name.replace('Medidor ', '').replace('SmartBin ', ''),
            val: latest && latest.decodedPayload && widget.metricKey ? (latest.decodedPayload as any)[widget.metricKey] ?? 0 : 0
          };
        });

        const colorHex = widget.color === 'blue' ? '#185FA5' : 
                         widget.color === 'teal' ? '#1D9E75' : 
                         widget.color === 'red' ? '#A32D2D' : 
                         widget.color === 'purple' ? '#8A3FFC' : '#BA7517';

        return (
          <div style={{ width: '100%', height: getContentHeight(widget), marginTop: 12 }}>
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
        
        // Filtrar y validar coordenadas numéricas reales
        const devicesWithCoords = targetDevices.filter(d => 
          d.lat !== null && d.lat !== undefined && !isNaN(Number(d.lat)) &&
          d.lng !== null && d.lng !== undefined && !isNaN(Number(d.lng))
        );
        
        const mapCenter: [number, number] = devicesWithCoords.length > 0 
          ? [Number(devicesWithCoords[0].lat), Number(devicesWithCoords[0].lng)] 
          : [-0.1950, -78.4900];

        // Obtener el índice del widget en el dashboard activo
        const widgetsList = activeDashboard?.widgets || [];
        const widgetIdx = widgetsList.findIndex(w => w.id === widget.id);

        // Usar una clave dinámica única basada en el widget ID, su índice en el arreglo, el número de dispositivos y el centro 
        // para forzar a Leaflet a desmontarse y recrearse limpiamente en su nueva posición en el DOM, evitando que crasheé
        const mapKey = `map-${widget.id}-${widgetIdx}-${devicesWithCoords.length}-${mapCenter[0]}-${mapCenter[1]}`;

        return (
          <div style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 10,
            overflow: 'hidden',
            marginTop: 8,
            border: '1px solid var(--color-border)',
            boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.04)'
          }}>
            <MapContainer key={mapKey} center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {devicesWithCoords.map(d => {
                const icon = mapIcons[d.deviceType] || mapIcons.general;
                const devHistory = telemetryHistory[d.devEUI] || [];
                const filteredHistory = getFilteredTelemetry(devHistory);
                const latest = filteredHistory[0];
                const p = latest?.decodedPayload as any;
                
                const hasValidDate = latest && latest.receivedAt && !isNaN(new Date(latest.receivedAt).getTime());

                return (
                  <Marker key={d.id} position={[Number(d.lat), Number(d.lng)]} icon={icon}>
                    <Popup>
                      <div style={{ fontSize: 11 }}>
                        <strong>{d.name}</strong>
                        <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>DevEUI: {d.devEUI}</div>
                        {!latest ? (
                          <div style={{ fontSize: 10, color: 'var(--color-red, #dc3545)', marginTop: 4, fontWeight: 550 }}>Sin telemetría en período</div>
                        ) : (
                          <>
                            {p?.flow !== undefined && !isNaN(Number(p.flow)) && <div>Caudal: {Number(p.flow).toFixed(1)} L/h</div>}
                            {p?.fillLevel !== undefined && <div>Llenado: {p.fillLevel}%</div>}
                            {hasValidDate && (
                              <div style={{ fontSize: 9, color: 'var(--color-hint)', marginTop: 4 }}>
                                Recibido: {format(new Date(latest.receivedAt), 'dd/MM HH:mm:ss')}
                              </div>
                            )}
                          </>
                        )}
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
        // Resolve which device EUIs this table covers
        const tableEUIs: string[] = (() => {
          if (widget.selectedDevices && widget.selectedDevices.length > 0) return widget.selectedDevices;
          if (widget.deviceGroupId) {
            const grp = deviceGroups.find(g => g.id === widget.deviceGroupId) ||
              (JSON.parse(localStorage.getItem('device_groups') || '[]') as DeviceGroup[]).find(g => g.id === widget.deviceGroupId);
            return grp?.deviceEUIs || [];
          }
          return widget.deviceEUI ? [widget.deviceEUI] : [];
        })();

        const isMulti = tableEUIs.length > 1;
        const firstEUI = tableEUIs[0] || '';
        const firstDev = devices.find(d => d.devEUI === firstEUI);
        const resolvedCols = resolveTableColumns(widget.tableColumns, firstDev?.deviceType);

        const renderCell = (col: TableColumnConfig, h: TelemetryRecord) => {
          if (!h) return '—';
          const key = col.key;
          const payload = h.decodedPayload ? h.decodedPayload as Record<string, any> : {};
          switch (key) {
            case 'receivedAt': return format(new Date(h.receivedAt), 'dd/MM HH:mm:ss');
            case 'rssi': return `${h.rssi} dBm`;
            case 'snr': return `${h.snr} dB`;
            case 'fPort': return h.fPort;
            case 'fCnt': return h.fCnt;
            case 'devEUI': return h.devEUI;
            default: {
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
              const numVal = Number(val);
              return `${!isNaN(numVal) ? numVal.toFixed(1) : String(val)}${unitSuffix}`;
            }
          }
        };

        const cellStyle = (col: TableColumnConfig) => ({
          padding: '8px',
          whiteSpace: col.key === 'receivedAt' ? 'nowrap' as const : 'normal' as const,
          fontFamily: ['rssi','snr','fPort','fCnt','devEUI'].includes(col.key) ? 'monospace' : 'inherit',
        });

        if (isMulti) {
          // One row per device showing its latest telemetry record
          const latestPerDevice: { devName: string; record: TelemetryRecord | null }[] = tableEUIs.map(eui => {
            const dev = devices.find(d => d.devEUI === eui);
            const hist = telemetryHistory[eui] || [];
            const filtered = getFilteredTelemetry(hist);
            return { devName: dev?.name || eui.substring(0, 8), record: filtered[0] || null };
          });

          return (
            <div style={{ marginTop: 12, overflowX: 'auto', maxHeight: getContentHeight(widget), overflowY: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--teal-dark)', fontWeight: 650 }}>Dispositivo</th>
                    {resolvedCols.map((col, idx) => (
                      <th key={`${col.key}-${idx}`} style={{ padding: '8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {col.label} {col.unit && !['rssi','snr'].includes(col.key) ? `(${col.unit})` : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latestPerDevice.length === 0 ? (
                    <tr><td colSpan={resolvedCols.length + 1} style={{ textAlign: 'center', padding: '16px', color: 'var(--color-hint)' }}>No hay telemetrías registradas</td></tr>
                  ) : (
                    latestPerDevice.map(({ devName, record }, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                        <td style={{ padding: '8px', fontWeight: 550, whiteSpace: 'nowrap', color: 'var(--teal-dark)', fontSize: 10 }}>{devName}</td>
                        {resolvedCols.map((col, idx) => (
                          <td key={`${col.key}-${idx}`} style={cellStyle(col)}>{record ? renderCell(col, record) : '—'}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          );
        }

        // Single device table
        const history = telemetryHistory[firstEUI] || [];
        const filteredHistory = getFilteredTelemetry(history);
        return (
          <div style={{ marginTop: 12, overflowX: 'auto', maxHeight: getContentHeight(widget), overflowY: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  {resolvedCols.map((col, idx) => (
                    <th key={`${col.key}-${idx}`} style={{ padding: '8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {col.label} {col.unit && !['rssi','snr'].includes(col.key) ? `(${col.unit})` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr><td colSpan={resolvedCols.length} style={{ textAlign: 'center', padding: '16px', color: 'var(--color-hint)' }}>No hay telemetrías registradas en este período</td></tr>
                ) : (
                  filteredHistory.slice(0, 20).map((h, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                      {resolvedCols.map((col, idx) => (
                        <td key={`${col.key}-${idx}`} style={cellStyle(col)}>{renderCell(col, h)}</td>
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

          <div className="page-header" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 24, fontWeight: 700 }}>
                {listView === 'dashboards' ? 'Mis Dashboards' : 'Grupos de Dispositivos'}
              </h2>
              <p className="page-subtitle">
                {listView === 'dashboards'
                  ? 'Selecciona, edita o crea tus tableros de control personalizados.'
                  : 'Gestiona conjuntos de sensores para comparar telemetría en paneles de línea o tabla.'}
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => listView === 'dashboards' ? setIsCreateModalOpen(true) : handleOpenAddGroup()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}
            >
              <Plus size={16} />
              <span>{listView === 'dashboards' ? 'Crear Dashboard' : 'Crear Grupo'}</span>
            </button>
          </div>

          {/* Tabs: Dashboards | Grupos */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
            <button
              className={`btn-secondary ${listView === 'dashboards' ? 'active' : ''}`}
              onClick={() => setListView('dashboards')}
              style={{ padding: '6px 14px', fontSize: 13, fontWeight: 550, display: 'flex', alignItems: 'center', gap: 6, background: listView === 'dashboards' ? 'var(--teal-bg)' : 'transparent', borderColor: listView === 'dashboards' ? 'var(--teal)' : 'var(--color-border)', color: listView === 'dashboards' ? 'var(--teal-dark)' : 'var(--color-text)' }}
            >
              <LayoutDashboard size={14} />
              Dashboards ({filteredDashboards.length})
            </button>
            <button
              className={`btn-secondary ${listView === 'groups' ? 'active' : ''}`}
              onClick={() => setListView('groups')}
              style={{ padding: '6px 14px', fontSize: 13, fontWeight: 550, display: 'flex', alignItems: 'center', gap: 6, background: listView === 'groups' ? 'var(--teal-bg)' : 'transparent', borderColor: listView === 'groups' ? 'var(--teal)' : 'var(--color-border)', color: listView === 'groups' ? 'var(--teal-dark)' : 'var(--color-text)' }}
            >
              <Database size={14} />
              Grupos ({filteredGroups.length})
            </button>
          </div>

          {/* SUB-VISTA: GRUPOS */}
          {listView === 'groups' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filteredGroups.map(grp => {
                const isWater = grp.deviceType === 'water_meter';
                return (
                  <div key={grp.id} className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: isWater ? '#E6F1FB' : '#FAEEDA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isWater ? <Droplets size={16} style={{ color: '#185FA5' }} /> : <Trash2 size={16} style={{ color: '#854F0B' }} />}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{grp.name}</h4>
                          <span className={`type-badge ${isWater ? 'water' : 'bin'}`} style={{ marginTop: 4, display: 'inline-block' }}>
                            {isWater ? 'Medidores' : 'SmartBins'} · {grp.deviceEUIs.length} dispositivos
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-secondary" onClick={() => handleOpenEditGroup(grp)} style={{ padding: 4, minWidth: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Editar"><Settings size={13} /></button>
                        <button className="btn-secondary" onClick={() => handleDeleteGroup(grp.id)} style={{ padding: 4, minWidth: 28, height: 28, background: '#FCEBEB', color: 'var(--red)', borderColor: '#F5C2C0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Eliminar"><Trash size={13} /></button>
                      </div>
                    </div>
                    <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--color-muted)', marginBottom: 6 }}>Dispositivos:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 90, overflowY: 'auto' }}>
                        {grp.deviceEUIs.map(eui => {
                          const dev = devices.find(d => d.devEUI === eui);
                          return (
                            <div key={eui} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 500 }}>{dev ? dev.name : `Dispositivo ${eui.substring(0, 8)}`}</span>
                              <code style={{ fontSize: 9, color: 'var(--color-hint)' }}>{eui}</code>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {user?.role === 'superadmin' && (
                      <div style={{ fontSize: 10, color: 'var(--color-hint)', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-bg)', padding: '4px 8px', borderRadius: 4, border: '0.5px solid var(--color-border)' }}>
                        <Shield size={10} style={{ color: 'var(--teal)' }} />
                        {clients.find(c => c.id === grp.organizationId)?.name || 'Empresa Demo S.A.'}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredGroups.length === 0 && (
                <div className="card" style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: 'var(--color-border)' }}>
                  <Database size={32} style={{ margin: '0 auto 12px', color: 'var(--color-muted)' }} />
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sin grupos creados</h4>
                  <p className="text-muted" style={{ fontSize: 13, margin: '8px 0 20px', lineHeight: 1.5 }}>
                    Los grupos te permiten comparar múltiples sensores en un mismo panel de línea o tabla.
                  </p>
                  <button className="btn-primary" onClick={handleOpenAddGroup} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={15} /> Crear Grupo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUB-VISTA: DASHBOARDS */}
          {listView === 'dashboards' && (
            filteredDashboards.length === 0 ? (
              <div className="card" style={{ padding: '60px 24px', textAlign: 'center', borderStyle: 'dashed', borderWidth: '2px', borderColor: 'var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: '50%', color: 'var(--color-muted)', marginBottom: 16 }}>
                  <LayoutDashboard size={36} className="text-teal-500" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>Sin Dashboards Creados</h3>
                <p className="text-muted" style={{ fontSize: 13, maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.5 }}>
                  No tienes ningún tablero de analítica configurado en este momento. ¡Crea el primero ahora!
                </p>
                <button 
                  className="btn-primary" 
                  onClick={() => setIsCreateModalOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} /> <span>Crear Dashboard</span>
                </button>
              </div>
            ) : (
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
                                Cliente: {clients.find(c => c.id === (dash.organizationId || 'plasticos_rival'))?.name || 'Plásticos Rival'}
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
            )
          )}

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

          {/* Barra de Filtro de Tiempo Premium (Glassmorphic) */}
          <div style={{
            position: 'relative',
            zIndex: showCalendarPopover ? 1000 : 10,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 18px',
            background: 'rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            marginBottom: '20px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Rango Temporal:
              </span>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg)', padding: '3px', borderRadius: '8px', border: '0.5px solid var(--color-border)' }}>
                {(['2h', '4h', '24h', 'custom'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setTimeFilter(filter);
                      if (filter === 'custom') {
                        const end = new Date();
                        const start = new Date(Date.now() - 24 * 3600000);
                        const formatDT = (d: Date) => {
                          const year = d.getFullYear();
                          const month = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          const hours = String(d.getHours()).padStart(2, '0');
                          const minutes = String(d.getMinutes()).padStart(2, '0');
                          return `${year}-${month}-${day}T${hours}:${minutes}`;
                        };
                        setCustomStart(formatDT(start));
                        setCustomEnd(formatDT(end));
                      }
                    }}
                    className={`btn-secondary ${timeFilter === filter ? 'active' : ''}`}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      minWidth: 'auto',
                      height: '28px',
                      borderRadius: '6px',
                      border: 'none',
                      background: timeFilter === filter ? 'var(--teal)' : 'transparent',
                      color: timeFilter === filter ? 'white' : 'var(--color-text)',
                      boxShadow: timeFilter === filter ? '0 2px 8px rgba(29, 158, 117, 0.25)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer'
                    }}
                  >
                    {filter === '2h' ? 'Últimas 2h' :
                     filter === '4h' ? 'Últimas 4h' :
                     filter === '24h' ? 'Últimas 24h' : 'Personalizado'}
                  </button>
                ))}
              </div>
            </div>

            {timeFilter === 'custom' && (
              <div 
                style={{ 
                  position: 'relative',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  animation: 'fadeIn 0.25s ease-out',
                  flexWrap: 'wrap',
                  zIndex: showCalendarPopover ? 100 : 1
                }}
              >
                <button
                  onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                  className="btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 650,
                    height: '32px',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <Calendar size={14} style={{ color: 'var(--teal)' }} />
                  <span>
                    {customStart && customEnd 
                      ? `${formatDateLabel(customStart)} a ${formatDateLabel(customEnd)}`
                      : 'Seleccionar rango...'}
                  </span>
                </button>

                {showCalendarPopover && (
                  <>
                    {/* Backdrop transparente para cerrar */}
                    <div 
                      onClick={() => setShowCalendarPopover(false)}
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 998,
                        background: 'transparent'
                      }}
                    />
                    
                    {/* Popover del Calendario */}
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '8px',
                        width: '320px',
                        background: 'var(--color-surface)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: '12px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
                        padding: '16px',
                        zIndex: 999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        animation: 'fadeIn 0.18s ease-out'
                      }}
                    >
                      {/* Cabecera del mes */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const newDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
                            setCalendarViewDate(newDate);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                          {MONTH_NAMES[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear()}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
                            setCalendarViewDate(newDate);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>

                      {/* Días de la semana */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontSize: '10px', fontWeight: 750, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <span key={d}>{d}</span>)}
                      </div>

                      {/* Cuadrícula de días */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                        {getCalendarCells().map((cell, idx) => {
                          const isStart = customStart && isSameDay(cell.date, new Date(customStart));
                          const isEnd = customEnd && isSameDay(cell.date, new Date(customEnd));
                          const inRange = isWithinRange(cell.date);
                          const hovered = isHoverRange(cell.date);
                          const active = isStart || isEnd;
                          const activeOrInRange = active || inRange || hovered;

                          let dayBg = 'transparent';
                          let dayColor = cell.isCurrentMonth ? 'var(--color-text)' : 'var(--color-muted)';
                          let dayBorderRadius = '6px';

                          if (active) {
                            dayBg = 'var(--teal)';
                            dayColor = 'white';
                          } else if (inRange || hovered) {
                            dayBg = 'rgba(29, 158, 117, 0.12)';
                            dayColor = 'var(--teal)';
                          }

                          // Border radius adaptativo premium
                          if (customStart && customEnd) {
                            const startT = new Date(customStart).setHours(0,0,0,0);
                            const endT = new Date(customEnd).setHours(0,0,0,0);
                            const cellT = cell.date.getTime();
                            if (cellT === startT) {
                              dayBorderRadius = '6px 0 0 6px';
                            } else if (cellT === endT) {
                              dayBorderRadius = '0 6px 6px 0';
                            } else if (cellT > startT && cellT < endT) {
                              dayBorderRadius = '0';
                            }
                          }

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleCalendarDayClick(cell.date)}
                              onMouseEnter={() => setCalendarHoverDate(cell.date)}
                              onMouseLeave={() => setCalendarHoverDate(null)}
                              style={{
                                background: dayBg,
                                color: dayColor,
                                border: 'none',
                                borderRadius: dayBorderRadius,
                                height: '28px',
                                fontSize: '11px',
                                fontWeight: activeOrInRange ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.1s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {cell.date.getDate()}
                            </button>
                          );
                        })}
                      </div>

                      {/* Ajuste de horas */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '0.5px solid var(--color-border)', paddingTop: '10px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)' }}>Desde:</span>
                          <input 
                            type="time" 
                            value={customStart ? customStart.split('T')[1] || '00:00' : '00:00'}
                            onChange={(e) => {
                              if (customStart) {
                                const datePart = customStart.split('T')[0];
                                setCustomStart(`${datePart}T${e.target.value}`);
                              }
                            }}
                            style={{
                              fontSize: '11px',
                              padding: '4px 6px',
                              borderRadius: '6px',
                              border: '0.5px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              color: 'var(--color-text)',
                              outline: 'none',
                              width: '100%'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)' }}>Hasta:</span>
                          <input 
                            type="time" 
                            value={customEnd ? customEnd.split('T')[1] || '23:59' : '23:59'}
                            onChange={(e) => {
                              if (customEnd) {
                                const datePart = customEnd.split('T')[0];
                                setCustomEnd(`${datePart}T${e.target.value}`);
                              }
                            }}
                            style={{
                              fontSize: '11px',
                              padding: '4px 6px',
                              borderRadius: '6px',
                              border: '0.5px solid var(--color-border)',
                              background: 'var(--color-bg)',
                              color: 'var(--color-text)',
                              outline: 'none',
                              width: '100%'
                            }}
                          />
                        </div>
                      </div>

                      {/* Botón de Aplicar */}
                      <button
                        type="button"
                        onClick={() => setShowCalendarPopover(false)}
                        className="btn-primary"
                        style={{
                          height: '28px',
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '6px',
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '4px',
                          padding: '0'
                        }}
                      >
                        Aplicar Filtro
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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
              <div 
                className="dashboard-grid-resizable" 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(12, 1fr)', 
                  gridAutoFlow: 'dense',
                  gridAutoRows: '10px',
                  gap: '24px',
                  alignItems: 'start'
                }}
              >
                {activeDashboard.widgets.map((widget) => {
                  const isTemp = tempResizing && tempResizing.id === widget.id;
                  const currentCols = isTemp ? tempResizing.gridCols : (widget.gridCols || (() => {
                    const w = widget.width || 'half';
                    if (w === 'third') return 4;
                    if (w === 'two-thirds') return 8;
                    if (w === 'full') return 12;
                    return 6;
                  })());

                  const numericHeight = isTemp ? tempResizing.heightPx : (widget.heightPx ? widget.heightPx : (() => {
                    if (widget.type === 'kpi') return 110;
                    const h = widget.height || 'medium';
                    if (h === 'short') return 220;
                    if (h === 'tall') return 460;
                    if (h === 'extra-tall') return 580;
                    return 340;
                  })());

                  const currentHeight = widget.type === 'kpi' && !isTemp ? 'auto' : `${numericHeight}px`;
                  const rowSpan = Math.ceil((numericHeight + 24) / 34);

                  const isDragging  = draggingWidgetId === widget.id;
                  const isDropTarget = dragOverWidgetId === widget.id;

                  return (
                    <div
                      key={widget.id}
                      data-widget-id={widget.id}
                      className="card animate-fade-in"
                      style={{
                        gridColumn: `span ${currentCols}`,
                        gridRow: `span ${rowSpan}`,
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        height: currentHeight,
                        minHeight: widget.type === 'kpi' ? 'auto' : '180px',
                        overflow: 'hidden',
                        transition: draggingWidgetId ? 'box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease' : 'all 0.3s ease',
                        opacity: isDragging ? 0.35 : 1,
                        pointerEvents: isDragging ? 'none' : undefined,
                        outline: isDropTarget ? '2.5px solid var(--teal)' : isDragging ? '2px dashed var(--color-border)' : 'none',
                        outlineOffset: '2px',
                        boxShadow: isDropTarget
                          ? '0 0 0 4px var(--teal-bg), 0 8px 24px rgba(29,158,117,0.18)'
                          : undefined,
                        zIndex: isDropTarget ? 10 : 1
                      }}
                    >
                      <div 
                        className="card-header" 
                        onPointerDown={(e) => {
                          if (isEditing) {
                            handleDragStart(e, widget.id);
                          }
                        }}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          borderBottom: widget.type === 'kpi' ? 'none' : '1px solid var(--color-border)', 
                          paddingBottom: widget.type === 'kpi' ? 0 : 12, 
                          marginBottom: widget.type === 'kpi' ? 4 : 12,
                          cursor: isEditing ? 'move' : 'default',
                          userSelect: isEditing ? 'none' : 'auto'
                        }}
                      >
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
                      
                      <div style={{
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: widget.type === 'map' ? 'stretch' : 'center',
                        pointerEvents: isEditing ? 'none' : 'auto'
                      }}>
                        <WidgetErrorBoundary>
                          {renderWidgetContent(widget)}
                        </WidgetErrorBoundary>
                      </div>

                      {isEditing && (
                        <div
                          onPointerDown={(e) => handleResizeStart(e, widget)}
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: '22px',
                            height: '22px',
                            cursor: 'se-resize',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'flex-end',
                            padding: '4px',
                            zIndex: 25
                          }}
                          title="Arrastrar para redimensionar"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round">
                            <line x1="2" y1="8" x2="8" y2="2" />
                            <line x1="5" y1="8" x2="8" y2="5" />
                          </svg>
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
                      gridRow: 'span 6',
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      borderStyle: 'dashed', 
                      borderWidth: '2px', 
                      borderColor: 'var(--teal)',
                      cursor: 'pointer',
                      height: '180px',
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
                  }}
                >
                  <option value="blank">Lienzo en Blanco (Empezar de cero)</option>
                  <option value="water_meters">Medidores de Agua (KPIs + Caudales preconfigurados)</option>
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
          <div className="slide-over-drawer wide-drawer" onClick={(e) => e.stopPropagation()}>
            
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
            <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 20px' }}>
              
              {/* 1. SELECCIÓN DE TIPO DE VISUALIZACIÓN */}
              <div className="drawer-form-section">
                <div className="drawer-form-section-title">1. Tipo de Visualización *</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '12px'
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
                          <span style={{ fontSize: '10px', zIndex: 1, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={10} style={{ color: 'var(--teal)' }} /> Pin GPS
                          </span>
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
                        padding: '12px 10px',
                        cursor: 'pointer',
                        background: newWidgetType === item.value ? 'var(--teal-bg)' : 'var(--color-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: newWidgetType === item.value ? '0 4px 12px rgba(29,158,117,0.12)' : 'none'
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 650, color: newWidgetType === item.value ? 'var(--teal-dark)' : 'var(--color-text)' }}>
                        {item.label}
                      </span>
                      {item.preview}
                      <span style={{ fontSize: '10px', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {item.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. INFORMACIÓN GENERAL Y ASPECTO */}
              <div className="drawer-form-section">
                <div className="drawer-form-section-title">2. Información General e Icono</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Título del Panel *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Ej. Caudal Zona Norte, Sensor Llenado..." 
                      value={newWidgetTitle} 
                      onChange={(e) => setNewWidgetTitle(e.target.value)}
                      style={{ height: '42px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Icono Visual</label>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: '6px'
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
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: newWidgetIcon === icName ? 'var(--teal-bg)' : 'var(--color-surface)',
                            borderColor: newWidgetIcon === icName ? 'var(--teal)' : 'var(--color-border)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            height: '42px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ color: newWidgetIcon === icName ? 'var(--teal-dark)' : 'var(--color-text)', display: 'inline-flex' }}>
                            {renderDashboardIcon(icName, 16)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. CONFIGURACIÓN DEL ORIGEN DE DATOS */}
              {newWidgetType !== 'bar' && newWidgetType !== 'map' && (
                <div className="drawer-form-section">
                  <div className="drawer-form-section-title">3. Origen de Datos</div>

                  {/* Selector de Origen para Línea */}
                  {newWidgetType === 'line' && (
                    <div style={{ marginBottom: 12 }}>
                      <label className="form-label" style={{ fontWeight: 650, display: 'block', marginBottom: 6 }}>
                        Tipo de Origen para Historial *
                      </label>
                      <div style={{ display: 'flex', gap: 20 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="radio" name="widgetSourceType" checked={newWidgetSourceType === 'single'}
                            onChange={() => { setNewWidgetSourceType('single'); setNewWidgetDeviceGroupId(''); }}
                            style={{ accentColor: 'var(--teal)' }} />
                          <span style={{ fontWeight: 500 }}>Dispositivo Único</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="radio" name="widgetSourceType" checked={newWidgetSourceType === 'group'}
                            onChange={() => { setNewWidgetSourceType('group'); setNewWidgetDevice(''); }}
                            style={{ accentColor: 'var(--teal)' }} />
                          <span style={{ fontWeight: 500 }}>Grupo de Dispositivos</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Selector de Origen para Tabla */}
                  {newWidgetType === 'table' && (
                    <div style={{ marginBottom: 12 }}>
                      <label className="form-label" style={{ fontWeight: 650, display: 'block', marginBottom: 6 }}>
                        Tipo de Origen de la Tabla *
                      </label>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="radio" name="widgetSourceType" checked={newWidgetSourceType === 'single'}
                            onChange={() => { setNewWidgetSourceType('single'); setNewWidgetDeviceGroupId(''); setNewWidgetSelectedDevices([]); }}
                            style={{ accentColor: 'var(--teal)' }} />
                          <span style={{ fontWeight: 500 }}>Dispositivo Único</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="radio" name="widgetSourceType" checked={newWidgetSourceType === 'multi'}
                            onChange={() => { setNewWidgetSourceType('multi'); setNewWidgetDevice(''); setNewWidgetDeviceGroupId(''); }}
                            style={{ accentColor: 'var(--teal)' }} />
                          <span style={{ fontWeight: 500 }}>Múltiples Dispositivos</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="radio" name="widgetSourceType" checked={newWidgetSourceType === 'group'}
                            onChange={() => { setNewWidgetSourceType('group'); setNewWidgetDevice(''); setNewWidgetSelectedDevices([]); }}
                            style={{ accentColor: 'var(--teal)' }} />
                          <span style={{ fontWeight: 500 }}>Grupo de Dispositivos</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* CASO A: Dispositivo Único */}
                  {(newWidgetType === 'kpi' ||
                    (newWidgetType === 'line' && newWidgetSourceType === 'single') ||
                    (newWidgetType === 'table' && newWidgetSourceType === 'single')
                  ) && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
                        Seleccionar Dispositivo *
                      </label>
                      <select
                        className="form-input"
                        value={newWidgetDevice}
                        onChange={(e) => {
                          setNewWidgetDevice(e.target.value);
                          const dev = devices.find(d => d.devEUI === e.target.value);
                          if (dev) {
                            if (dev.deviceType === 'water_meter') { setNewWidgetMetric('flow'); setNewWidgetUnit('L/h'); setNewWidgetColor('teal'); }
                            else { setNewWidgetMetric('fillLevel'); setNewWidgetUnit('%'); setNewWidgetColor('amber'); }
                          }
                        }}
                        style={{ height: '42px' }}
                      >
                        <option value="">Selecciona un dispositivo...</option>
                        {filteredDevices.map(d => (
                          <option key={d.devEUI} value={d.devEUI}>
                            {d.name} ({d.deviceType === 'water_meter' ? 'Medidor' : 'SmartBin'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* CASO B: Múltiples Dispositivos (Solo Tabla) */}
                  {newWidgetType === 'table' && newWidgetSourceType === 'multi' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                          Selecciona los Dispositivos a Combinar *
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="btn-secondary"
                            onClick={() => setNewWidgetSelectedDevices(filteredDevices.map(d => d.devEUI))}
                            style={{ padding: '2px 8px', fontSize: 11, height: 24, minWidth: 'auto' }}>Todos</button>
                          <button type="button" className="btn-secondary"
                            onClick={() => setNewWidgetSelectedDevices([])}
                            style={{ padding: '2px 8px', fontSize: 11, height: 24, minWidth: 'auto' }}>Limpiar</button>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-muted)' }}>
                        Elige 2 o más sensores. Sus telemetrías aparecerán combinadas con una columna "Dispositivo".
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, background: 'var(--color-bg)' }}>
                        {filteredDevices.map(d => {
                          const isSel = newWidgetSelectedDevices.includes(d.devEUI);
                          return (
                            <label key={d.devEUI} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 6px', borderRadius: 6, background: isSel ? 'var(--teal-bg)' : 'transparent', cursor: 'pointer', userSelect: 'none' }}>
                              <input type="checkbox" checked={isSel} style={{ accentColor: 'var(--teal)' }}
                                onChange={(e) => {
                                  if (e.target.checked) setNewWidgetSelectedDevices([...newWidgetSelectedDevices, d.devEUI]);
                                  else setNewWidgetSelectedDevices(newWidgetSelectedDevices.filter(id => id !== d.devEUI));
                                }} />
                              <span style={{ fontWeight: 550 }}>{d.name}</span>
                              <span style={{ fontSize: 10, color: 'var(--color-hint)', fontFamily: 'monospace', marginLeft: 'auto' }}>{d.devEUI}</span>
                            </label>
                          );
                        })}
                        {filteredDevices.length === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--color-hint)', textAlign: 'center', padding: 12 }}>
                            No hay dispositivos disponibles para este cliente.
                          </div>
                        )}
                      </div>
                      {newWidgetSelectedDevices.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--teal-dark)', marginTop: 6, fontWeight: 500 }}>
                          {newWidgetSelectedDevices.length} dispositivo{newWidgetSelectedDevices.length !== 1 ? 's' : ''} seleccionado{newWidgetSelectedDevices.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* CASO C: Grupo de Dispositivos (Línea o Tabla) */}
                  {((newWidgetType === 'line' || newWidgetType === 'table') && newWidgetSourceType === 'group') && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
                        Seleccionar Grupo de Dispositivos *
                      </label>
                      {filteredGroups.length === 0 ? (
                        <div style={{ padding: '12px', border: '1px dashed var(--color-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-muted)', textAlign: 'center' }}>
                          No hay grupos creados para este cliente. Ve a la pantalla de Dashboard → pestaña "Grupos" para crear uno.
                        </div>
                      ) : (
                        <select
                          className="form-input"
                          value={newWidgetDeviceGroupId}
                          onChange={(e) => {
                            setNewWidgetDeviceGroupId(e.target.value);
                            const grp = deviceGroups.find(g => g.id === e.target.value) ||
                              (JSON.parse(localStorage.getItem('device_groups') || '[]') as DeviceGroup[]).find(g => g.id === e.target.value);
                            if (grp) {
                              if (grp.deviceType === 'water_meter') { setNewWidgetMetric('flow'); setNewWidgetUnit('L/h'); setNewWidgetColor('teal'); }
                              else { setNewWidgetMetric('fillLevel'); setNewWidgetUnit('%'); setNewWidgetColor('amber'); }
                            }
                          }}
                          style={{ height: '42px' }}
                        >
                          <option value="">Selecciona un grupo...</option>
                          {filteredGroups.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.deviceType === 'water_meter' ? 'Medidores' : 'SmartBins'}) — {g.deviceEUIs.length} dispositivos
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. CONFIGURACIÓN DE COLUMNAS (TABLA BITÁCORA) */}
              {newWidgetType === 'table' && (() => {
                const selectedDeviceTelemetry = telemetryHistory[newWidgetDevice] || [];
                const latestTelemetry = selectedDeviceTelemetry[0];
                const detectedParams = latestTelemetry && latestTelemetry.decodedPayload
                  ? Object.keys(latestTelemetry.decodedPayload)
                  : [];

                return (
                  <div className="drawer-form-section">
                    <div className="drawer-form-section-title">4. Columnas de la Tabla a Mostrar</div>
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
                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const defaultWater = resolveTableColumns(undefined, 'water_meter');
                          setNewWidgetTableColumns(defaultWater);
                        }}
                        style={{ padding: '6px 12px', fontSize: '12px', height: '36px', minWidth: 'auto', flex: 1 }}
                      >
                        Preset Medidor
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const defaultBin = resolveTableColumns(undefined, 'smartbin');
                          setNewWidgetTableColumns(defaultBin);
                        }}
                        style={{ padding: '6px 12px', fontSize: '12px', height: '36px', minWidth: 'auto', flex: 1 }}
                      >
                        Preset SmartBin
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setNewWidgetTableColumns([])}
                        style={{ padding: '6px 12px', fontSize: '12px', height: '36px', minWidth: 'auto', flex: 0.5 }}
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 5. SELECCIÓN DE DISPOSITIVOS MÚLTIPLES */}
              {(newWidgetType === 'map' || newWidgetType === 'bar') && (
                <div className="drawer-form-section">
                  <div className="drawer-form-section-title">3. Dispositivos IoT a Mostrar</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-muted)' }}>
                      Marca los dispositivos que quieras ver. Si no seleccionas ninguno, se mostrarán todos por defecto.
                    </p>
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

              {/* 6. MÉTRICAS Y ASPECTO VISUAL */}
              <div className="drawer-form-section">
                <div className="drawer-form-section-title">4. Configuración Visual y Métricas</div>
                
                {(newWidgetType === 'kpi' || newWidgetType === 'line' || newWidgetType === 'bar') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '10px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Métrica de Telemetría</label>
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
                        style={{ height: '42px' }}
                      >
                        <option value="flow">Caudal en Tiempo Real (flow)</option>
                        <option value="level">Nivel de Agua (level)</option>
                        <option value="fillLevel">Porcentaje de Llenado (fillLevel)</option>
                        <option value="temperature">Temperatura Sensor (temperature)</option>
                        <option value="battery">Nivel de Batería (battery)</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Unidad de Medida</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ej. L/h, %, °C, cm" 
                        value={newWidgetUnit} 
                        onChange={(e) => setNewWidgetUnit(e.target.value)}
                        style={{ height: '42px' }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Ancho en Cuadrícula</label>
                    <select 
                      className="form-input" 
                      value={newWidgetWidth} 
                      onChange={(e: any) => setNewWidgetWidth(e.target.value)}
                      disabled={newWidgetType === 'map' || newWidgetType === 'table'}
                      style={{ height: '42px' }}
                    >
                      <option value="third">1/3 Ancho (Pequeño)</option>
                      <option value="half">1/2 Ancho (Mediano)</option>
                      <option value="two-thirds">2/3 Ancho (Grande)</option>
                      <option value="full">100% Ancho (Fila Completa)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Largo (Altura)</label>
                    <select 
                      className="form-input" 
                      value={newWidgetHeight} 
                      onChange={(e: any) => setNewWidgetHeight(e.target.value)}
                      disabled={newWidgetType === 'kpi'}
                      style={{ height: '42px' }}
                    >
                      <option value="short">Corto (220px)</option>
                      <option value="medium">Mediano (340px)</option>
                      <option value="tall">Alto (460px)</option>
                      <option value="extra-tall">Extra Alto (580px)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Color de Acento</label>
                    <select 
                      className="form-input" 
                      value={newWidgetColor} 
                      onChange={(e: any) => setNewWidgetColor(e.target.value)}
                      style={{ height: '42px' }}
                    >
                      <option value="teal">Verde Esmeralda (Teal)</option>
                      <option value="blue">Azul Océano (Blue)</option>
                      <option value="amber">Naranja Ámbar (Amber)</option>
                      <option value="purple">Púrpura Profundo (Purple)</option>
                      <option value="red">Rojo Alerta (Red)</option>
                      <option value="gray">Gris Neutro (Gray)</option>
                    </select>
                  </div>
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
                disabled={(() => {
                  if (!newWidgetTitle.trim()) return true;
                  if (newWidgetType === 'bar' || newWidgetType === 'map') return false;
                  if (newWidgetSourceType === 'single') return !newWidgetDevice;
                  if (newWidgetSourceType === 'multi') return newWidgetSelectedDevices.length < 2;
                  return !newWidgetDeviceGroupId; // group
                })()}
                style={{
                  opacity: (() => {
                    if (!newWidgetTitle.trim()) return 0.6;
                    if (newWidgetType === 'bar' || newWidgetType === 'map') return 1;
                    if (newWidgetSourceType === 'single') return newWidgetDevice ? 1 : 0.6;
                    if (newWidgetSourceType === 'multi') return newWidgetSelectedDevices.length >= 2 ? 1 : 0.6;
                    return newWidgetDeviceGroupId ? 1 : 0.6;
                  })(),
                  cursor: (() => {
                    if (!newWidgetTitle.trim()) return 'not-allowed';
                    if (newWidgetType === 'bar' || newWidgetType === 'map') return 'pointer';
                    if (newWidgetSourceType === 'single') return newWidgetDevice ? 'pointer' : 'not-allowed';
                    if (newWidgetSourceType === 'multi') return newWidgetSelectedDevices.length >= 2 ? 'pointer' : 'not-allowed';
                    return newWidgetDeviceGroupId ? 'pointer' : 'not-allowed';
                  })()
                }}
              >
                {drawerMode === 'add' ? 'Agregar Panel' : 'Guardar Cambios'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE: CREAR / EDITAR GRUPO DE DISPOSITIVOS */}
      {isGroupDrawerOpen && (
        <div className="slide-over-overlay" onClick={() => { setIsGroupDrawerOpen(false); setGroupDrawerMode(null); setEditingGroup(null); }}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  {groupDrawerMode === 'add' ? 'Crear Grupo de Dispositivos' : 'Editar Grupo'}
                </h3>
                <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: 'var(--color-muted)' }}>
                  Agrupa sensores del mismo tipo para compararlos en paneles de línea o tabla.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => { setIsGroupDrawerOpen(false); setGroupDrawerMode(null); setEditingGroup(null); }} style={{ padding: 6, minWidth: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {user?.role === 'superadmin' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Tenant / Cliente</label>
                  <select 
                    className="form-input" 
                    value={groupOrgId} 
                    onChange={(e) => { 
                      setGroupOrgId(e.target.value); 
                      setGroupSelectedDevices([]); // Limpiar selección previa al cambiar de tenant
                    }}
                  >
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Nombre del Grupo *</label>
                <input type="text" className="form-input" placeholder="Ej. Medidores Sector Norte" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Tipo de Dispositivos</label>
                <select className="form-input" value={groupType} onChange={(e: any) => { setGroupType(e.target.value); setGroupSelectedDevices([]); }}>
                  <option value="water_meter">Medidores de Agua</option>
                  <option value="smartbin">SmartBins (Contenedores)</option>
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Dispositivos del Grupo *</label>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{groupSelectedDevices.length} seleccionados</span>
                </div>
                <input type="text" className="form-input" placeholder="Buscar dispositivo..." value={groupDeviceSearch} onChange={(e) => setGroupDeviceSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, background: 'var(--color-bg)' }}>
                  {groupFilteredDevices.map(d => {
                    const isSel = groupSelectedDevices.includes(d.devEUI);
                    return (
                      <label key={d.devEUI} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', borderRadius: 6, background: isSel ? 'var(--teal-bg)' : 'transparent', cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={isSel} style={{ accentColor: 'var(--teal)' }}
                          onChange={(e) => {
                            if (e.target.checked) setGroupSelectedDevices([...groupSelectedDevices, d.devEUI]);
                            else setGroupSelectedDevices(groupSelectedDevices.filter(id => id !== d.devEUI));
                          }} />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--color-hint)', fontFamily: 'monospace' }}>{d.devEUI}</span>
                        </div>
                      </label>
                    );
                  })}
                  {groupFilteredDevices.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--color-hint)', textAlign: 'center', padding: 16 }}>
                      {groupAvailableDevices.length === 0 ? 'No hay dispositivos de este tipo asignados.' : 'Sin resultados para la búsqueda.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => { setIsGroupDrawerOpen(false); setGroupDrawerMode(null); setEditingGroup(null); }}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveGroup} disabled={!groupName.trim() || groupSelectedDevices.length === 0}>
                {groupDrawerMode === 'add' ? 'Crear Grupo' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificación flotante de alertas en tiempo real (Rule Engine Toast) */}
      {activeToast && (
        <div 
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: activeToast.severity === 'critical' ? '#ef4444' : activeToast.severity === 'warning' ? '#f59e0b' : '#0d9488',
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 380,
            animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {activeToast.severity === 'critical' || activeToast.severity === 'warning' ? (
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{activeToast.title}</div>
            <div style={{ fontSize: 11, marginTop: 2, opacity: 0.95, lineHeight: 1.4 }}>{activeToast.message}</div>
          </div>
          <button 
            onClick={() => setActiveToast(null)} 
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              color: 'inherit',
              cursor: 'pointer',
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12
            }}
          >
            ×
          </button>
        </div>
      )}

    </div>
  );
}
