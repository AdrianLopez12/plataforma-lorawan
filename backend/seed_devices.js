const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({
  host: 'localhost',
  port: 5433,
  user: 'appuser',
  password: 'apppass123',
  database: 'lorawan_app',
});

// Decodificador de Medidor de Agua (fPort = 1)
const WATER_DECODER = `// Decodificador de Medidor de Agua (fPort = 1)
function decode(bytes, port) {
  if (port === 1) {
    const flow = ((bytes[0] << 8) | bytes[1]) / 100;
    const level = ((bytes[2] << 8) | bytes[3]) / 10;
    const alerts = bytes[4] || 0;
    const alertLeak = (alerts & 0x01) !== 0;
    const alertOverflow = (alerts & 0x02) !== 0;
    return {
      flow: Number(flow.toFixed(2)),
      level: Number(level.toFixed(1)),
      alertLeak,
      alertOverflow,
      battery: 98
    };
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`;

async function seed() {
  try {
    console.log('Conectando a PostgreSQL...');
    await client.connect();
    console.log('Conexión exitosa.');

    // 1. Limpiar datos previos
    console.log('Limpiando registros antiguos de telemetría, dispositivos e integraciones...');
    await client.query('DELETE FROM telemetry');
    await client.query('DELETE FROM devices');
    await client.query('DELETE FROM integrations');

    // 2. Insertar Integración para Plásticos Rival
    console.log('Creando integración de medidores para Plásticos Rival...');
    const integrationId = crypto.randomUUID();
    const integrationName = 'Integración Medidores Plásticos Rival';
    const integrationDesc = 'Canal de telemetría de medidores de agua industriales para Plásticos Rival';
    const integrationSecret = 'sec_rival_water_key';

    await client.query(
      `INSERT INTO integrations (id, name, description, secret, "decoderCode", "organizationId", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [integrationId, integrationName, integrationDesc, integrationSecret, WATER_DECODER, 'plasticos_rival']
    );
    console.log(`Integración creada con ID: ${integrationId}`);

    // 3. Crear 10 Medidores de Agua
    console.log('Creando 10 medidores de agua para Plásticos Rival...');
    const devicesList = [];
    for (let i = 1; i <= 10; i++) {
      const id = crypto.randomUUID();
      const devEUI = `AA000000000000${i.toString().padStart(2, '0')}`;
      const name = `Medidor Rival Industrial ${i.toString().padStart(2, '0')}`;
      const description = `Medidor hídrico electromagnético para control de fluidos industriales en planta Plásticos Rival - Línea ${i}`;

      await client.query(
        `INSERT INTO devices (id, "devEUI", name, description, "deviceType", "integrationId", active, "organizationId", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [id, devEUI, name, description, 'water_meter', integrationId, true, 'plasticos_rival']
      );
      console.log(`Medidor creado: ${name} (${devEUI})`);
      devicesList.push({ devEUI, name });
    }

    // 4. Generar Telemetría Histórica (24 horas)
    console.log('Generando historial de telemetría de 24 horas para cada medidor...');
    for (const dev of devicesList) {
      let cumulativeConsumption = 100.0 + Math.random() * 50.0;
      
      for (let hour = 24; hour >= 1; hour--) {
        const receivedAt = new Date(Date.now() - hour * 60 * 60 * 1000);
        
        // Simular consumo incremental
        const hourlyFlow = parseFloat((12.5 + Math.sin(hour / 3.0) * 8.0 + Math.random() * 3.5).toFixed(2));
        const waterLevel = parseFloat((85.0 + Math.cos(hour / 4.0) * 15.0 + Math.random() * 2.0).toFixed(1));
        const consumptionAdd = parseFloat((hourlyFlow / 1000.0).toFixed(4));
        cumulativeConsumption = parseFloat((cumulativeConsumption + consumptionAdd).toFixed(4));
        
        const decodedPayload = {
          flow: hourlyFlow,
          level: waterLevel,
          battery: Math.floor(95 + Math.random() * 4),
          temperature: parseFloat((21.5 + Math.sin(hour / 6.0) * 1.5 + Math.random() * 0.5).toFixed(1)),
          totalConsumption: cumulativeConsumption,
          alertLeak: false,
          alertOverflow: false
        };

        const rawPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64');
        const telemetryId = crypto.randomUUID();
        const fPort = 1;
        const fCnt = 100 + (24 - hour);
        const spreadingFactor = 7;
        const rssi = -75 - Math.floor(Math.random() * 15);
        const snr = parseFloat((8.0 + Math.random() * 4.0).toFixed(1));

        await client.query(
          `INSERT INTO telemetry (id, "devEUI", "fPort", "fCnt", "spreadingFactor", rssi, snr, "rawPayload", "decodedPayload", "rawMessage", "gatewayId", "integrationId", "receivedAt") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            telemetryId,
            dev.devEUI,
            fPort,
            fCnt,
            spreadingFactor,
            rssi,
            snr,
            rawPayload,
            JSON.stringify(decodedPayload),
            JSON.stringify({ simulated: true, devEUI: dev.devEUI, data: rawPayload }),
            'GW_RIVAL_001',
            integrationId,
            receivedAt,
          ]
        );
      }
      console.log(`Telemetría completada para ${dev.name}`);
    }

    console.log('¡Seeding completado con éxito!');
  } catch (err) {
    console.error('Error durante la simulación de base de datos:', err);
  } finally {
    await client.end();
  }
}

seed();
