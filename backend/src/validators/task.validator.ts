import { z } from 'zod';

export const taskPriorityEnum = z.enum(['high', 'medium', 'low']);
export const taskStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);

export const createTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'title must be at least 2 characters')
      .max(200, 'title cannot exceed 200 characters'),
    description: z.string().max(1000, 'description cannot exceed 1000 characters').optional().nullable(),
    leadId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid leadId UUID').optional().nullable(),
    assignedTo: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid assignedTo UUID').optional().nullable(),
    dueDate: z.string().optional().nullable(),
    priority: taskPriorityEnum.optional().default('medium'),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.dueDate) {
      const d = new Date(data.dueDate);
      if (isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dueDate'],
          message: 'Invalid ISO 8601 datetime format for dueDate',
        });
      }
    }
  });

export const updateTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'title must be at least 2 characters')
      .max(200, 'title cannot exceed 200 characters')
      .optional(),
    description: z.string().max(1000, 'description cannot exceed 1000 characters').optional().nullable(),
    leadId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid leadId UUID').optional().nullable(),
    assignedTo: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid assignedTo UUID').optional().nullable(),
    dueDate: z.string().optional().nullable(),
    priority: taskPriorityEnum.optional(),
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
    if (data.dueDate !== undefined && data.dueDate !== null) {
      const d = new Date(data.dueDate);
      if (isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dueDate'],
          message: 'Invalid ISO 8601 datetime format for dueDate',
        });
      }
    }
  });

export const changeTaskStatusSchema = z
  .object({
    status: taskStatusEnum,
  })
  .strict();

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(20),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assignedTo: z.string().uuid('Invalid assignedTo UUID').optional(),
  leadId: z.string().uuid('Invalid leadId UUID').optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  sortBy: z.enum(['dueDate', 'createdAt', 'priority']).optional().default('dueDate'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

