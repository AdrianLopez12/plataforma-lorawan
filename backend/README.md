# LoRaWAN Application Server

Application Server para recibir uplinks desde **Tektelic KORE** vía HTTP Webhook, decodificar payloads y almacenarlos en PostgreSQL.

## Stack
- **NestJS** + TypeScript
- **PostgreSQL 16** (Docker)
- **TypeORM**

## Arranque rápido

```bash
# 1. Levantar PostgreSQL
docker compose up -d

# 2. Variables de entorno
cp .env.example .env

# 3. Instalar y arrancar
npm install
npm run start:dev
```

Servidor en `http://localhost:3000`

## Endpoints

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | /webhook/uplink | Recibe uplinks de Tektelic KORE |
| GET  | /devices | Lista dispositivos |
| GET  | /devices/:devEUI | Detalle dispositivo |
| PATCH| /devices/:devEUI | Actualizar nombre/descripción |
| GET  | /telemetry | Últimos 50 registros |
| GET  | /telemetry/:devEUI | Telemetría por dispositivo |

## Configurar en Tektelic KORE

- **URL:** `http://TU_IP:3000/webhook/uplink`
- **Header:** `Authorization: Bearer <TEKTELIC_WEBHOOK_SECRET>`

## Probar localmente

```bash
curl -X POST http://localhost:3000/webhook/uplink \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cambia_este_secreto_seguro" \
  -d '{
    "devEUI": "0102030405060708",
    "fPort": 1,
    "fCnt": 1,
    "data": "075800",
    "rxInfo": [{ "gatewayId": "aabbccddee", "rssi": -80, "loRaSNR": 7.5 }],
    "txInfo": { "dataRate": { "spreadFactor": 7 } }
  }'
```

## Agregar decoders

Edita `src/telemetry/decoder.service.ts` → agrega un `case` por cada fPort de tus dispositivos.
