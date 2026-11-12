import { z } from 'zod';
import { normalizeEmail, isValidEmail, normalizeMobile } from '../utils/leadNormalizers';

export const createContactSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'fullName must be at least 2 characters')
      .max(150, 'fullName cannot exceed 150 characters'),
    designation: z.string().trim().max(100, 'designation cannot exceed 100 characters').optional().nullable(),
    email: z.string().max(254, 'email cannot exceed 254 characters').optional().nullable(),
    mobile: z.string().optional().nullable(),
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.email) {
      const norm = normalizeEmail(data.email);
      if (!norm || !isValidEmail(norm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'Invalid email address format',
        });
      }
    }
    if (data.mobile) {
      const norm = normalizeMobile(data.mobile);
      if (!norm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mobile'],
          message: 'Mobile number must contain 7 to 15 digits',
        });
      }
    }
  });

export const updateContactSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'fullName must be at least 2 characters')
      .max(150, 'fullName cannot exceed 150 characters')
      .optional(),
    designation: z.string().trim().max(100, 'designation cannot exceed 100 characters').optional().nullable(),
    email: z.string().max(254, 'email cannot exceed 254 characters').optional().nullable(),
    mobile: z.string().optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one field is required for update',
      });
      return;
    }
    if (data.email !== undefined && data.email !== null) {
      const norm = normalizeEmail(data.email);
      if (!norm || !isValidEmail(norm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'Invalid email address format',
        });
      }
    }
    if (data.mobile !== undefined && data.mobile !== null) {
      const norm = normalizeMobile(data.mobile);
      if (!norm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mobile'],
          message: 'Mobile number must contain 7 to 15 digits',
        });
      }
    }
  });

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

