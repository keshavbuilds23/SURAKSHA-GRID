import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import Database from 'better-sqlite3';
import { env, EnvConfig } from './config/env.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { notFoundHandler, createErrorHandler } from './middleware/errorHandler.js';
import { AppError } from './types/index.js';

export interface AppOptions {
  db: Database.Database;
  config?: EnvConfig;
  customRoutes?: (app: Express) => void;
}

/**
 * Creates and configures the Express application with security middleware,
 * API routes, and centralized error handling.
 */
export function createApp(options: AppOptions): Express {
  const { db, config = env } = options;
  const app = express();

  // 1. Security Headers via Helmet
  app.use(helmet());

  // 2. CORS configuration bound strictly to environment configuration
  const rawOrigins = config.CORS_ORIGIN.split(',').map(o => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, server-to-server, unit tests)
        if (!origin) {
          return callback(null, true);
        }
        if (rawOrigins.includes('*') || rawOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(
          new AppError(`Origin "${origin}" is not allowed by CORS policy.`, 403, 'CORS_REJECTED')
        );
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // 3. Body Parsing with 1MB payload ceiling to prevent DoS memory surges
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. API Routes
  const apiPrefix = config.API_PREFIX;
  app.use(apiPrefix, createHealthRoutes(db));

  // Mount optional custom routes (e.g. For integration tests) before 404 handler
  if (options.customRoutes) {
    options.customRoutes(app);
  }

  // 5. Unmatched Routes (404)
  app.use(notFoundHandler);

  // 6. Centralized Error Handler
  app.use(createErrorHandler(config.NODE_ENV));

  return app;
}
