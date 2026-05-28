const { Client } = require('pg');

const dbConfig = {
  host: 'localhost',
  port: 5433,
  user: 'appuser',
  password: 'apppass123',
  database: 'lorawan_app',
};

async function check() {
  const client = new Client(dbConfig);
  await client.connect();
  
  const devRes = await client.query('SELECT COUNT(*), "deviceType", "organizationId" FROM devices GROUP BY "deviceType", "organizationId";');
  console.log('=== DEVICES IN DB ===');
  console.log(devRes.rows);

  const telRes = await client.query('SELECT COUNT(*), "devEUI" FROM telemetry GROUP BY "devEUI";');
  console.log('\n=== TELEMETRY IN DB ===');
  console.log(telRes.rows);

  const sampleTel = await client.query('SELECT * FROM telemetry ORDER BY "receivedAt" DESC LIMIT 3;');
  console.log('\n=== LATEST TELEMETRY SAMPLES ===');
  sampleTel.rows.forEach(r => {
    console.log(`devEUI: ${r.devEUI}, fPort: ${r.fPort}, fCnt: ${r.fCnt}, decoded:`, JSON.stringify(r.decodedPayload));
  });

  await client.end();
}

check().catch(console.error);
