import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
  ssl: env.database.ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient, commitNow: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const commitNow = async () => {
      if (!committed) {
        await client.query('COMMIT');
        committed = true;
      }
    };
    const result = await fn(client, commitNow);
    if (!committed) {
      await client.query('COMMIT');
      committed = true;
    }
    return result;
  } catch (err) {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 AS ok');
    return res.rows.length > 0;
  } catch {
    return false;
  }
}
