const { Client } = require('pg');

const dbConfig = {
  host: 'localhost',
  port: 5433,
  user: 'appuser',
  password: 'apppass123',
  database: 'lorawan_app',
};

async function run() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('Connected to DB');
    const res = await client.query('SELECT id, name, active, "organizationId", graph FROM rule_chains;');
    console.log('Rule Chains in DB:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
