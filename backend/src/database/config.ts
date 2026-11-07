import dotenv from 'dotenv';
import path from 'path';

// Always load backend/.env, regardless of where the command is run from
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Check backend/.env`);
  }
  return value;
}

export const dbConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  database: required('DB_NAME'),
};

export const seedConfig = {
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  adminEmail: required('SEED_ADMIN_EMAIL'),
  adminPassword: required('SEED_ADMIN_PASSWORD'),
  samplePassword: required('SEED_SAMPLE_PASSWORD'),
};

export const migrationsDir = path.resolve(process.cwd(), 'src', 'database', 'migrations');
