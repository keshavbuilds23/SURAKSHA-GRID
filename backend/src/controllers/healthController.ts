import { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { checkDatabaseHealth } from '../database/connection.js';
import { ApiResponse, HealthCheckData } from '../types/index.js';

export function createHealthController(db: Database.Database) {
  return {
    getHealth: (_req: Request, res: Response): void => {
      const dbHealth = checkDatabaseHealth(db);
      const isHealthy = dbHealth.connected;

      const healthData: HealthCheckData = {
        status: isHealthy ? 'healthy' : 'degraded',
        service: 'suraksha-grid-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: {
          status: dbHealth.connected ? 'connected' : 'disconnected',
          journal_mode: dbHealth.journalMode,
        },
        uptime: Math.round(process.uptime() * 100) / 100,
      };

      const response: ApiResponse<HealthCheckData> = {
        success: true,
        data: healthData,
      };

      const statusCode = isHealthy ? 200 : 503;
      res.status(statusCode).json(response);
    },
  };
}

