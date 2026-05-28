const { Client } = require('pg');

const dbConfig = {
  host: 'localhost',
  port: 5433,
  user: 'appuser',
  password: 'apppass123',
  database: 'lorawan_app',
};

const defaultGraph = {
  nodes: [
    { id: 'n1', type: 'input', position: { x: 50, y: 150 }, data: { label: 'Entrada LoRaWAN' } },
    { id: 'n2', type: 'filter', position: { x: 260, y: 220 }, data: { label: 'Evaluar Fuga', expression: 'payload.flow > 4.5' } },
    { id: 'n3', type: 'saveTelemetry', position: { x: 260, y: 50 }, data: { label: 'Guardar Telemetría' } },
    { id: 'n4', type: 'rpc', position: { x: 500, y: 150 }, data: { label: 'Cerrar Válvula Downlink', command: 'close' } },
    { id: 'n5', type: 'createAlert', position: { x: 500, y: 280 }, data: { label: 'Generar Alerta Fuga', alertType: 'leak', severity: 'critical', message: '¡Alerta Crítica! Fuga de agua detectada en {deviceName}: {value} L/h' } }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', animated: true },
    { id: 'e2', source: 'n1', target: 'n3', animated: true },
    { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'True', label: 'True', animated: true },
    { id: 'e4', source: 'n2', target: 'n5', sourceHandle: 'True', label: 'True', animated: true }
  ]
};

async function run() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('Connected to DB');
    
    // Clean old rule chains
    await client.query('DELETE FROM rule_chains;');
    console.log('Cleared existing rule chains');

    const chainId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    await client.query(
      `INSERT INTO rule_chains (id, name, description, active, graph, "organizationId", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        chainId,
        'Procesamiento de Agua Principal',
        'Filtra caudales altos, registra en base de datos e inunda válvulas si hay fugas.',
        true,
        JSON.stringify(defaultGraph),
        'e98a1a3b-2856-4277-bbcc-04f81a7b4618'
      ]
    );
    console.log(`Seeded default rule chain with UUID: ${chainId}`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
