import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { createNgoService } from '../services/ngoService.js';
import { ApiResponse } from '../types/index.js';

export function createNgoController(db: Database.Database) {
  const ngoService = createNgoService(db);

  return {
    getNgos: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const result = ngoService.getNgos(req.query as any, isCoordinator);

        const response: ApiResponse<typeof result.ngos> = {
          success: true,
          data: result.ngos,
          meta: result.meta,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getNgoById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const ngo = ngoService.getNgoById(req.params.id, isCoordinator);

        const response: ApiResponse<typeof ngo> = {
          success: true,
          data: ngo,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    createNgo: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = ngoService.createNgo(req.body);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    },

    getVerifications: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const currentOnly = req.query.current_only === 'true';
        const result = ngoService.getVerifications(req.params.id, currentOnly, isCoordinator);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    addVerification: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actorId = req.user!.id;
        const result = ngoService.addVerification(req.params.id, req.body, actorId);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    },

    promoteToOperational: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actorId = req.user!.id;
        const result = ngoService.promoteToOperational(req.params.id, actorId);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getOperatingAreas: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const result = ngoService.getOperatingAreas(req.params.id, isCoordinator);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    createOperatingArea: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = ngoService.createOperatingArea(req.params.id, req.body);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    },

    deleteOperatingArea: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const areaId = parseInt(req.params.areaId, 10);
        const result = ngoService.deleteOperatingArea(req.params.id, areaId);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getCapabilityCatalog: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = ngoService.getCapabilityCatalog();

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getCapabilities: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = ngoService.getCapabilities(req.params.id);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    syncCapabilities: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = ngoService.syncCapabilities(req.params.id, req.body);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getEquipment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const areaId = req.query.operating_area_id ? parseInt(String(req.query.operating_area_id), 10) : undefined;
        const condition = req.query.operational_condition ? String(req.query.operational_condition) : undefined;

        const result = ngoService.getEquipment(req.params.id, { operating_area_id: areaId, operational_condition: condition }, isCoordinator);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    createEquipment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const result = ngoService.createEquipment(req.params.id, req.body, isCoordinator);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    },

    patchEquipment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const equipmentId = parseInt(req.params.equipmentId, 10);
        const result = ngoService.patchEquipment(req.params.id, equipmentId, req.body, isCoordinator);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    deleteEquipment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const equipmentId = parseInt(req.params.equipmentId, 10);
        const result = ngoService.deleteEquipment(req.params.id, equipmentId);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getEquipmentCatalog: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = ngoService.getEquipmentCatalog();

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    getAvailability: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const isCoordinator = req.user?.role === 'coordinator' || req.user?.role === 'admin';
        const result = ngoService.getAvailability(req.params.id, isCoordinator);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },

    postAvailabilityCheckin: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actorUser = req.user!;
        const result = ngoService.postAvailabilityCheckin(req.params.id, req.body, actorUser);

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    },

    softDeleteNgo: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actorId = req.user!.id;
        const result = ngoService.softDeleteNgo(req.params.id, actorId);

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

