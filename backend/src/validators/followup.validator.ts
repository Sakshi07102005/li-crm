import { z } from 'zod';

export const followupTypeEnum = z.enum([
  'call',
  'email',
  'meeting',
  'whatsapp',
  'other',
]);

export const followupStatusEnum = z.enum([
  'pending',
  'completed',
  'missed',
  'rescheduled',
]);

export const createFollowupSchema = z
  .object({
    leadId: z.string().uuid('Invalid leadId UUID'),
    scheduledAt: z.string().min(1, 'scheduledAt is required'),
    type: followupTypeEnum.optional().default('call'),
    notes: z.string().max(1000, 'notes cannot exceed 1000 characters').optional().nullable(),
    assignedTo: z.string().uuid('Invalid assignedTo UUID').optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const d = new Date(data.scheduledAt);
    if (isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'Invalid ISO 8601 datetime format for scheduledAt',
      });
      return;
    }
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (d.getTime() < fiveMinAgo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'scheduledAt cannot be earlier than 5 minutes in the past',
      });
    }
  });

export const updateFollowupSchema = z
  .object({
    scheduledAt: z.string().optional(),
    type: followupTypeEnum.optional(),
    notes: z.string().max(1000, 'notes cannot exceed 1000 characters').optional().nullable(),
    assignedTo: z.string().uuid('Invalid assignedTo UUID').optional().nullable(),
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
    if (data.scheduledAt !== undefined) {
      const d = new Date(data.scheduledAt);
      if (isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledAt'],
          message: 'Invalid ISO 8601 datetime format for scheduledAt',
        });
        return;
      }
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      if (d.getTime() < fiveMinAgo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledAt'],
          message: 'scheduledAt cannot be earlier than 5 minutes in the past',
        });
      }
    }
  });

export const changeFollowupStatusSchema = z
  .object({
    status: z.enum(['completed', 'missed', 'rescheduled'], {
      message: 'status must be completed, missed, or rescheduled',
    }),
    outcome: z.string().max(500, 'outcome cannot exceed 500 characters').optional().nullable(),
    newScheduledAt: z.string().optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === 'rescheduled') {
      if (!data.newScheduledAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newScheduledAt'],
          message: 'newScheduledAt is required when rescheduling',
        });
        return;
      }
      const d = new Date(data.newScheduledAt);
      if (isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newScheduledAt'],
          message: 'Invalid ISO 8601 datetime format for newScheduledAt',
        });
        return;
      }
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      if (d.getTime() < fiveMinAgo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newScheduledAt'],
          message: 'newScheduledAt cannot be earlier than 5 minutes in the past',
        });
      }
    }
  });

export const listFollowupsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(20),
  status: followupStatusEnum.optional(),
  type: followupTypeEnum.optional(),
  assignedTo: z.string().uuid('Invalid assignedTo UUID').optional(),
  leadId: z.string().uuid('Invalid leadId UUID').optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  due: z.enum(['today', 'week']).optional(),
  tab: z.enum(['overdue', 'today', 'this_week', 'week', 'all']).optional(),
  sortBy: z.enum(['scheduledAt', 'createdAt']).optional().default('scheduledAt'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type CreateFollowupInput = z.infer<typeof createFollowupSchema>;
export type UpdateFollowupInput = z.infer<typeof updateFollowupSchema>;
export type ChangeFollowupStatusInput = z.infer<typeof changeFollowupStatusSchema>;
export type ListFollowupsQuery = z.infer<typeof listFollowupsQuerySchema>;
