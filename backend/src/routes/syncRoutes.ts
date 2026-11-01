import { Router } from 'express';
import Database from 'better-sqlite3';
import { createSyncController } from '../controllers/syncController.js';
import { validateRequest } from '../middleware/requestValidator.js';
import { batchSyncSchema } from '../validators/incidentValidators.js';

export function createSyncRoutes(db: Database.Database): Router {
  const router = Router();
  const controller = createSyncController(db);

  // Batch sync offline outbox reports with itemized idempotency outcomes
  router.post(
    '/sync/batch',
    validateRequest({ body: batchSyncSchema }),
    controller.batchSync
  );

  return router;
}

