export type Role = 'superadmin' | 'admin' | 'operator';
export type DeviceType = 'water_meter' | 'smartbin' | 'unknown';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string;
  password?: string;
  createdAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  createdAt?: string;
}

export interface Device {
  id: string;
  devEUI: string;
  name: string;
  description?: string;
  deviceType: DeviceType;
  active: boolean;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
  lastTelemetry?: TelemetryRecord;
  staticParams?: Record<string, any>;
  organizationId?: string;
  valveOpen?: boolean;
  codecJs?: string;
}

export interface AuditLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  details?: string;
  ipAddress: string;
  organizationId?: string;
  createdAt: string;
}

export interface TelemetryRecord {
  id: string;
  devEUI: string;
  fPort: number;
  fCnt: number;
  rssi: number;
  snr: number;
  spreadingFactor: number;
  rawPayload: string;
  decodedPayload: WaterMeterPayload | SmartBinPayload | Record<string, any>;
  gatewayId: string;
  receivedAt: string;
}

export interface WaterMeterPayload {
  level?: number;        // cm o mm
  flow?: number;         // L/h
  temperature?: number;  // °C
  pressure?: number;     // bar
  totalConsumption?: number; // m³ acumulado
  alertLeak?: boolean;
  alertOverflow?: boolean;
  alertFrost?: boolean;
  alertTamper?: boolean;
  battery?: number;      // %
}

export interface SmartBinPayload {
  fillLevel?: number;    // %
  temperature?: number;  // °C
  lat?: number;
  lng?: number;
  battery?: number;      // %
}

export interface Alert {
  id: string;
  devEUI: string;
  deviceName?: string;
  type: 'leak' | 'overflow' | 'frost' | 'tamper' | 'bin_full' | 'offline' | 'battery';
  message: string;
  severity: 'critical' | 'warning' | 'info';
  acknowledged: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalDevices: number;
  activeDevices: number;
  offlineDevices: number;
  activeAlerts: number;
  waterMeters: number;
  smartBins: number;
  avgFillLevel: number;
}

export interface Integration {
  id: string;
  name: string;
  description?: string;
  secret: string;
  decoderCode: string;
  createdAt: string;
  updatedAt: string;
  organizationId?: string;
}

export type WidgetType = 'kpi' | 'line' | 'bar' | 'map' | 'table';

export interface TableColumnConfig {
  key: string;
  label: string;
  unit?: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  deviceEUI?: string;       // devEUI target (or 'all' for comparative bar/map)
  deviceGroupId?: string;    // target Device Group ID (for comparative lines)
  selectedDevices?: string[]; // selected device EUIs for map/bar widgets
  metricKey?: string;       // flow, level, fillLevel, temperature, battery, etc.
  metricUnit?: string;      // e.g. L/h, %, °C
  color?: 'teal' | 'blue' | 'amber' | 'purple' | 'red' | 'gray';
  width: 'third' | 'half' | 'two-thirds' | 'full';   // column width in the dashboard grid
  height?: 'short' | 'medium' | 'tall' | 'extra-tall'; // panel height in the dashboard grid
  icon?: string;            // icon chosen for the panel
  tableColumns?: (string | TableColumnConfig)[];   // selected columns to show in a table widget
}

export interface CustomDashboard {
  id: string;
  name: string;
  icon: string;             // lucide icon name (e.g. 'Droplets', 'Trash2', etc.)
  isPreset: boolean;
  presetType?: 'general' | 'water_meters' | 'smartbins';
  widgets: DashboardWidget[];
  organizationId?: string;
}

export interface DeviceGroup {
  id: string;
  name: string;
  deviceType: 'water_meter' | 'smartbin';
  deviceEUIs: string[];
  organizationId?: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  name: string;
  deviceEUI?: string;       // EUI de dispositivo específico (vacío si es por grupo o todos)
  deviceGroupId?: string;   // ID de grupo de dispositivos
  applyToAll: boolean;      // Si se aplica a todos los dispositivos del tipo seleccionado
  deviceType: 'water_meter' | 'smartbin';
  metricKey: string;        // Métrica a analizar: flow, level, fillLevel, temperature, battery, etc.
  operator: '<' | '>' | '<=' | '>=' | '==';
  thresholdValue: number;   // Valor límite
  severity: 'critical' | 'warning' | 'info';
  messageTemplate: string;  // Mensaje a mostrar, ej. "Alerta: {deviceName} reportó {value} L/h"
  active: boolean;
  organizationId: string;   // Aislamiento multi-tenant
  createdAt: string;
}
