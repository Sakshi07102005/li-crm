import { Pool, PoolConfig } from "pg";
import { env } from "./env";

const poolConfig: PoolConfig = env.database.url
  ? {
      connectionString: env.database.url,
      ssl: env.database.ssl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: env.database.host,
      port: env.database.port,
      user: env.database.user,
      password: env.database.password,
      database: env.database.name,
      ssl: env.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

export const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export const query = async <T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> => {
  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount };
};

export default pool;
