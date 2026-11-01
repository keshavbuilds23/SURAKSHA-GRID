import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Determine canonical backend package root directory (parent of src/ or dist/)
const currentModuleDir = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(currentModuleDir, '../../');

// Load .env file if present
dotenv.config({ path: path.resolve(BACKEND_ROOT, '.env') });
dotenv.config();

export const DEV_DEFAULT_JWT_SECRET = 'suraksha-grid-dev-insecure-secret-key-min-32-chars';
export const DEV_DEFAULT_JWT_EXPIRES_IN = '7d';
export const PROD_DEFAULT_JWT_EXPIRES_IN = '12h';

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
    .default(DEV_DEFAULT_JWT_SECRET),
  JWT_EXPIRES_IN: z
    .string()
    .optional(),
  AUTH_RATE_LIMIT_WINDOW_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(900000), // 15 minutes
  AUTH_RATE_LIMIT_MAX_REQUESTS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(10), // 10 attempts per 15 minutes
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
}).transform((data) => {
  // Determine environment-specific default for JWT_EXPIRES_IN if not explicitly configured
  const isProduction = data.NODE_ENV === 'production';
  const defaultExpiry = isProduction ? PROD_DEFAULT_JWT_EXPIRES_IN : DEV_DEFAULT_JWT_EXPIRES_IN;
  const resolvedExpiry = (data.JWT_EXPIRES_IN && data.JWT_EXPIRES_IN.trim() !== '')
    ? data.JWT_EXPIRES_IN.trim()
    : defaultExpiry;

  return {
    ...data,
    JWT_EXPIRES_IN: resolvedExpiry,
  };
}).superRefine((data, ctx) => {
  // Validate JWT_SECRET hygiene based on environment
  if (data.NODE_ENV === 'production') {
    if (!data.JWT_SECRET || data.JWT_SECRET.trim() === '' || data.JWT_SECRET === DEV_DEFAULT_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET must be explicitly supplied in production mode and cannot use the development default',
        path: ['JWT_SECRET'],
      });
    } else if (data.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET must be at least 32 characters in production mode',
        path: ['JWT_SECRET'],
      });
    }
  } else {
    // Development and test modes require at least 16 characters
    if (!data.JWT_SECRET || data.JWT_SECRET.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET must be at least 16 characters in development/test',
        path: ['JWT_SECRET'],
      });
    }
  }

  // In production, enforce explicit allowed origins (never allow wildcard *)
  if (data.NODE_ENV === 'production') {
    const origins = data.CORS_ORIGIN.split(',').map(o => o.trim());
    if (origins.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGIN cannot contain wildcard (*) in production mode',
        path: ['CORS_ORIGIN'],
      });
    }
  }
});

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

