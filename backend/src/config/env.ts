import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),

  // Database (plain pg pool)
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('li_crm'),
  DB_SSL: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),

  // JWT & Security
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().optional(),
  JWT_EXPIRES_IN: z.string().optional(),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(16).optional(),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(16).optional(),

  // Rate Limiting
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  // Seed configuration for tests
  SEED_ADMIN_EMAIL: z.string().email().default('admin@licrm.example'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
  SEED_SAMPLE_PASSWORD: z.string().default('Sample@12345'),
  SCHEDULER_ENABLED: z.string().optional().default('true').transform(v => v === 'true'),
  REMINDER_MINUTES: z.string().optional().default('15').transform(v => parseInt(v, 10)),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

const jwtSecret =
  raw.JWT_ACCESS_SECRET ||
  raw.JWT_SECRET ||
  'super-secret-jwt-key-for-licrm-development-only-replace-in-production';

const jwtExpiresIn =
  raw.JWT_ACCESS_EXPIRES_IN ||
  raw.JWT_EXPIRES_IN ||
  '15m';

const corsOriginRaw = raw.CORS_ORIGIN || raw.CORS_ORIGINS || 'http://localhost:5173';
const corsOrigins = corsOriginRaw
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const bcryptRounds = raw.BCRYPT_ROUNDS ?? raw.BCRYPT_SALT_ROUNDS ?? 12;

export const env = {
  nodeEnv: raw.NODE_ENV,
  port: raw.PORT,
  appTimezone: raw.APP_TIMEZONE,
  corsOrigins,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  database: {
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
    name: raw.DB_NAME,
    ssl: raw.DB_SSL ? { rejectUnauthorized: false } : false,
  },
  jwt: {
    accessSecret: jwtSecret,
    accessExpiresIn: jwtExpiresIn,
    refreshTokenDays: raw.REFRESH_TOKEN_DAYS,
  },
  security: { bcryptRounds },
  rateLimit: { max: raw.AUTH_RATE_LIMIT_MAX, windowMinutes: raw.AUTH_RATE_LIMIT_WINDOW_MINUTES },
  seed: {
    adminEmail: raw.SEED_ADMIN_EMAIL,
    adminPassword: raw.SEED_ADMIN_PASSWORD,
    samplePassword: raw.SEED_SAMPLE_PASSWORD,
  },
  // Module 7 flags
  schedulerEnabled: raw.SCHEDULER_ENABLED,
  reminderMinutes: raw.REMINDER_MINUTES,
  firebaseServiceAccountPath: raw.FIREBASE_SERVICE_ACCOUNT_PATH,
};
