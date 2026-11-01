import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ required_error: 'Username is required' })
    .trim()
    .min(1, 'Username is required')
    .max(100, 'Username cannot exceed 100 characters'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(256, 'Password cannot exceed 256 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

