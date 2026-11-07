import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  // Database
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("change_me"),
  DB_NAME: z.string().default("li_crm"),
  DB_SSL: z
    .string()
    .default("false")
    .transform((val) => val === "true" || val === "1"),

  // JWT & Security
  JWT_SECRET: z.string().default("super-secret-jwt-key-for-licrm-development-only"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().default("super-secret-refresh-jwt-key-for-licrm-development"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(16).default(12),

  // Seed Configuration
  SEED_ADMIN_EMAIL: z.string().email().default("admin@licrm.example"),
  SEED_ADMIN_PASSWORD: z.string().default("Admin@12345"),
  SEED_SAMPLE_PASSWORD: z.string().default("Sample@12345"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()),
  isProduction: parsed.data.NODE_ENV === "production",
  database: {
    url: parsed.data.DATABASE_URL,
    host: parsed.data.DB_HOST,
    port: parsed.data.DB_PORT,
    user: parsed.data.DB_USER,
    password: parsed.data.DB_PASSWORD,
    name: parsed.data.DB_NAME,
    ssl: parsed.data.DB_SSL,
  },
  jwt: {
    secret: parsed.data.JWT_SECRET,
    expiresIn: parsed.data.JWT_EXPIRES_IN,
    refreshSecret: parsed.data.JWT_REFRESH_SECRET,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  },
  bcrypt: {
    saltRounds: parsed.data.BCRYPT_SALT_ROUNDS,
  },
  seed: {
    adminEmail: parsed.data.SEED_ADMIN_EMAIL,
    adminPassword: parsed.data.SEED_ADMIN_PASSWORD,
    samplePassword: parsed.data.SEED_SAMPLE_PASSWORD,
  },
};
