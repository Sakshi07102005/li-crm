// src/scripts/seed-demo-clean.ts
// Removes only demo data inserted by seed-demo.ts
import { Pool } from 'pg';
import { env } from '../config/env';

const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
  ssl: env.database.ssl,
});

async function main() {
  console.log('Cleaning demo data...');
  // Delete follow‑ups linked to demo leads
  await pool.query(
    `DELETE FROM follow_ups WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE $1)`,
    ['%@demo.licrm.example']
  );
  // Delete tasks with demo title prefix
  await pool.query(`DELETE FROM tasks WHERE title LIKE $1`, ['[Demo] %']);
  // Delete lead assignments for demo leads
  await pool.query(
    `DELETE FROM lead_assignments WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE $1)`,
    ['%@demo.licrm.example']
  );
  // Delete activities for demo leads
  await pool.query(
    `DELETE FROM activities WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE $1)`,
    ['%@demo.licrm.example']
  );
  // Delete leads
  await pool.query(`DELETE FROM leads WHERE email LIKE $1`, ['%@demo.licrm.example']);
  // Delete contacts for demo companies
  await pool.query(
    `DELETE FROM contacts WHERE email LIKE $1`,
    ['%@company%.demo.example']
  );
  // Delete companies
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, ['Demo Company %']);

  console.log('Demo data cleaned.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error cleaning demo data:', err);
  process.exit(1);
});

