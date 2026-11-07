import { Server } from 'http';
import app from '../src/app';
import { env } from '../src/config/env';
import { checkDatabaseConnection, pool } from '../src/db/pool';

async function main() {
  console.log('--- Starting server on port ' + env.port + ' ---');
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    console.error('Database connection failed.');
    process.exit(1);
  }

  const server: Server = app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });

  try {
    // 1. Probe health
    const healthRes = await fetch(`http://localhost:${env.port}/api/health`);
    console.log(`GET http://localhost:${env.port}/api/health -> Status: ${healthRes.status}`);
    const healthBody = await healthRes.json();
    console.log('Health response body:', JSON.stringify(healthBody));

    // 2. Probe docs.json
    const docsRes = await fetch(`http://localhost:${env.port}/api/docs.json`);
    console.log(`GET http://localhost:${env.port}/api/docs.json -> Status: ${docsRes.status}`);
    const docsBody = (await docsRes.json()) as any;
    console.log('Docs title:', docsBody.info?.title);
  } finally {
    server.close();
    await pool.end();
    console.log('--- Probing complete. Server closed. ---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

