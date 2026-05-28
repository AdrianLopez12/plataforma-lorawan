const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5433,
  user: 'appuser',
  password: 'apppass123',
  database: 'lorawan_app',
});

async function clear() {
  try {
    console.log('Conectando a PostgreSQL...');
    await client.connect();
    console.log('Conexión exitosa.');

    console.log('Limpiando todos los registros de la base de datos (telemetría, dispositivos, integraciones, logs de auditoría/alertas)...');
    await client.query('TRUNCATE TABLE telemetry, devices, integrations, audit_logs CASCADE;');

    console.log('¡Limpieza completa de la base de datos realizada con éxito!');
  } catch (err) {
    console.error('Error durante la limpieza de base de datos:', err);
  } finally {
    await client.end();
  }
}

clear();
