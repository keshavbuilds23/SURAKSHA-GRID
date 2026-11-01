import { Router } from 'express';
import Database from 'better-sqlite3';
import { createIncidentController } from '../controllers/incidentController.js';
import { validateRequest } from '../middleware/requestValidator.js';
import { requireCoordinator, optionalAuth } from '../middleware/authMiddleware.js';
import {
  createIncidentSchema,
  queryIncidentsSchema,
  incidentParamsSchema,
  verifyIncidentSchema,
} from '../validators/incidentValidators.js';

import { env } from '../config/env.js';

export function createIncidentRoutes(
  db: Database.Database,
  jwtSecret: string = env.JWT_SECRET
): Router {
  const router = Router();
  const controller = createIncidentController(db);

  // 1. Ingest single incident (Idempotent by client_report_id)
  router.post(
    '/incidents',
    validateRequest({ body: createIncidentSchema }),
    controller.createIncident
  );

  // 2. Query incidents with filtering and pagination
  router.get(
    '/incidents',
    optionalAuth(db, jwtSecret),
    validateRequest({ query: queryIncidentsSchema }),
    controller.getIncidents
  );

  // 3. Get single incident dossier with events history
  router.get(
    '/incidents/:id',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: incidentParamsSchema }),
    controller.getIncidentById
  );

  // 4. Verify incident status (Restricted to cryptographically verified coordinators)
  router.patch(
    '/incidents/:id/verify',
    requireCoordinator(db, jwtSecret),
    validateRequest({
      params: incidentParamsSchema,
      body: verifyIncidentSchema,
    }),
    controller.verifyIncident
  );

  return router;
}

