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

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  deviceEUI?: string;       // devEUI target (or 'all' for comparative bar/map)
  selectedDevices?: string[]; // selected device EUIs for map/bar widgets
  metricKey?: string;       // flow, level, fillLevel, temperature, battery, etc.
  metricUnit?: string;      // e.g. L/h, %, °C
  color?: 'teal' | 'blue' | 'amber' | 'purple' | 'red' | 'gray';
  width: 'third' | 'half' | 'two-thirds' | 'full';   // column width in the dashboard grid
  icon?: string;            // icon chosen for the panel
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
