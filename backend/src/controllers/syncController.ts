import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { batchSync } from '../services/incidentService.js';
import { BatchSyncInput } from '../validators/incidentValidators.js';
import { ApiResponse } from '../types/index.js';

export function createSyncController(db: Database.Database) {
  return {
    batchSync: async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const { reports } = req.body as BatchSyncInput;
        const result = batchSync(db, reports);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },
  };
}

