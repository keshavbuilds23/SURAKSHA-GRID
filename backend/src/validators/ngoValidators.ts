import { z } from 'zod';

export const verificationDimensionEnum = z.enum([
  'DOCUMENTED_IN_DDMP',
  'IDENTITY_VERIFIED',
  'CURRENTLY_OPERATIONAL',
  'AVAILABILITY_CONFIRMED',
  'EQUIPMENT_INDEPENDENTLY_VERIFIED',
]);

export const operationalConditionEnum = z.enum([
  'SERVICEABLE',
  'NEEDS_MAINTENANCE',
  'UNDER_REPAIR',
  'UNSERVICEABLE',
]);

export const inspectionStatusEnum = z.enum([
  'SELF_REPORTED',
  'PHYSICALLY_INSPECTED',
  'AUDIT_EXPIRED',
]);

export const administrativeScopeEnum = z.enum([
  'STATE',
  'DISTRICT',
  'REVENUE_CIRCLE',
  'BLOCK',
  'GRAM_PANCHAYAT',
]);

export const availabilityStatusEnum = z.enum([
  'ACTIVE_STANDBY',
  'DEPLOYED',
  'PARTIALLY_AVAILABLE',
  'UNAVAILABLE',
  'INACTIVE_STALE',
]);

export const certificationLevelEnum = z.enum([
  'BASIC',
  'INTERMEDIATE',
  'ADVANCED',
  'SPECIALIST',
]);

export const ngoParamsSchema = z.object({
  id: z.string().trim().min(2, 'id must be at least 2 characters').max(100),
});

export const equipmentParamsSchema = z.object({
  id: z.string().trim().min(2).max(100),
  equipmentId: z.coerce.number().int().positive('equipmentId must be a positive integer'),
});

export const operatingAreaParamsSchema = z.object({
  id: z.string().trim().min(2).max(100),
  areaId: z.coerce.number().int().positive('areaId must be a positive integer'),
});

export const queryNgosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  district: z.string().trim().max(100).optional(),
  revenue_circle: z.string().trim().max(100).optional(),
  capability_id: z.string().trim().max(100).optional(),
  filter_mode: z.enum(['OPERATIONAL', 'SIMULATED', 'ALL']).default('OPERATIONAL'),
  search: z.string().trim().max(100).optional(),
});

export type QueryNgosInput = z.infer<typeof queryNgosSchema>;

export const createNgoSchema = z.object({
  id: z
    .string()
    .trim()
    .min(3, 'id must be at least 3 characters')
    .max(64, 'id cannot exceed 64 characters')
    .regex(/^[a-z0-9_-]+$/i, 'id must be alphanumeric with hyphens or underscores'),
  name: z.string().trim().min(3, 'name must be at least 3 characters').max(200),
  legal_name: z.string().trim().max(255).optional(),
  registration_reference: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  primary_contact_name: z.string().trim().min(2, 'contact name must be at least 2 characters').max(150),
  primary_contact_phone: z.string().trim().min(7, 'contact phone must be at least 7 digits').max(20),
  primary_contact_email: z.string().trim().email('invalid email format').max(150).optional(),
  is_simulated: z.boolean().optional().default(true),
}).refine(
  data => data.is_simulated !== false,
  {
    message: 'New NGO registrations cannot bypass simulated status. Operational promotion requires independent audit.',
    path: ['is_simulated'],
  }
);

export type CreateNgoInput = z.infer<typeof createNgoSchema>;

export const postVerificationSchema = z.object({
  dimension: verificationDimensionEnum,
  is_verified: z.boolean().default(true),
  valid_until: z.string().datetime({ offset: true }).optional().nullable(),
  evidence_reference: z.string().trim().min(3, 'evidence reference must be at least 3 characters').max(500),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type PostVerificationInput = z.infer<typeof postVerificationSchema>;

export const createOperatingAreaSchema = z.object({
  state: z.string().trim().default('Assam'),
  district: z.string().trim().min(2, 'district required').max(100),
  revenue_circle: z.string().trim().max(100).optional().nullable(),
  administrative_scope: administrativeScopeEnum.default('REVENUE_CIRCLE'),
  geographic_identifier: z.string().trim().max(100).optional().nullable(),
  depot_location_name: z.string().trim().min(2, 'depot location name required').max(200),
  depot_latitude: z.number().min(-90).max(90).nullable().optional(),
  depot_longitude: z.number().min(-180).max(180).nullable().optional(),
  is_primary_depot: z.boolean().default(false),
});

export type CreateOperatingAreaInput = z.infer<typeof createOperatingAreaSchema>;

export const syncCapabilitiesSchema = z.object({
  capabilities: z.array(
    z.object({
      capability_id: z.string().trim().min(2).max(100),
      certification_level: certificationLevelEnum.default('BASIC'),
      certified_by: z.string().trim().max(150).optional().nullable(),
      certified_at: z.string().datetime({ offset: true }).optional().nullable(),
      expires_at: z.string().datetime({ offset: true }).optional().nullable(),
      is_verified: z.boolean().default(false),
    })
  ).default([]),
});

export type SyncCapabilitiesInput = z.infer<typeof syncCapabilitiesSchema>;

export const createEquipmentSchema = z.object({
  equipment_type_id: z.string().trim().min(2).max(64),
  operating_area_id: z.number().int().positive().nullable().optional(),
  total_quantity: z.number().int().min(0, 'total quantity must be >= 0'),
  available_quantity: z.number().int().min(0, 'available quantity must be >= 0'),
  reserved_quantity: z.number().int().min(0, 'reserved quantity must be >= 0').default(0),
  operational_condition: operationalConditionEnum.default('SERVICEABLE'),
  inspection_status: inspectionStatusEnum.default('SELF_REPORTED'),
  storage_location_name: z.string().trim().max(200).optional().nullable(),
  storage_latitude: z.number().min(-90).max(90).nullable().optional(),
  storage_longitude: z.number().min(-180).max(180).nullable().optional(),
  last_inspected_at: z.string().datetime({ offset: true }).optional().nullable(),
}).refine(
  data => data.available_quantity + data.reserved_quantity <= data.total_quantity,
  {
    message: 'available_quantity + reserved_quantity cannot exceed total_quantity',
    path: ['available_quantity'],
  }
).refine(
  data => data.operational_condition === 'SERVICEABLE' || data.available_quantity === 0,
  {
    message: 'Non-serviceable equipment must have available_quantity equal to 0',
    path: ['available_quantity'],
  }
);

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const patchEquipmentSchema = z.object({
  equipment_type_id: z.string().trim().min(2).max(64).optional(),
  operating_area_id: z.number().int().positive().nullable().optional(),
  total_quantity: z.number().int().min(0).optional(),
  available_quantity: z.number().int().min(0).optional(),
  reserved_quantity: z.number().int().min(0).optional(),
  operational_condition: operationalConditionEnum.optional(),
  inspection_status: inspectionStatusEnum.optional(),
  storage_location_name: z.string().trim().max(200).nullable().optional(),
  storage_latitude: z.number().min(-90).max(90).nullable().optional(),
  storage_longitude: z.number().min(-180).max(180).nullable().optional(),
  last_inspected_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export type PatchEquipmentInput = z.infer<typeof patchEquipmentSchema>;

export const postAvailabilityCheckinSchema = z.object({
  status: availabilityStatusEnum,
  available_personnel_count: z.coerce.number().int().min(0, 'available_personnel_count must be >= 0').max(5000),
  certified_helmsmen_count: z.coerce.number().int().min(0, 'certified_helmsmen_count must be >= 0').max(1000).default(0),
  reporting_person_name: z.string().trim().min(2, 'reporting person name required (min 2 chars)').max(150),
  reporting_person_phone: z.string().trim().min(7, 'reporting person phone required (min 7 digits)').max(20),
  operational_notes: z.preprocess(
    val => (val === '' ? null : val),
    z.string().trim().max(1000).nullable().optional()
  ),
  valid_until: z.preprocess(
    val => (val === '' ? null : val),
    z.string().datetime({ offset: true }).nullable().optional()
  ),
}).refine(
  data => data.certified_helmsmen_count <= data.available_personnel_count,
  {
    message: 'certified_helmsmen_count cannot exceed total available_personnel_count',
    path: ['certified_helmsmen_count'],
  }
);

export type PostAvailabilityCheckinInput = z.infer<typeof postAvailabilityCheckinSchema>;

