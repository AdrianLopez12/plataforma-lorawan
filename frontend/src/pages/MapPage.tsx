import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MOCK_DEVICES } from '../services/mockData';
import { getDevices } from '../services/api';
import type { Device, WaterMeterPayload, SmartBinPayload } from '../types';
import { useAuth } from '../context/AuthContext';

// Fix default icons en Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const waterIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#185FA5;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px;">💧</div>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
});

const binIconOk = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#854F0B;border-radius:8px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🗑️</div>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
});

const binIconCritical = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#A32D2D;border-radius:8px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:14px;">⚠️</div>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
});

const center: [number, number] = [-0.1950, -78.4900];

const DEFAULT_DEVICE_MAPPINGS: Record<string, string> = {
  'AA01020304050607': 'org1',
  'AA02030405060708': 'org1',
  'BB01020304050607': 'org1',
  'BB02030405060708': 'org2',
  'AA03040506070809': 'org2',
};

export default function MapPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>(MOCK_DEVICES);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Cargar mappings al iniciar
  useEffect(() => {
    let storedMappings = localStorage.getItem('device_organization_mappings');
    if (!storedMappings) {
      localStorage.setItem('device_organization_mappings', JSON.stringify(DEFAULT_DEVICE_MAPPINGS));
      storedMappings = JSON.stringify(DEFAULT_DEVICE_MAPPINGS);
    }
    setMappings(JSON.parse(storedMappings));
  }, []);

  useEffect(() => {
    getDevices()
      .then((data) => {
        if (data && data.length > 0) {
          setDevices(data);
        }
      })
      .catch((err) => console.warn('Error loading real devices for Map, using mocks:', err));
  }, []);

  const devicesWithCoords = devices.filter((d) => {
    if (!d.lat || !d.lng) return false;

    // Filtro de multi-tenancy
    if (user?.role !== 'superadmin') {
      const deviceOrg = mappings[d.devEUI] || 'org1';
      if (deviceOrg !== user?.organizationId) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="page" style={{ padding: 0, height: '100%' }}>
      <div style={{ padding: '20px 24px 12px' }}>
        <h2 className="page-title">Mapa de dispositivos</h2>
        <p className="page-subtitle">{devicesWithCoords.length} dispositivos georeferenciados</p>
      </div>

      <div style={{ height: 'calc(100vh - 130px)', margin: '0 24px 24px', borderRadius: 12, overflow: 'hidden', border: '0.5px solid var(--color-border-tertiary)' }}>
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {devicesWithCoords.map((d) => {
            const isWater = d.deviceType === 'water_meter';
            const p = d.lastTelemetry?.decodedPayload as any;
            const isCritical = isWater ? p?.alertLeak || p?.alertOverflow : (p?.fillLevel ?? 0) >= 80;
            const icon = isWater ? waterIcon : isCritical ? binIconCritical : binIconOk;

            return (
              <Marker key={d.id} position={[d.lat!, d.lng!]} icon={icon}>
                <Popup>
                  <div style={{ minWidth: 180, fontSize: 13 }}>
                    <strong>{d.name}</strong>
                    <div style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>{d.devEUI}</div>
                    {isWater ? (
                      <>
                        <div>Caudal: <b>{(p as WaterMeterPayload)?.flow?.toFixed(2) ?? '—'} L/h</b></div>
                        <div>Nivel: <b>{(p as WaterMeterPayload)?.level?.toFixed(0) ?? '—'} cm</b></div>
                        <div>Temp: <b>{(p as WaterMeterPayload)?.temperature?.toFixed(1) ?? '—'}°C</b></div>
                        {(p as WaterMeterPayload)?.alertLeak && <div style={{ color: '#A32D2D', marginTop: 4 }}>⚠ Alerta de fuga</div>}
                      </>
                    ) : (
                      <>
                        <div>Llenado: <b>{(p as SmartBinPayload)?.fillLevel ?? '—'}%</b></div>
                        <div>Temp interior: <b>{(p as SmartBinPayload)?.temperature?.toFixed(1) ?? '—'}°C</b></div>
                        {isCritical && <div style={{ color: '#A32D2D', marginTop: 4 }}>⚠ Requiere recolección</div>}
                      </>
                    )}
                  </div>
                </Popup>
                {isCritical && (
                  <Circle center={[d.lat!, d.lng!]} radius={120} pathOptions={{ color: '#E24B4A', fillColor: '#E24B4A', fillOpacity: 0.08, weight: 1 }} />
                )}
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
