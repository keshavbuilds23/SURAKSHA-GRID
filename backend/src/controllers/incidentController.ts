import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import {
  createIncident,
  getIncidents,
  getIncidentById,
  verifyIncident,
} from '../services/incidentService.js';
import {
  CreateIncidentInput,
  QueryIncidentsInput,
  VerifyIncidentInput,
} from '../validators/incidentValidators.js';
import { ApiResponse, AppError } from '../types/index.js';

export function createIncidentController(db: Database.Database) {
  return {
    createIncident: async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const input = req.body as CreateIncidentInput;
        const reporterId = req.user?.id ?? null;

        const result = createIncident(db, input, reporterId);

        const response: ApiResponse<typeof result.incident> = {
          success: true,
          data: result.incident,
          meta: result.isExisting
            ? { idempotent_replay: true }
            : undefined,
        };

        const status = result.isExisting ? 200 : 201;
        res.status(status).json(response);
      } catch (err) {
        next(err);
      }
    },

    getIncidents: async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const query = req.query as unknown as QueryIncidentsInput;
        const isStaff = !!req.user && (req.user.role === 'coordinator' || req.user.role === 'volunteer' || req.user.role === 'admin');
        const result = getIncidents(db, query, isStaff);

        res.status(200).json({
          success: true,
          data: result.incidents,
          meta: {
            ...result.meta,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        next(err);
      }
    },

    getIncidentById: async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          throw new AppError('Invalid incident ID provided.', 400, 'BAD_REQUEST');
        }

        const isStaff = !!req.user && (req.user.role === 'coordinator' || req.user.role === 'volunteer' || req.user.role === 'admin');
        const incident = getIncidentById(db, id, isStaff);

        res.status(200).json({
          success: true,
          data: incident,
        });
      } catch (err) {
        next(err);
      }
    },

    verifyIncident: async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          throw new AppError('Invalid incident ID provided.', 400, 'BAD_REQUEST');
        }

        if (!req.user) {
          throw new AppError(
            'Unauthorized: Incident verification requires an authorized coordinator actor.',
            401,
            'UNAUTHORIZED'
          );
        }

        const input = req.body as VerifyIncidentInput;
        const updated = verifyIncident(db, id, input, req.user);

        res.status(200).json({
          success: true,
          data: updated,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

