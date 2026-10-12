import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  // Leave empty in development to use an in-memory MongoDB (data is lost on restart).
  MONGO_URI: z.string().optional().default(''),
  // Where the local development database keeps its files when MONGO_URI is empty. Configurable
  // so a test can point it somewhere disposable: a test that cleans up after itself must never
  // be able to delete the database a developer is actually using.
  // An empty value in a .env file must not quietly resolve to the real directory, so it is
  // normalised back to the default rather than left as ''.
  MONGO_DB_PATH: z
    .string()
    .transform((v) => (v.trim() ? v : path.join(serverRoot, '.mongo-data')))
    .default(path.join(serverRoot, '.mongo-data')),

  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Only needed when the React app is served from a different origin than the API.
  CLIENT_ORIGIN: z.string().optional().default(''),
  // The default is the parsed value, not the string: Zod returns a default as it is, without the
  // transform, and the string 'false' is truthy. As 'false' it switched proxy trust on for every
  // server that left this unset, so a client could set X-Forwarded-For to any address it liked and
  // walk straight past the sign-in rate limit.
  TRUST_PROXY: bool.default(false),
  // Failed sign-in attempts allowed from one IP per 15 minutes. Configurable so a test can drive
  // the real route rather than a copy of it.
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(20),
  // Accounts that may be created from one IP per hour. Counts successes only.
  REGISTER_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(10),

  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  UPLOAD_DIR: z.string().default(path.join(serverRoot, 'uploads')),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  INFERENCE_DRIVER: z.enum(['local', 'mock']).default('local'),
  MODEL_CACHE_DIR: z.string().default(path.join(serverRoot, 'models-cache')),
  // 0 lets onnxruntime pick. Set 1 on tiny shared-CPU hosts to avoid thread thrashing.
  ORT_THREADS: z.coerce.number().int().min(0).max(64).default(0),
  // Top-1 confidence at or above this is reported as a confident diagnosis; below it the
  // answer is still shown, but flagged and queued for an expert. Rejection is decided by the
  // not-a-leaf gate in services/diagnosis.js, not by this threshold.
  CONFIDENCE_HIGH: z.coerce.number().min(0).max(1).default(0.7),

  WEATHER_API_BASE: z.string().url().default('https://api.open-meteo.com/v1/forecast'),

  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),
});

// Treat `KEY=` lines in .env as unset, so copying .env.example as-is works.
const provided = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(provided);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  if (env[key]) continue;
  if (isProd) {
    console.error(`${key} must be set (at least 32 characters) in production.`);
    process.exit(1);
  }
  // Ephemeral secret: fine for local dev, but every restart logs everyone out.
  env[key] = crypto.randomBytes(48).toString('hex');
  if (env.NODE_ENV === 'development') {
    console.warn(`[env] ${key} not set; using a random per-process secret.`);
  }
}

if (isProd && !env.MONGO_URI) {
  console.error('MONGO_URI must be set in production.');
  process.exit(1);
}

if (env.STORAGE_DRIVER === 'cloudinary') {
  const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter((k) => !env[k]);
  if (missing.length) {
    console.error(`STORAGE_DRIVER=cloudinary requires ${missing.join(', ')}.`);
    process.exit(1);
  }
}

export const config = Object.freeze({ ...env, isProd, serverRoot });
