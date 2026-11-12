import { z } from 'zod';

export const userCreatableActivityTypeEnum = z.enum(['call', 'email', 'meeting', 'note'], {
  message: 'type must be one of call, email, meeting, note',
});

export const createActivitySchema = z
  .object({
    type: userCreatableActivityTypeEnum,
    subject: z
      .string()
      .trim()
      .min(1, 'subject is required')
      .max(150, 'subject cannot exceed 150 characters'),
    notes: z.string().max(2000, 'notes cannot exceed 2000 characters').optional().nullable(),
    outcome: z.string().max(200, 'outcome cannot exceed 200 characters').optional().nullable(),
    occurredAt: z.string().optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.occurredAt) {
      const d = new Date(data.occurredAt);
      if (isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurredAt'],
          message: 'Invalid ISO 8601 datetime format for occurredAt',
        });
        return;
      }
      const fiveMinFuture = Date.now() + 5 * 60 * 1000;
      if (d.getTime() > fiveMinFuture) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurredAt'],
          message: 'occurredAt cannot be more than 5 minutes in the future',
        });
      }
    }
  });

export const listActivitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(30),
  type: z.string().optional(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;
