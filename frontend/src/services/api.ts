import axios from 'axios';
import type { Device, TelemetryRecord } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// Mapeo estático de coordenadas para simulación de mapa
const MOCK_COORDS: Record<string, { lat: number; lng: number; deviceType: 'water_meter' | 'smartbin' }> = {
  '0102030405060708': { lat: -0.1910, lng: -78.4820, deviceType: 'water_meter' },
  'AA01020304050607': { lat: -0.1807, lng: -78.4678, deviceType: 'water_meter' },
  'AA02030405060708': { lat: -0.2105, lng: -78.4892, deviceType: 'water_meter' },
  'BB01020304050607': { lat: -0.1950, lng: -78.5012, deviceType: 'smartbin' },
  'BC01020304050607': { lat: -0.1950, lng: -78.5012, deviceType: 'smartbin' },
  'BB02030405060708': { lat: -0.1720, lng: -78.4780, deviceType: 'smartbin' },
  'BC02030405060708': { lat: -0.1720, lng: -78.4780, deviceType: 'smartbin' },
  'AA03040506070809': { lat: -0.2310, lng: -78.5150, deviceType: 'water_meter' },
};

// Adivina el tipo de dispositivo basado en DevEUI o nombre
export const guessDeviceType = (devEUI: string, name?: string): 'water_meter' | 'smartbin' | 'unknown' => {
  if (MOCK_COORDS[devEUI]) return MOCK_COORDS[devEUI].deviceType;
  const lowerName = (name || '').toLowerCase();
  if (
    lowerName.includes('bin') ||
    devEUI.startsWith('BB') ||
    devEUI.startsWith('BC') ||
    lowerName.includes('moko') ||
    lowerName.includes('milesight')
  )
    return 'smartbin';
  if (lowerName.includes('meter') || lowerName.includes('medidor') || devEUI.startsWith('AA')) return 'water_meter';
  return 'unknown';
};

// Obtiene coordenadas basadas en DevEUI
export const guessCoordinates = (devEUI: string, index = 0): { lat: number; lng: number } => {
  if (MOCK_COORDS[devEUI]) {
    return { lat: MOCK_COORDS[devEUI].lat, lng: MOCK_COORDS[devEUI].lng };
  }
  const baseLat = -0.1950;
  const baseLng = -78.4900;
  const offset = 0.008 * (index + 1) * Math.sin(index);
  const offsetLng = 0.008 * (index + 1) * Math.cos(index);
  return { lat: baseLat + offset, lng: baseLng + offsetLng };
};

// Integrations
export const getIntegrations = () => api.get('/integrations').then((r) => r.data);
export const getIntegration = (id: string) => api.get(`/integrations/${id}`).then((r) => r.data);
export const createIntegration = (data: { name: string; description?: string; preset?: string; organizationId?: string }) =>
  api.post('/integrations', data).then((r) => r.data);
export const updateIntegration = (id: string, data: any) =>
  api.patch(`/integrations/${id}`, data).then((r) => r.data);
export const deleteIntegration = (id: string) => api.delete(`/integrations/${id}`).then((r) => r.data);

// Devices
export const getRawDevices = (integrationId?: string) =>
  api.get('/devices', { params: { integrationId } }).then((r) => r.data);
export const getDevice = (devEUI: string) => api.get(`/devices/${devEUI}`).then((r) => r.data);
export const updateDevice = (devEUI: string, data: any) => api.patch(`/devices/${devEUI}`, data).then((r) => r.data);

// Webhook & Decoder
export const getWebhookConfig = () => api.get('/webhook/config').then((r) => r.data);
export const getDecoderCode = () => api.get('/telemetry/decoder').then((r) => r.data);
export const saveDecoderCode = (code: string) => api.post('/telemetry/decoder', { code }).then((r) => r.data);
export const postWebhookUplink = (integrationId: string, payload: any, token: string) => {
  return axios.post(`http://localhost:3000/webhook/uplink/${integrationId}`, payload, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).then((r) => r.data);
};

// Telemetry
export const getTelemetry = (limit = 50, integrationId?: string) =>
  api.get('/telemetry', { params: { limit, integrationId } }).then((r) => r.data);
export const getDeviceTelemetry = (devEUI: string, limit = 100) =>
  api.get(`/telemetry/${devEUI}?limit=${limit}`).then((r) => r.data);

// Obtiene los dispositivos enriquecidos con su última telemetría y coordenadas
export const getDevices = async (integrationId?: string): Promise<Device[]> => {
  try {
    const rawDevices: any[] = await getRawDevices(integrationId);
    
    if (!rawDevices || rawDevices.length === 0) {
      return [];
    }

    const enriched = await Promise.all(
      rawDevices.map(async (d, index) => {
        let lastTelemetry: TelemetryRecord | undefined = undefined;
        try {
          const telemetryList = await getDeviceTelemetry(d.devEUI, 1);
          if (telemetryList && telemetryList.length > 0) {
            lastTelemetry = telemetryList[0];
          }
        } catch (e) {
          console.warn(`Error al cargar telemetría para ${d.devEUI}`, e);
        }

        const devType = d.deviceType || guessDeviceType(d.devEUI, d.name);
        
        let staticLat = d.lat;
        let staticLng = d.lng;
        let staticParams: any = {};

        try {
          const storedParams = localStorage.getItem('device_static_parameters');
          if (storedParams) {
            const parsed = JSON.parse(storedParams);
            if (parsed && parsed[d.devEUI]) {
              staticParams = parsed[d.devEUI];
              if (staticParams.lat !== undefined && staticParams.lat !== null) {
                staticLat = Number(staticParams.lat);
              }
              if (staticParams.lng !== undefined && staticParams.lng !== null) {
                staticLng = Number(staticParams.lng);
              }
            }
          }
        } catch (e) {
          console.warn('Error reading device_static_parameters', e);
        }

        if (staticLat === undefined || staticLat === null || staticLng === undefined || staticLng === null) {
          const coords = guessCoordinates(d.devEUI, index);
          staticLat = coords.lat;
          staticLng = coords.lng;
        }

        // Allow custom alias/label overriding device name if provided
        const displayName = staticParams.customAlias || d.name || `Dispositivo ${d.devEUI.substring(0, 6)}`;

        return {
          ...d,
          name: displayName,
          deviceType: devType,
          lat: staticLat,
          lng: staticLng,
          staticParams,
          lastTelemetry,
        } as Device;
      })
    );

    return enriched;
  } catch (error) {
    console.error('Error obteniendo dispositivos enriquecidos:', error);
    throw error;
  }
};

export default api;
