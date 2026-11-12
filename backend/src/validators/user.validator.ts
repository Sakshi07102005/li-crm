import { z } from 'zod';

const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const roleCodes = ['admin', 'business_head', 'sales_executive', 'marketing_executive'] as [
  string,
  ...string[]
];

export const createUserSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: passwordPolicy,
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    phone: z.string().max(50).optional(),
    roleCode: z.enum(roleCodes, { message: 'Invalid role code' }),
    managerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(50).optional().nullable(),
    managerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  })
  .strict()
  .refine(
    (data) =>
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.phone !== undefined ||
      data.managerId !== undefined,
    { message: 'At least one field must be provided' },
  );

export const changeRoleSchema = z
  .object({
    roleCode: z.enum(roleCodes, { message: 'Invalid role code' }),
  })
  .strict();

export const changeStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    newPassword: passwordPolicy,
  })
  .strict();

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  roleCode: z.enum(roleCodes).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => {
      if (v === 'true') return true;
      if (v === 'false') return false;
      return undefined;
    }),
  sort: z
    .enum(['firstName', 'lastName', 'email', 'createdAt', 'role'])
    .optional()
    .default('createdAt'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

