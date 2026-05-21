import type { Device, TelemetryRecord, Alert, DashboardStats } from '../types';

export const MOCK_DEVICES: Device[] = [
  {
    id: '1', devEUI: 'AA01020304050607', name: 'Medidor Zona Norte 01',
    deviceType: 'water_meter', active: true, lat: -0.1807, lng: -78.4678,
    createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z',
    lastTelemetry: {
      id: 't1', devEUI: 'AA01020304050607', fPort: 1, fCnt: 210,
      rssi: -78, snr: 8.5, spreadingFactor: 7, rawPayload: 'AQID',
      decodedPayload: { level: 142, flow: 3.2, temperature: 18.4, pressure: 1.8, totalConsumption: 1240.5, alertLeak: false, battery: 87 },
      gatewayId: 'GW001', receivedAt: new Date(Date.now() - 120000).toISOString(),
    },
  },
  {
    id: '2', devEUI: 'AA02030405060708', name: 'Medidor Zona Sur 03',
    deviceType: 'water_meter', active: true, lat: -0.2105, lng: -78.4892,
    createdAt: '2024-02-05T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z',
    lastTelemetry: {
      id: 't2', devEUI: 'AA02030405060708', fPort: 1, fCnt: 88,
      rssi: -92, snr: 4.1, spreadingFactor: 9, rawPayload: 'AQID',
      decodedPayload: { level: 98, flow: 0, temperature: 17.1, pressure: 1.2, totalConsumption: 540.0, alertLeak: true, battery: 62 },
      gatewayId: 'GW002', receivedAt: new Date(Date.now() - 300000).toISOString(),
    },
  },
  {
    id: '3', devEUI: 'BB01020304050607', name: 'SmartBin Plaza Central',
    deviceType: 'smartbin', active: true, lat: -0.1950, lng: -78.5012,
    createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z',
    lastTelemetry: {
      id: 't3', devEUI: 'BB01020304050607', fPort: 2, fCnt: 55,
      rssi: -85, snr: 6.0, spreadingFactor: 8, rawPayload: 'BQID',
      decodedPayload: { fillLevel: 87, temperature: 28.3, lat: -0.1950, lng: -78.5012, battery: 74 },
      gatewayId: 'GW001', receivedAt: new Date(Date.now() - 600000).toISOString(),
    },
  },
  {
    id: '4', devEUI: 'BB02030405060708', name: 'SmartBin Parque Norte',
    deviceType: 'smartbin', active: true, lat: -0.1720, lng: -78.4780,
    createdAt: '2024-03-15T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z',
    lastTelemetry: {
      id: 't4', devEUI: 'BB02030405060708', fPort: 2, fCnt: 31,
      rssi: -80, snr: 9.2, spreadingFactor: 7, rawPayload: 'BQID',
      decodedPayload: { fillLevel: 34, temperature: 25.1, lat: -0.1720, lng: -78.4780, battery: 91 },
      gatewayId: 'GW002', receivedAt: new Date(Date.now() - 900000).toISOString(),
    },
  },
  {
    id: '5', devEUI: 'AA03040506070809', name: 'Medidor Sector Industrial',
    deviceType: 'water_meter', active: false, lat: -0.2310, lng: -78.5150,
    createdAt: '2024-01-20T00:00:00Z', updatedAt: '2024-05-28T00:00:00Z',
    lastTelemetry: undefined,
  },
];

export const MOCK_ALERTS: Alert[] = [
  { id: 'a1', devEUI: 'AA02030405060708', deviceName: 'Medidor Zona Sur 03', type: 'leak', message: 'Posible fuga detectada — caudal cero con presión activa', severity: 'critical', acknowledged: false, createdAt: new Date(Date.now() - 310000).toISOString() },
  { id: 'a2', devEUI: 'BB01020304050607', deviceName: 'SmartBin Plaza Central', type: 'bin_full', message: 'Nivel de llenado al 87% — requiere recolección', severity: 'warning', acknowledged: false, createdAt: new Date(Date.now() - 620000).toISOString() },
  { id: 'a3', devEUI: 'AA03040506070809', deviceName: 'Medidor Sector Industrial', type: 'offline', message: 'Sin señal hace más de 2 horas', severity: 'warning', acknowledged: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
];

export const MOCK_STATS: DashboardStats = {
  totalDevices: 5, activeDevices: 4, offlineDevices: 1,
  activeAlerts: 2, waterMeters: 3, smartBins: 2, avgFillLevel: 60.5,
};

export function generateTelemetryHistory(devEUI: string, points = 24): TelemetryRecord[] {
  return Array.from({ length: points }, (_, i) => ({
    id: `hist-${i}`, devEUI, fPort: 1, fCnt: i, rssi: -80 + Math.random() * 10,
    snr: 6 + Math.random() * 4, spreadingFactor: 7, rawPayload: '',
    decodedPayload: {
      level: 100 + Math.sin(i / 4) * 40 + Math.random() * 10,
      flow: Math.max(0, 3 + Math.sin(i / 3) * 2 + Math.random()),
      temperature: 18 + Math.sin(i / 6) * 3,
      pressure: 1.5 + Math.random() * 0.5,
    },
    gatewayId: 'GW001',
    receivedAt: new Date(Date.now() - (points - i) * 3600000).toISOString(),
  }));
}
