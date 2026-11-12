import { z } from 'zod';
import {
  normalizeEmail,
  isValidEmail,
  normalizeMobile,
  normalizeWebsite,
} from '../utils/leadNormalizers';

export const uuidParamSchema = z.string().uuid('Invalid UUID parameter');

const priorityValues = ['high', 'medium', 'low'] as const;

export const createLeadSchema = z
  .object({
    leadName: z
      .string()
      .trim()
      .min(2, 'leadName must be at least 2 characters')
      .max(150, 'leadName cannot exceed 150 characters'),
    companyName: z.string().max(150, 'companyName cannot exceed 150 characters').optional().nullable(),
    companyId: z.string().uuid('Invalid companyId UUID').optional().nullable(),
    contactId: z.string().uuid('Invalid contactId UUID').optional().nullable(),
    email: z.string().max(254, 'email cannot exceed 254 characters').optional().nullable(),
    mobile: z.string().optional().nullable(),
    website: z.string().max(255, 'website cannot exceed 255 characters').optional().nullable(),
    industry: z.string().max(100, 'industry cannot exceed 100 characters').optional().nullable(),
    productId: z.coerce.number().int().min(1, 'productId must be a positive integer').max(32767, 'productId value is out of range'),
    sourceId: z.coerce.number().int().min(1, 'sourceId must be a positive integer').max(32767, 'sourceId value is out of range'),
    assignedTo: z.string().uuid('Invalid assignedTo UUID').optional().nullable(),
    priority: z
      .string()
      .optional()
      .default('medium')
      .transform((val) => val.toLowerCase())
      .refine((val) => priorityValues.includes(val as any), {
        message: 'priority must be high, medium, or low',
      }),
    nextFollowUpAt: z.string().optional().nullable(),
    remarks: z.string().max(2000, 'remarks cannot exceed 2000 characters').optional().nullable(),
    allowDuplicate: z.boolean().optional().default(false),

    // Disallowed fields on create
    statusId: z.any().optional(),
    status: z.any().optional(),
    leadCode: z.any().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.statusId !== undefined || data.status !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statusId'],
        message: 'Status cannot be set on creation',
      });
    }
    if (data.leadCode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['leadCode'],
        message: 'Lead code is auto-generated and cannot be set manually',
      });
    }

    // At least one of email or mobile
    const rawEmail = data.email ? normalizeEmail(data.email) : null;
    const rawMobile = data.mobile ? normalizeMobile(data.mobile) : null;

    if (!rawEmail && !rawMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'At least one of email or mobile is required',
      });
    }

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

    if (data.contactId && !data.companyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contactId'],
        message: 'contactId cannot be specified without companyId',
      });
    }

    if (data.nextFollowUpAt) {
      const date = new Date(data.nextFollowUpAt);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nextFollowUpAt'],
          message: 'Invalid ISO 8601 datetime format for nextFollowUpAt',
        });
      } else {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (date.getTime() < fiveMinAgo) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nextFollowUpAt'],
            message: 'nextFollowUpAt cannot be earlier than 5 minutes in the past',
          });
        }
      }
    }
  });

export const updateLeadSchema = z
  .object({
    leadName: z
      .string()
      .trim()
      .min(2, 'leadName must be at least 2 characters')
      .max(150, 'leadName cannot exceed 150 characters')
      .optional(),
    companyName: z.string().max(150, 'companyName cannot exceed 150 characters').optional().nullable(),
    companyId: z.string().uuid('Invalid companyId UUID').optional().nullable(),
    contactId: z.string().uuid('Invalid contactId UUID').optional().nullable(),
    email: z.string().max(254, 'email cannot exceed 254 characters').optional().nullable(),
    mobile: z.string().optional().nullable(),
    website: z.string().max(255, 'website cannot exceed 255 characters').optional().nullable(),
    industry: z.string().max(100, 'industry cannot exceed 100 characters').optional().nullable(),
    productId: z.coerce.number().int().min(1, 'productId must be a positive integer').max(32767, 'productId value is out of range').optional(),
    sourceId: z.coerce.number().int().min(1, 'sourceId must be a positive integer').max(32767, 'sourceId value is out of range').optional(),
    priority: z
      .string()
      .optional()
      .transform((val) => (val ? val.toLowerCase() : undefined))
      .refine((val) => val === undefined || priorityValues.includes(val as any), {
        message: 'priority must be high, medium, or low',
      }),
    nextFollowUpAt: z.string().optional().nullable(),
    remarks: z.string().max(2000, 'remarks cannot exceed 2000 characters').optional().nullable(),
    allowDuplicate: z.boolean().optional().default(false),

    // Disallowed fields with specific redirect messages
    status: z.any().optional(),
    statusId: z.any().optional(),
    assignedTo: z.any().optional(),
    leadCode: z.any().optional(),
    createdBy: z.any().optional(),
    lostReason: z.any().optional(),
    convertedAt: z.any().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Empty body check — ignore allowDuplicate (always injected by default)
    const editableFields = [
      'leadName', 'companyName', 'companyId', 'contactId', 'email', 'mobile',
      'website', 'industry', 'productId', 'sourceId', 'priority', 'nextFollowUpAt', 'remarks',
    ];
    const hasEditable = editableFields.some((f) => (data as any)[f] !== undefined);
    // Also count disallowed fields (status, assignedTo, etc.) as "provided" so their own errors fire
    const hasDisallowed = data.status !== undefined || data.statusId !== undefined ||
      data.assignedTo !== undefined || data.leadCode !== undefined ||
      data.createdBy !== undefined || data.lostReason !== undefined || data.convertedAt !== undefined;
    if (!hasEditable && !hasDisallowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one editable field is required',
      });
      return;
    }

    if (data.status !== undefined || data.statusId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Status cannot be updated here; use PATCH /api/leads/:id/status',
      });
    }

    if (data.assignedTo !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedTo'],
        message: 'Assignee cannot be updated here; use PATCH /api/leads/:id/assign',
      });
    }

    if (data.leadCode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['leadCode'],
        message: 'Lead code cannot be updated',
      });
    }

    if (data.createdBy !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['createdBy'],
        message: 'Creator cannot be updated',
      });
    }

    if (data.lostReason !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lostReason'],
        message: 'Lost reason cannot be updated here; use PATCH /api/leads/:id/status',
      });
    }

    if (data.convertedAt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['convertedAt'],
        message: 'Converted timestamp cannot be updated directly',
      });
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

    if (data.nextFollowUpAt) {
      const date = new Date(data.nextFollowUpAt);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nextFollowUpAt'],
          message: 'Invalid ISO 8601 datetime format for nextFollowUpAt',
        });
      } else {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (date.getTime() < fiveMinAgo) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nextFollowUpAt'],
            message: 'nextFollowUpAt cannot be earlier than 5 minutes in the past',
          });
        }
      }
    }
  });

export const checkDuplicateSchema = z
  .object({
    email: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    excludeLeadId: z.string().uuid('Invalid excludeLeadId UUID').optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const rawEmail = data.email ? normalizeEmail(data.email) : null;
    const rawMobile = data.mobile ? normalizeMobile(data.mobile) : null;

    if (!rawEmail && !rawMobile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'At least one of email or mobile is required for duplicate check',
      });
    }
  });

export const changeStatusSchema = z
  .object({
    statusId: z.coerce.number().int().min(1, 'statusId is required and must be a positive integer').max(32767, 'statusId value is out of range'),
    remarks: z.string().max(2000, 'remarks cannot exceed 2000 characters').optional().nullable(),
    lostReason: z.string().max(500, 'lostReason cannot exceed 500 characters').optional().nullable(),
  })
  .strict();

export const assignLeadSchema = z
  .object({
    assignedTo: z.string().uuid('Invalid assignedTo UUID').nullable(),
    reason: z.string().max(500, 'reason cannot exceed 500 characters').optional().nullable(),
  })
  .strict();

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(20),
  q: z.string().max(100, 'q cannot exceed 100 characters').optional(),
  statusId: z.string().optional(),
  productId: z.string().optional(),
  sourceId: z.string().optional(),
  priority: z.string().optional(),
  assignedTo: z.string().uuid('assignedTo must be a valid UUID').optional(),
  unassigned: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  companyId: z.string().uuid('companyId must be a valid UUID').optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  followUpFrom: z.string().optional(),
  followUpTo: z.string().optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'leadName', 'priority', 'nextFollowUp', 'status'], {
      message: 'Invalid sortBy field',
    })
    .optional()
    .default('createdAt'),
  order: z
    .enum(['asc', 'desc'], {
      message: 'order must be asc or desc',
    })
    .optional()
    .default('desc'),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CheckDuplicateInput = z.infer<typeof checkDuplicateSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
