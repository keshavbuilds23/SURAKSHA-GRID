import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { AppError } from '../types/index.js';
import { env } from '../config/env.js';

export interface AuthUser {
  id: number;
  role: 'citizen' | 'volunteer' | 'coordinator' | 'admin';
  full_name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Creates an authentication and authorization middleware that enforces cryptographic
 * JWT verification and validates the actor's identity and privileges against the
 * server-side SQLite `users` table.
 *
 * Security Guarantees:
 * 1. Rejects any request without a valid cryptographically signed Bearer JWT (no headers accepted).
 * 2. Restricts algorithm strictly to HS256 to prevent algorithm confusion attacks (e.g. 'none' or asymmetric).
 * 3. Validates expiration and signature integrity.
 * 4. Resolves the actor's current role directly from the SQLite database; never trusts token claims blindly.
 * 5. Guarantees that `verified_by` references an existing user in the database.
 * 6. Fails closed if server authentication secret is missing or misconfigured.
 */
export function requireCoordinator(
  db: Database.Database,
  jwtSecret: string = env.JWT_SECRET
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 1. Fail closed if JWT secret is missing or unconfigured
    if (!jwtSecret || jwtSecret.length < 16) {
      return next(
        new AppError(
          'Server authentication configuration error: JWT_SECRET is unconfigured.',
          500,
          'INTERNAL_ERROR'
        )
      );
    }

    // 2. Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(
        new AppError(
          'Authentication required: A valid Bearer token must be provided.',
          401,
          'UNAUTHORIZED'
        )
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return next(
        new AppError(
          'Authentication required: Bearer token is empty.',
          401,
          'UNAUTHORIZED'
        )
      );
    }

    // 3. Cryptographically verify signature, expiration, and algorithm
    let decodedPayload: any;
    try {
      decodedPayload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
      });
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'TokenExpiredError') {
        return next(
          new AppError(
            'Authentication token has expired. Please log in again.',
            401,
            'UNAUTHORIZED'
          )
        );
      }
      if (errName === 'JsonWebTokenError') {
        return next(
          new AppError(
            'Invalid authentication token signature or malformed payload.',
            401,
            'UNAUTHORIZED'
          )
        );
      }
      return next(
        new AppError(
          'Authentication verification failed.',
          401,
          'UNAUTHORIZED'
        )
      );
    }

    if (typeof decodedPayload !== 'object' || decodedPayload === null) {
      return next(
        new AppError(
          'Invalid token payload structure.',
          401,
          'UNAUTHORIZED'
        )
      );
    }

    // 4. Extract actor ID from payload
    const rawId = decodedPayload.id ?? decodedPayload.sub;
    const actorId = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10);

    if (isNaN(actorId) || actorId <= 0) {
      return next(
        new AppError(
          'Authentication token payload missing valid actor identity.',
          401,
          'UNAUTHORIZED'
        )
      );
    }

    // 5. Query trusted server-side SQLite identity (Never trust token claims alone)
    try {
      const user = db
        .prepare('SELECT id, username, role, full_name FROM users WHERE id = ?')
        .get(actorId) as { id: number; username: string; role: string; full_name: string } | undefined;

      if (!user) {
        return next(
          new AppError(
            'Actor identity in token does not correspond to an existing user record.',
            401,
            'UNAUTHORIZED'
          )
        );
      }

      // 6. Verify coordinator or admin role from database record
      if (user.role !== 'coordinator' && user.role !== 'admin') {
        return next(
          new AppError(
            `Forbidden: Role '${user.role}' is not authorized to perform coordinator operations. Coordinator privileges required.`,
            403,
            'FORBIDDEN'
          )
        );
      }

      // 7. Attach verified server-side identity to request
      req.user = {
        id: user.id,
        role: user.role as 'coordinator' | 'admin',
        full_name: user.full_name,
      };

      return next();
    } catch (dbErr) {
      return next(
        new AppError(
          'Failed to verify actor identity against user directory.',
          500,
          'INTERNAL_ERROR'
        )
      );
    }
  };
}

/**
 * Optional authentication middleware for read operations.
 * If a valid Bearer token is provided, populates `req.user`.
 * If no token or an invalid token is provided, proceeds as unauthenticated public user without failing.
 */
export function optionalAuth(
  db: Database.Database,
  jwtSecret: string = env.JWT_SECRET
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      // Legitimate unauthenticated public request
      return next();
    }

    if (!authHeader.startsWith('Bearer ')) {
      return next(
        new AppError(
          'Malformed authorization header. Expected Bearer scheme.',
          401,
          'UNAUTHORIZED'
        )
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return next(
        new AppError('Bearer token is empty.', 401, 'UNAUTHORIZED')
      );
    }

    try {
      const decodedPayload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
      }) as any;

      const rawId = decodedPayload?.id ?? decodedPayload?.sub;
      const actorId = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10);

      if (!isNaN(actorId) && actorId > 0) {
        const user = db
          .prepare('SELECT id, username, role, full_name FROM users WHERE id = ?')
          .get(actorId) as { id: number; username: string; role: string; full_name: string } | undefined;

        if (user) {
          req.user = {
            id: user.id,
            role: user.role as 'citizen' | 'volunteer' | 'coordinator' | 'admin',
            full_name: user.full_name,
          };
          return next();
        }
      }

      return next(
        new AppError(
          'Actor identity in token does not correspond to an existing user record.',
          401,
          'UNAUTHORIZED'
        )
      );
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'TokenExpiredError') {
        return next(
          new AppError('Authentication token has expired. Please log in again.', 401, 'UNAUTHORIZED')
        );
      }
      return next(
        new AppError('Invalid authentication token signature or malformed payload.', 401, 'UNAUTHORIZED')
      );
    }
  };
}
