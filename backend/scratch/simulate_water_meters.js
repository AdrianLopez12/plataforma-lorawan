const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// 1. Cargar las variables de entorno desde backend/.env manualmente
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value.trim();
      }
    });
    console.log('✅ Variables de entorno cargadas con éxito.');
  } else {
    console.log('⚠️ No se encontró el archivo .env en backend/.env, usando valores por defecto.');
  }
}

loadEnv();

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASS || 'apppass123',
  database: process.env.DB_NAME || 'lorawan_app',
};

// 2. Codificador de payload de Medidor de Agua a Base64
// Formato:
// - Bytes 0-1: Caudal (flow * 100) - Unsigned Short
// - Bytes 2-3: Nivel (level * 10) - Unsigned Short
// - Byte 4: Temperatura (temp) - Signed Byte
// - Bytes 5-8: Consumo Total (totalConsumption * 100) - Unsigned Int
// - Byte 9: Alertas (leak=0x01, overflow=0x02, frost=0x04, tamper=0x08) - Byte
// - Byte 10: Batería (battery) - Byte
function encodePayload(flow, level, temp, totalConsumption, alerts, battery) {
  const buf = Buffer.alloc(11);
  buf.writeUInt16BE(Math.round(flow * 100), 0);
  buf.writeUInt16BE(Math.round(level * 10), 2);
  buf.writeInt8(Math.round(temp), 4);
  buf.writeUInt32BE(Math.round(totalConsumption * 100), 5);
  buf.writeUInt8(alerts, 9);
  buf.writeUInt8(battery, 10);
  return buf.toString('base64');
}

async function run() {
  console.log('=== INICIANDO SIMULACIÓN DE MEDIDORES DE AGUA ===\n');

  // Conectar a la base de datos
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log(`🔌 Conectado a la base de datos PostgreSQL en ${dbConfig.host}:${dbConfig.port}`);
  } catch (err) {
    console.error('❌ Error al conectar a la base de datos:', err.message);
    process.exit(1);
  }

  // A. Borrado completo de telemetría y dispositivos
  try {
    console.log('🗑️ Limpiando tablas de telemetría y dispositivos...');
    await client.query('TRUNCATE TABLE telemetry CASCADE;');
    await client.query('TRUNCATE TABLE devices CASCADE;');
    console.log('✅ Base de datos limpiada correctamente (TRUNCATE completado).\n');
  } catch (err) {
    console.error('❌ Error al limpiar la base de datos:', err.message);
    await client.end();
    process.exit(1);
  } finally {
    await client.end();
  }

  const BASE_URL = 'http://localhost:3000';

  // B. Crear nueva integración de Medidores de Agua
  let integrationId = null;
  let integrationSecret = null;
  console.log('🤖 Creando una nueva integración de tipo "water-meter"...');
  try {
    const res = await fetch(`${BASE_URL}/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integración Medidores de Agua Simulación',
        description: 'Integración creada automáticamente para simular 10 medidores',
        preset: 'water-meter'
      })
    });

    const data = await res.json();
    if (res.status === 201 && data.id && data.secret) {
      integrationId = data.id;
      integrationSecret = data.secret;
      console.log(`✅ Integración creada con éxito! ID: ${integrationId}`);
    } else {
      throw new Error(`La respuesta de creación no contiene los campos esperados: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Falló la creación de integración:', err.message);
    process.exit(1);
  }

  // C. Actualizar el decodificador de la integración para que sea completo
  const fullDecoderCode = `// Decodificador de Medidor de Agua Completo (fPort = 1)
function decode(bytes, port) {
  if (port === 1) {
    const flow = ((bytes[0] << 8) | bytes[1]) / 100;
    const level = ((bytes[2] << 8) | bytes[3]) / 10;
    
    // Decodificar temperatura (con signo, byte 4)
    let temp = bytes[4];
    if (temp > 127) temp -= 256;
    
    // Decodificar consumo total (4 bytes, bytes 5, 6, 7, 8)
    const totalConsumption = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) / 100;
    
    // Alertas (byte 9)
    const alerts = bytes[9] || 0;
    const alertLeak = (alerts & 0x01) !== 0;
    const alertOverflow = (alerts & 0x02) !== 0;
    const alertFrost = (alerts & 0x04) !== 0;
    const alertTamper = (alerts & 0x08) !== 0;
    
    // Batería (byte 10)
    const battery = bytes[10] || 98;
    
    return {
      flow: Number(flow.toFixed(2)),
      level: Number(level.toFixed(1)),
      temperature: Number(temp.toFixed(1)),
      totalConsumption: Number(totalConsumption.toFixed(2)),
      alertLeak,
      alertOverflow,
      alertFrost,
      alertTamper,
      battery
    };
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`;

  console.log('📝 Actualizando código del decodificador para la integración...');
  try {
    const res = await fetch(`${BASE_URL}/integrations/${integrationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decoderCode: fullDecoderCode
      })
    });
    if (res.status === 200) {
      console.log('✅ Decodificador actualizado con soporte para todas las métricas y alertas del frontend!\n');
    } else {
      throw new Error(`Código inesperado al parchar decodificador: ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Falló la actualización del decodificador:', err.message);
    process.exit(1);
  }

  // D. Simulación de 10 Medidores de Agua enviando uplinks y parches
  console.log('📶 Generando y enviando telemetría para 10 Medidores de Agua...');
  const devEUIs = [];
  for (let i = 1; i <= 10; i++) {
    const numStr = String(i).padStart(2, '0');
    const devEUI = `WM000000000000${numStr}`;
    const deviceName = `Medidor Agua Sector A${numStr}`;
    devEUIs.push({ devEUI, name: deviceName });

    // Definir valores realistas e interesantes (algunos con alertas para probar las reglas)
    // Medidor 3 tiene una fuga
    // Medidor 7 tiene un desborde
    // Medidor 9 tiene congelamiento y manipulación
    const flow = i === 3 ? 152.45 : (12.45 + i * 2.3); // Caudal (L/h)
    const level = i === 7 ? 420.5 : (150.0 - i * 5.2); // Nivel (cm)
    const temp = i === 9 ? -2.5 : (16.2 + (i % 3) * 1.5); // Temp (°C)
    const totalConsumption = 1200.45 + i * 45.2; // Consumo acumulado (m³)
    const battery = 98 - i; // Batería (%)
    
    let alerts = 0;
    if (i === 3) alerts |= 0x01; // Leak
    if (i === 7) alerts |= 0x02; // Overflow
    if (i === 9) {
      alerts |= 0x04; // Frost
      alerts |= 0x08; // Tamper
    }

    const payloadBase64 = encodePayload(flow, level, temp, totalConsumption, alerts, battery);

    // 1. Enviar el uplink vía webhook de integración (esto crea el dispositivo en la DB)
    console.log(`\n🔹 [${i}/10] Enviando Uplink para ${deviceName} (DevEUI: ${devEUI})...`);
    console.log(`   Métricas: Caudal=${flow.toFixed(2)}L/h, Nivel=${level.toFixed(1)}cm, Temp=${temp.toFixed(1)}°C, Consumo=${totalConsumption.toFixed(2)}m³, Batería=${battery}%, AlertasBit=${alerts}`);
    try {
      const payload = {
        devEUI,
        fPort: 1,
        fCnt: 100 + i,
        data: payloadBase64,
        rxInfo: [{ gatewayId: 'GATEWAY-SIM-QUITO', rssi: -65 - i, snr: 9.5 - (i * 0.1) }],
        txInfo: { dataRate: { spreadFactor: 7 } }
      };

      const res = await fetch(`${BASE_URL}/webhook/uplink/${integrationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${integrationSecret}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.status === 200 && data.status === 'ok') {
        console.log(`   ✅ Uplink recibido y procesado por el backend.`);
      } else {
        throw new Error(`Error en el uplink: Código ${res.status}, data: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      console.error(`   ❌ Falló el envío del uplink:`, err.message);
      process.exit(1);
    }

    // 2. Actualizar los metadatos del dispositivo mediante PATCH (nombre, tipo de dispositivo, active)
    console.log(`   ⚙️ Actualizando metadatos del dispositivo (nombre y tipo)...`);
    try {
      const res = await fetch(`${BASE_URL}/devices/${devEUI}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deviceName,
          deviceType: 'water_meter',
          active: true
        })
      });

      const data = await res.json();
      if (res.status === 200 && data.deviceType === 'water_meter') {
        console.log(`   ✅ Dispositivo configurado como "water_meter" con nombre "${deviceName}".`);
      } else {
        throw new Error(`Error en el parche de dispositivo: Código ${res.status}, data: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      console.error(`   ❌ Falló la actualización del dispositivo:`, err.message);
      process.exit(1);
    }
  }

  console.log('\n======================================================');
  console.log('🎉 SIMULACIÓN CREADA CON EXITO DE EXTREMO A EXTREMO! 🎉');
  console.log('======================================================');
  console.log(`- Total de medidores registrados: 10`);
  console.log(`- ID de Integración LNS: ${integrationId}`);
  console.log(`- Dispositivos listados:`);
  devEUIs.forEach((d, idx) => {
    console.log(`  ${idx + 1}. [${d.devEUI}] ${d.name}`);
  });
  console.log('\n👉 El frontend recibirá estos datos mediante peticiones en vivo y mostrará las gráficas y alertas correspondientes.');
}

run();
