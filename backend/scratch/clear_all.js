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

    console.log('Borrando datos de telemetría, dispositivos e integraciones...');
    await client.query('DELETE FROM telemetry');
    console.log('Telemetría borrada.');
    await client.query('DELETE FROM devices');
    console.log('Dispositivos borrados.');
    await client.query('DELETE FROM integrations');
    console.log('Integraciones borradas.');

    console.log('¡Base de datos limpiada con éxito!');
  } catch (err) {
    console.error('Error al limpiar la base de datos:', err);
  } finally {
    await client.end();
  }
}

clear();
