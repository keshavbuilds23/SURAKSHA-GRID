import { z } from 'zod';

export const recommendationQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  district: z.string().trim().max(100).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  required_capabilities: z
    .preprocess(val => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return val.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return val;
    }, z.array(z.string().trim()))
    .default([]),
  personnel_required: z.coerce.number().int().min(0).default(5),
  equipment_required: z
    .preprocess(val => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return val;
    }, z.array(
      z.object({
        equipment_type_id: z.string().trim(),
        min_quantity: z.coerce.number().int().min(1).default(1),
      })
    ))
    .default([]),
  demo_mode: z
    .preprocess(val => {
      if (typeof val === 'string') return val === 'true' || val === '1';
      return Boolean(val);
    }, z.boolean())
    .default(false),
  max_results: z.coerce.number().int().min(1).max(50).default(10),
});

export type RecommendationQueryInput = z.infer<typeof recommendationQuerySchema>;

