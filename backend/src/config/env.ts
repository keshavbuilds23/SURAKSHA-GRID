import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file if present
dotenv.config();

// Determine canonical backend package root directory (parent of src/ or dist/)
const currentModuleDir = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(currentModuleDir, '../../');

export const envSchema = z.object({
  PORT: z
    .coerce
    .number()
    .int()
    .min(1024, 'PORT must be an unprivileged port >= 1024')
    .max(65535, 'PORT must be <= 65535')
    .default(5000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PREFIX: z
    .string()
    .startsWith('/', 'API_PREFIX must start with a slash (e.g., /api/v1)')
    .default('/api/v1'),
  CORS_ORIGIN: z
    .string()
    .min(1, 'CORS_ORIGIN cannot be empty')
    .default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'),
  DB_PATH: z
    .string()
    .min(1, 'DB_PATH cannot be empty')
    .default('./data/suraksha_grid.sqlite'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters in development/test')
    .default('suraksha-grid-dev-insecure-secret-key-min-32-chars'),
  JWT_EXPIRES_IN: z
    .string()
    .default('24h'),
  RATE_LIMIT_WINDOW_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(60000),
  RATE_LIMIT_MAX_REQUESTS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(100),
}).refine(
  (data) => {
    // In production, enforce stronger secret hygiene
    if (data.NODE_ENV === 'production' && data.JWT_SECRET.length < 32) {
      return false;
    }
    return true;
  },
  {
    message: 'JWT_SECRET must be at least 32 characters in production mode',
    path: ['JWT_SECRET'],
  }
).refine(
  (data) => {
    // In production, enforce explicit allowed origins (never allow wildcard *)
    if (data.NODE_ENV === 'production') {
      const origins = data.CORS_ORIGIN.split(',').map(o => o.trim());
      if (origins.includes('*')) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'CORS_ORIGIN cannot contain wildcard (*) in production mode',
    path: ['CORS_ORIGIN'],
  }
);

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown> = process.env): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}

// Default application environment instance
export const env: EnvConfig = validateEnv();

export function getResolvedDbPath(dbPath = env.DB_PATH): string {
  if (dbPath === ':memory:') {
    return ':memory:';
  }
  if (path.isAbsolute(dbPath)) {
    return dbPath;
  }
  // If run from workspace root, backend/data might be specified as ./data
  // Prioritize resolving relative to BACKEND_ROOT to ensure single source of truth
  return path.resolve(BACKEND_ROOT, dbPath);
}

