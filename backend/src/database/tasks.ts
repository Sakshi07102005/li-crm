import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { dbConfig, seedConfig, migrationsDir } from './config';

export async function withClient<T>(
  fn: (client: Client) => Promise<T>,
  database: string = dbConfig.database,
): Promise<T> {
  const client = new Client({ ...dbConfig, database });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Creates the database from DB_NAME if it does not exist yet. */
export async function createDatabaseIfMissing(): Promise<void> {
  if (!/^[A-Za-z0-9_]+$/.test(dbConfig.database)) {
    throw new Error('DB_NAME may only contain letters, digits and underscores');
  }
  await withClient(async (client) => {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbConfig.database]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE ${dbConfig.database}`);
      console.log(`Created database "${dbConfig.database}"`);
    } else {
      console.log(`Database "${dbConfig.database}" already exists`);
    }
  }, 'postgres');
}

/** Applies every unapplied .sql file in migrations/, in filename order, one transaction each. */
export async function runMigrations(): Promise<string[]> {
  const applied: string[] = [];
  await withClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    const done = await client.query('SELECT filename FROM schema_migrations');
    const doneSet = new Set(done.rows.map((r) => r.filename as string));
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (doneSet.has(file)) {
        console.log(`  skip   ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  apply  ${file}`);
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  });
  return applied;
}

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleCode: string;
  managerEmail?: string;
}

/** Creates one user per role (idempotent: existing emails are left untouched). */
export async function runSeed(): Promise<void> {
  const users: SeedUser[] = [
    { email: seedConfig.adminEmail, password: seedConfig.adminPassword, firstName: 'System', lastName: 'Admin', phone: '+91-9876543210', roleCode: 'admin' },
    { email: 'businesshead@licrm.example', password: seedConfig.samplePassword, firstName: 'Bhavna', lastName: 'Head', phone: '+91-9876543211', roleCode: 'business_head' },
    { email: 'sales1@licrm.example', password: seedConfig.samplePassword, firstName: 'Sanjay', lastName: 'Sales', phone: '+91-9876543212', roleCode: 'sales_executive', managerEmail: 'businesshead@licrm.example' },
    { email: 'sales2@licrm.example', password: seedConfig.samplePassword, firstName: 'Sneha', lastName: 'Sales', phone: '+91-9876543213', roleCode: 'sales_executive', managerEmail: 'businesshead@licrm.example' },
    { email: 'marketing@licrm.example', password: seedConfig.samplePassword, firstName: 'Meera', lastName: 'Marketing', phone: '+91-9876543214', roleCode: 'marketing_executive', managerEmail: 'businesshead@licrm.example' },
  ];

  await withClient(async (client) => {
    for (const u of users) {
      const role = await client.query('SELECT id FROM roles WHERE code = $1', [u.roleCode]);
      if (role.rowCount === 0) throw new Error(`Role "${u.roleCode}" not found. Run db:migrate first.`);

      let managerId: string | null = null;
      if (u.managerEmail) {
        const m = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [u.managerEmail]);
        managerId = m.rows[0]?.id ?? null;
      }

      const hash = await bcrypt.hash(u.password, seedConfig.bcryptRounds);
      const result = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, manager_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT ((LOWER(email))) DO NOTHING
         RETURNING id`,
        [u.email, hash, u.firstName, u.lastName, u.phone, role.rows[0].id, managerId],
      );
      console.log(`  ${result.rowCount ? 'created' : 'exists '} ${u.email} [${u.roleCode}]`);
    }
  });
}

/** DEV ONLY: wipes every table by recreating the public schema. */
export async function dropEverything(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database when NODE_ENV=production');
  }
  await withClient(async (client) => {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    console.log('  dropped and recreated schema "public"');
  });
}
