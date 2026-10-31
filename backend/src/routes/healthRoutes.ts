import { Router } from 'express';
import Database from 'better-sqlite3';
import { createHealthController } from '../controllers/healthController.js';

export function createHealthRoutes(db: Database.Database): Router {
  const router = Router();
  const controller = createHealthController(db);

  // Both GET and HEAD are supported (Vite client sync engine uses HEAD /api/v1/health for heartbeat)
  router.get('/health', controller.getHealth);
  router.head('/health', controller.getHealth);

  return router;
}

