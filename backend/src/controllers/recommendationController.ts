import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { createRecommendationService } from '../services/recommendationService.js';
import { recommendationQuerySchema } from '../validators/recommendationValidators.js';

export function createRecommendationController(db: Database.Database) {
  const service = createRecommendationService(db);

  /**
   * Evaluates and returns NGO recommendations based on arbitrary incident parameters.
   * Supports both GET (with query parameters) and POST (with JSON payload).
   */
  const getRecommendations = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
      const rawInput = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
      const parsedQuery = recommendationQuerySchema.parse(rawInput);

      const result = service.getRecommendations(parsedQuery, isCoordinator);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Generates recommendations tailored to an existing Incident by ID.
   * Supports optional query or body overrides.
   */
  const getIncidentRecommendations = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
      const incidentId = parseInt(req.params.id, 10);
      const rawInput = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
      const parsedOverrides = recommendationQuerySchema.partial().parse(rawInput);

      const result = service.getIncidentRecommendations(incidentId, parsedOverrides, isCoordinator);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  return {
    getRecommendations,
    getIncidentRecommendations,
  };
}

