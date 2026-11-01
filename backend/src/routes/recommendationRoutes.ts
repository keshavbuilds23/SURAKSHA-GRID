import { Router } from 'express';
import Database from 'better-sqlite3';
import { createRecommendationController } from '../controllers/recommendationController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { env } from '../config/env.js';

export function createRecommendationRoutes(
  db: Database.Database,
  jwtSecret: string = env.JWT_SECRET
): Router {
  const router = Router();
  const controller = createRecommendationController(db);

  // General recommendation query (supports GET with query string or POST with JSON body)
  router.get(
    '/recommendations/ngos',
    optionalAuth(db, jwtSecret),
    controller.getRecommendations
  );

  router.post(
    '/recommendations/ngos',
    optionalAuth(db, jwtSecret),
    controller.getRecommendations
  );

  // Incident-specific recommendation query
  router.get(
    '/incidents/:id/recommendations',
    optionalAuth(db, jwtSecret),
    controller.getIncidentRecommendations
  );

  router.post(
    '/incidents/:id/recommendations',
    optionalAuth(db, jwtSecret),
    controller.getIncidentRecommendations
  );

  return router;
}

