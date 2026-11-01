import { z } from 'zod';

export const incidentCategoryEnum = z.enum([
  'MAROONED_RESCUE',
  'MEDICAL_EMERGENCY',
  'FOOD_WATER_CRISIS',
  'INFRASTRUCTURE_BREACH',
  'GENERAL_RELIEF',
]);

export const reportedUrgencyEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const incidentSeverityEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const verificationStatusEnum = z.enum([
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'RESOLVED',
]);

/**
 * UUIDv4 format check
 */
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createIncidentSchema = z.object({
  client_report_id: z
    .string()
    .trim()
    .regex(uuidRegex, 'client_report_id must be a valid UUIDv4 string'),
  title: z
    .string()
    .trim()
    .min(3, 'title must be at least 3 characters')
    .max(200, 'title cannot exceed 200 characters'),
  description: z
    .string()
    .trim()
    .min(3, 'description must be at least 3 characters')
    .max(2000, 'description cannot exceed 2000 characters'),
  category: incidentCategoryEnum,
  reported_urgency: reportedUrgencyEnum.optional().default('MEDIUM'),
  latitude: z
    .number()
    .min(-90, 'latitude must be between -90 and 90')
    .max(90, 'latitude must be between -90 and 90')
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-180, 'longitude must be between -180 and 180')
    .max(180, 'longitude must be between -180 and 180')
    .nullable()
    .optional(),
  landmark: z
    .string()
    .trim()
    .min(2, 'landmark must be at least 2 characters')
    .max(255, 'landmark cannot exceed 255 characters'),
  affected_count: z
    .coerce
    .number()
    .int('affected_count must be an integer')
    .min(0, 'affected_count cannot be negative')
    .max(1000000, 'affected_count cannot exceed 1,000,000')
    .default(1),
  medical_required: z.boolean().optional().default(false),
  follow_up_to_incident_id: z.coerce.number().int().positive().nullable().optional(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const queryIncidentsSchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'limit cannot exceed 100').default(20),
  category: incidentCategoryEnum.optional(),
  severity: incidentSeverityEnum.optional(),
  verification_status: verificationStatusEnum.optional(),
  search: z.string().trim().max(100).optional(),
});

export type QueryIncidentsInput = z.infer<typeof queryIncidentsSchema>;

export const incidentParamsSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

export const verifyIncidentSchema = z.object({
  verification_status: z.enum(['VERIFIED', 'REJECTED']).default('VERIFIED'),
  verification_notes: z
    .string()
    .trim()
    .max(1000, 'verification_notes cannot exceed 1000 characters')
    .optional()
    .default('Verified by authorized disaster response coordinator'),
});

export type VerifyIncidentInput = z.infer<typeof verifyIncidentSchema>;

export const batchSyncSchema = z.object({
  reports: z
    .array(createIncidentSchema)
    .min(1, 'At least one report required in batch')
    .max(50, 'Batch size cannot exceed 50 reports'),
});

export type BatchSyncInput = z.infer<typeof batchSyncSchema>;

