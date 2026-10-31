import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ApiErrorResponse, ApiErrorDetail } from '../types/index.js';
import { env } from '../config/env.js';

/**
 * 404 Handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      timestamp: new Date().toISOString(),
    },
  };
  res.status(404).json(errorResponse);
}

/**
 * Centralized Error Handling Middleware.
 * Catches all runtime, operational, and unexpected errors.
 * Ensures consistent error shapes and prevents leakage of internal paths or stack traces.
 */
export function createErrorHandler(nodeEnv?: string) {
  return (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    const timestamp = new Date().toISOString();

    // 1. Operational AppError
    if (err instanceof AppError) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          timestamp,
        },
      };
      res.status(err.statusCode).json(response);
      return;
    }

    // 2. Zod Schema Validation Error
    if (err instanceof ZodError) {
      const details: ApiErrorDetail[] = err.errors.map(e => ({
        field: e.path.join('.'),
        issue: e.message,
      }));
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data provided.',
          details,
          timestamp,
        },
      };
      res.status(400).json(response);
      return;
    }

    // 3. Malformed JSON Body Syntax Error
    if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400 && 'body' in err) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Malformed JSON payload in request body.',
          timestamp,
        },
      };
      res.status(400).json(response);
      return;
    }

    // 4. Database Errors (better-sqlite3 SqliteError)
    // Safely map without exposing raw SQL or filesystem paths
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'SqliteError') {
      const sqliteErr = err as { code?: string; message?: string };
      
      // Constraint violations (e.g. UNIQUE constraint failed)
      if (sqliteErr.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A record with these unique attributes already exists.',
            timestamp,
          },
        };
        res.status(409).json(response);
        return;
      }

      if (sqliteErr.code === 'SQLITE_CONSTRAINT_CHECK') {
        const response: ApiErrorResponse = {
          success: false,
          error: {
            code: 'CONSTRAINT_VIOLATION',
            message: 'The submitted data violated a database integrity constraint.',
            timestamp,
          },
        };
        res.status(400).json(response);
        return;
      }

      // Generic safe DB error response
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'A database error occurred while processing the request.',
          timestamp,
        },
      };
      res.status(500).json(response);
      return;
    }

    // 5. Unhandled / Internal Server Errors
    const currentEnv = nodeEnv || req.app?.get('env') || env.NODE_ENV;
    const isProduction = currentEnv === 'production';
    const errorMessage = isProduction
      ? 'An internal server error occurred.'
      : err instanceof Error ? err.message : 'Unknown server error';

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
        timestamp,
      },
    };

    res.status(500).json(response);
  };
}

export const errorHandler = createErrorHandler();
