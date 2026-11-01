import { Router } from 'express';
import Database from 'better-sqlite3';
import { EnvConfig } from '../config/env.js';
import { createAuthController } from '../controllers/authController.js';
import { validateRequest } from '../middleware/requestValidator.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { loginSchema } from '../validators/authValidators.js';

export interface AuthRouteOptions {
  skipRateLimitTest?: boolean;
}

export function createAuthRoutes(
  db: Database.Database,
  config: EnvConfig,
  options?: AuthRouteOptions
): Router {
  const router = Router();
  const controller = createAuthController(db, config);

  // Dedicated login rate limiter to protect against brute-force attacks
  const loginLimiter = createRateLimiter({
    windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
    maxRequests: config.AUTH_RATE_LIMIT_MAX_REQUESTS,
    skipTest: options?.skipRateLimitTest ?? true,
  });

  // POST /auth/login - User credential exchange for HS256 Bearer JWT
  router.post(
    '/auth/login',
    loginLimiter,
    validateRequest({ body: loginSchema }),
    controller.login
  );

  // GET /auth/me - Verify session and retrieve current user profile
  router.get(
    '/auth/me',
    optionalAuth(db, config.JWT_SECRET),
    controller.getMe
  );

  return router;
}

