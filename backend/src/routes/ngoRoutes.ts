import { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { createNgoController } from '../controllers/ngoController.js';
import { validateRequest } from '../middleware/requestValidator.js';
import { requireCoordinator, optionalAuth } from '../middleware/authMiddleware.js';
import { AppError } from '../types/index.js';
import {
  queryNgosSchema,
  ngoParamsSchema,
  createNgoSchema,
  postVerificationSchema,
  createOperatingAreaSchema,
  operatingAreaParamsSchema,
  syncCapabilitiesSchema,
  createEquipmentSchema,
  equipmentParamsSchema,
  patchEquipmentSchema,
  postAvailabilityCheckinSchema,
} from '../validators/ngoValidators.js';
import { env } from '../config/env.js';

export function createNgoRoutes(
  db: Database.Database,
  jwtSecret: string = env.JWT_SECRET
): Router {
  const router = Router();
  const controller = createNgoController(db);

  // Middleware to require authentication (any role) for check-in endpoint
  const requireAuthAny = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError('Authentication required: A valid Bearer token must be provided.', 401, 'UNAUTHORIZED')
      );
    }
    next();
  };

  // -----------------------------------------------------------
  // 1. NGO Directory & Profile
  // -----------------------------------------------------------
  router.get(
    '/ngos',
    optionalAuth(db, jwtSecret),
    validateRequest({ query: queryNgosSchema }),
    controller.getNgos
  );

  router.post(
    '/ngos',
    requireCoordinator(db, jwtSecret),
    validateRequest({ body: createNgoSchema }),
    controller.createNgo
  );

  router.get(
    '/ngos/:id',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.getNgoById
  );

  router.delete(
    '/ngos/:id',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.softDeleteNgo
  );

  // -----------------------------------------------------------
  // 2. Verification Ledger & Operational Promotion
  // -----------------------------------------------------------
  router.get(
    '/ngos/:id/verifications',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.getVerifications
  );

  router.post(
    '/ngos/:id/verifications',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema, body: postVerificationSchema }),
    controller.addVerification
  );

  router.patch(
    '/ngos/:id/operational-status',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.promoteToOperational
  );

  // -----------------------------------------------------------
  // 3. Operating Areas (Staging Depots)
  // -----------------------------------------------------------
  router.get(
    '/ngos/:id/operating-areas',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.getOperatingAreas
  );

  router.post(
    '/ngos/:id/operating-areas',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema, body: createOperatingAreaSchema }),
    controller.createOperatingArea
  );

  router.delete(
    '/ngos/:id/operating-areas/:areaId',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: operatingAreaParamsSchema }),
    controller.deleteOperatingArea
  );

  // -----------------------------------------------------------
  // 4. Capabilities (Full Replacement Semantics & Catalogue)
  // -----------------------------------------------------------
  router.get('/capabilities', optionalAuth(db, jwtSecret), controller.getCapabilityCatalog);
  router.get('/capabilities/catalog', optionalAuth(db, jwtSecret), controller.getCapabilityCatalog);
  router.get('/catalog/capabilities', optionalAuth(db, jwtSecret), controller.getCapabilityCatalog);

  router.get(
    '/ngos/:id/capabilities',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.getCapabilities
  );

  router.put(
    '/ngos/:id/capabilities',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema, body: syncCapabilitiesSchema }),
    controller.syncCapabilities
  );

  // -----------------------------------------------------------
  // 5. Equipment Inventory & Catalogue
  // -----------------------------------------------------------
  router.get('/equipment-catalogue', optionalAuth(db, jwtSecret), controller.getEquipmentCatalog);
  router.get('/equipment/catalog', optionalAuth(db, jwtSecret), controller.getEquipmentCatalog);
  router.get('/catalog/equipment', optionalAuth(db, jwtSecret), controller.getEquipmentCatalog);

  router.get(
    '/ngos/:id/equipment',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.getEquipment
  );

  router.post(
    '/ngos/:id/equipment',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema, body: createEquipmentSchema }),
    controller.createEquipment
  );

  router.patch(
    '/ngos/:id/equipment/:equipmentId',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: equipmentParamsSchema, body: patchEquipmentSchema }),
    controller.patchEquipment
  );

  router.delete(
    '/ngos/:id/equipment/:equipmentId',
    requireCoordinator(db, jwtSecret),
    validateRequest({ params: equipmentParamsSchema }),
    controller.deleteEquipment
  );

  // -----------------------------------------------------------
  // 6. Roster Availability & Time-Sensitive Check-Ins
  // -----------------------------------------------------------
  router.get(
    '/ngos/:id/availability',
    optionalAuth(db, jwtSecret),
    validateRequest({ params: ngoParamsSchema }),
    controller.getAvailability
  );

  router.post(
    '/ngos/:id/availability',
    optionalAuth(db, jwtSecret),
    requireAuthAny,
    validateRequest({ params: ngoParamsSchema, body: postAvailabilityCheckinSchema }),
    controller.postAvailabilityCheckin
  );

  return router;
}

