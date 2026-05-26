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

    console.log('Limpiando registros antiguos de telemetría, dispositivos e integraciones...');
    await client.query('DELETE FROM telemetry');
    await client.query('DELETE FROM devices');
    await client.query('DELETE FROM integrations');

    console.log('¡Limpieza de base de datos completada con éxito!');
  } catch (err) {
    console.error('Error durante la limpieza de base de datos:', err);
  } finally {
    await client.end();
  }
}

clear();
