import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { EnvConfig } from '../config/env.js';
import { createAuthService } from '../services/authService.js';
import { AppError } from '../types/index.js';

export function createAuthController(db: Database.Database, config: EnvConfig) {
  const service = createAuthService(db, config);

  /**
   * POST /api/v1/auth/login
   * Authenticates user credentials and issues a cryptographic HS256 JWT.
   */
  const login = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = service.login(req.body);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user's profile based on verified token.
   */
  const getMe = (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const user = service.getCurrentUser(req.user.id);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  };

  return {
    login,
    getMe,
  };
}

