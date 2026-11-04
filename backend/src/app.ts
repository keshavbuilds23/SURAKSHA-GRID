import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { env, EnvConfig, BACKEND_ROOT } from './config/env.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { createIncidentRoutes } from './routes/incidentRoutes.js';
import { createSyncRoutes } from './routes/syncRoutes.js';
import { createNgoRoutes } from './routes/ngoRoutes.js';
import { createRecommendationRoutes } from './routes/recommendationRoutes.js';
import { createAuthRoutes, AuthRouteOptions } from './routes/authRoutes.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, createErrorHandler } from './middleware/errorHandler.js';
import { AppError } from './types/index.js';

export interface AppOptions {
  db: Database.Database;
  config?: EnvConfig;
  customRoutes?: (app: Express) => void;
  authOptions?: AuthRouteOptions;
}

/**
 * Creates and configures the Express application with security middleware,
 * API routes, and centralized error handling.
 */
export function createApp(options: AppOptions): Express {
  const { db, config = env } = options;
  const app = express();

  // 1. Security Headers via Helmet (configured for single-origin SPA and MapLibre assets)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'https:', 'blob:', 'data:'],
          workerSrc: ["'self'", 'blob:'],
          childSrc: ["'self'", 'blob:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS configuration bound strictly to environment configuration
  const rawOrigins = config.CORS_ORIGIN.split(',').map(o => o.trim());
  const isProduction = config.NODE_ENV === 'production';
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, server-to-server, unit tests)
        if (!origin) {
          return callback(null, true);
        }
        // In non-production test mode, allow wildcard if explicitly configured
        if (!isProduction && rawOrigins.includes('*')) {
          return callback(null, true);
        }
        // Strict allowlist matching
        if (rawOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(
          new AppError(`Origin "${origin}" is not allowed by CORS policy.`, 403, 'CORS_REJECTED')
        );
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      optionsSuccessStatus: 204,
      maxAge: 86400,
    })
  );

  // 3. Body Parsing with 1MB payload ceiling to prevent DoS memory surges
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Rate Limiting on API prefix
  app.use(
    config.API_PREFIX,
    createRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
    })
  );

  // 5. API Routes
  const apiPrefix = config.API_PREFIX;
  app.use(apiPrefix, createHealthRoutes(db));
  app.use(apiPrefix, createIncidentRoutes(db, config.JWT_SECRET));
  app.use(apiPrefix, createSyncRoutes(db));
  app.use(apiPrefix, createNgoRoutes(db, config.JWT_SECRET));
  app.use(apiPrefix, createRecommendationRoutes(db, config.JWT_SECRET));
  app.use(apiPrefix, createAuthRoutes(db, config, options.authOptions));

  // Mount optional custom routes (e.g. For integration tests) before 404 handler
  if (options.customRoutes) {
    options.customRoutes(app);
  }

  // 6. Explicit 404 handler for unmatched API routes under API_PREFIX
  // Guarantees API 404s return JSON error envelopes instead of HTML
  app.use(apiPrefix, notFoundHandler);

  // 7. Static Frontend Assets & SPA Fallback (Production Single-Service Hosting)
  const clientDistDir = path.resolve(BACKEND_ROOT, '../dist');
  if (fs.existsSync(clientDistDir)) {
    // Serve pre-built static client assets (JS bundles, CSS, images)
    app.use(express.static(clientDistDir));

    // Catch-all GET handler to serve index.html for client-side React Router navigation
    app.get('*', (req, res, next) => {
      // Defensive check: never serve HTML for API prefix
      if (req.originalUrl.startsWith(apiPrefix)) {
        return notFoundHandler(req, res, next);
      }
      const indexHtmlPath = path.join(clientDistDir, 'index.html');
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        next();
      }
    });
  }

  // 8. Unmatched Non-API Routes (when static files not present or non-GET requests)
  app.use(notFoundHandler);

  // 9. Centralized Error Handler
  app.use(createErrorHandler(config.NODE_ENV));

  return app;
}
