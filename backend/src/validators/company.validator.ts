import { z } from 'zod';
import { normalizeWebsite } from '../utils/leadNormalizers';

export const companySizeEnum = z.enum([
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
]);

export const createCompanySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'name must be at least 2 characters')
      .max(150, 'name cannot exceed 150 characters'),
    website: z.string().max(255, 'website cannot exceed 255 characters').optional().nullable(),
    industry: z.string().trim().max(100, 'industry cannot exceed 100 characters').optional().nullable(),
    size: companySizeEnum.optional().nullable(),
    location: z.string().trim().max(200, 'location cannot exceed 200 characters').optional().nullable(),
    notes: z.string().max(1000, 'notes cannot exceed 1000 characters').optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.website) {
      const norm = normalizeWebsite(data.website);
      if (!norm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['website'],
          message: 'Invalid website URL',
        });
      }
    }
  });

export const updateCompanySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'name must be at least 2 characters')
      .max(150, 'name cannot exceed 150 characters')
      .optional(),
    website: z.string().max(255, 'website cannot exceed 255 characters').optional().nullable(),
    industry: z.string().trim().max(100, 'industry cannot exceed 100 characters').optional().nullable(),
    size: companySizeEnum.optional().nullable(),
    location: z.string().trim().max(200, 'location cannot exceed 200 characters').optional().nullable(),
    notes: z.string().max(1000, 'notes cannot exceed 1000 characters').optional().nullable(),
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
    if (data.website !== undefined && data.website !== null) {
      const norm = normalizeWebsite(data.website);
      if (!norm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['website'],
          message: 'Invalid website URL',
        });
      }
    }
  });

export const listCompaniesQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(20),
  q: z.string().max(100, 'q cannot exceed 100 characters').optional(),
  industry: z.string().max(100).optional(),
  size: companySizeEnum.optional(),
  sortBy: z.enum(['name', 'createdAt', 'industry']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;

