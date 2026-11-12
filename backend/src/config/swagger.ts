export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'LI CRM API',
    version: '1.0.0',
    description:
      'Logische Innovative CRM REST API with Role-Based Access Control and JWT Authentication.',
  },
  servers: [
    {
      url: '/api',
      description: 'API base path',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide a valid access token in format: Bearer <token>',
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation successful' },
          data: { type: 'object' },
        },
        required: ['success', 'message', 'data'],
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'INVALID_CREDENTIALS',
                  'UNAUTHORIZED',
                  'TOKEN_EXPIRED',
                  'INVALID_TOKEN',
                  'TOKEN_REUSE_DETECTED',
                  'INVALID_REFRESH_TOKEN',
                  'ACCOUNT_DISABLED',
                  'FORBIDDEN',
                  'NOT_FOUND',
                  'EMAIL_ALREADY_EXISTS',
                  'COMPANY_EXISTS',
                  'INVALID_FOLLOWUP_STATE',
                  'RATE_LIMITED',
                  'CORS_NOT_ALLOWED',
                  'INTERNAL_ERROR',
                ],
                example: 'VALIDATION_ERROR',
              },
              details: { nullable: true },
            },
            required: ['code'],
          },
        },
        required: ['success', 'message', 'error'],
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: {
            type: 'string',
            format: 'password',
            description: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number',
            example: 'SecurePass123',
          },
          firstName: { type: 'string', example: 'Rahul' },
          lastName: { type: 'string', example: 'Sharma' },
          phone: { type: 'string', example: '+91-9876543210' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@licrm.example' },
          password: { type: 'string', format: 'password', example: 'Admin@12345' },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: {
            type: 'string',
            example: 'c3f4e2...48_byte_hex_string',
          },
        },
      },
      UpdateProfileRequest: {
        type: 'object',
        properties: {
          firstName: { type: 'string', example: 'Rahul' },
          lastName: { type: 'string', example: 'Sharma' },
          phone: { type: 'string', example: '+91-9876543210' },
          avatarUrl: { type: 'string', format: 'uri', example: 'https://example.com/avatar.png' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', format: 'password', example: 'OldPassword123' },
          newPassword: { type: 'string', format: 'password', example: 'NewPassword123' },
        },
      },
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          website: { type: 'string', nullable: true },
          industry: { type: 'string', nullable: true },
          size: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true },
          contactCount: { type: 'integer' },
          leadCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateCompanyRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 150 },
          website: { type: 'string', maxLength: 255, nullable: true },
          industry: { type: 'string', maxLength: 100, nullable: true },
          size: { type: 'string', maxLength: 50, nullable: true },
          location: { type: 'string', maxLength: 255, nullable: true },
          notes: { type: 'string', maxLength: 2000, nullable: true },
        },
      },
      Contact: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          companyId: { type: 'string', format: 'uuid' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          designation: { type: 'string', nullable: true },
          isPrimary: { type: 'boolean' },
          notes: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Followup: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          leadId: { type: 'string', format: 'uuid' },
          scheduledAt: { type: 'string', format: 'date-time' },
          type: { type: 'string', enum: ['call', 'meeting', 'email', 'demo', 'other'] },
          notes: { type: 'string', nullable: true },
          assignedTo: { type: 'string', format: 'uuid', nullable: true },
          status: { type: 'string', enum: ['pending', 'completed', 'missed', 'rescheduled'] },
          outcome: { type: 'string', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          leadId: { type: 'string', format: 'uuid', nullable: true },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          dueDate: { type: 'string', format: 'date-time', nullable: true },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
          assignedTo: { type: 'string', format: 'uuid', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Activity: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          leadId: { type: 'string', format: 'uuid' },
          type: { type: 'string' },
          subject: { type: 'string' },
          notes: { type: 'string', nullable: true },
          outcome: { type: 'string', nullable: true },
          occurredAt: { type: 'string', format: 'date-time' },
          createdBy: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check and database ping',
        responses: {
          '200': {
            description: 'API and database are healthy',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register new user (strictly assigns marketing_executive role)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': { description: 'Registration successful' },
          '400': { description: 'Validation error (e.g., extra field like role)' },
          '409': { description: 'Email already exists' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate with email & password',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid credentials' },
          '403': { description: 'Account disabled' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token and obtain new access token',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
          },
        },
        responses: {
          '200': { description: 'Tokens rotated' },
          '401': { description: 'Token expired, invalid, or reuse detected' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Revoke refresh token (idempotent)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
          },
        },
        responses: {
          '200': { description: 'Logged out successfully' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile and permissions',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'User profile retrieved' },
          '401': { description: 'Unauthorized or token expired' },
        },
      },
      put: {
        summary: 'Update current user profile (first name, last name, phone, avatar)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileRequest' } },
          },
        },
        responses: {
          '200': { description: 'Profile updated' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/auth/change-password': {
      post: {
        summary: 'Change password and revoke all active refresh tokens',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordRequest' } },
          },
        },
        responses: {
          '200': { description: 'Password changed successfully' },
          '401': { description: 'Incorrect current password' },
        },
      },
    },
    '/roles': {
      get: {
        summary: 'List all roles (any authenticated user)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Roles list' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/rbac/permissions': {
      get: {
        summary: 'Get current user permissions, role, and data scope',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Permissions and scope retrieved' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/users': {
      get: {
        summary: 'List users (users.manage or users.view_team)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20, maximum: 100 } },
          { in: 'query', name: 'search', schema: { type: 'string' } },
          { in: 'query', name: 'roleCode', schema: { type: 'string', enum: ['admin', 'business_head', 'sales_executive', 'marketing_executive'] } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['firstName', 'lastName', 'email', 'createdAt', 'role'] } },
        ],
        responses: {
          '200': { description: 'Users list' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden — insufficient permissions' },
        },
      },
      post: {
        summary: 'Create user (users.manage)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName', 'roleCode'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phone: { type: 'string' },
                  roleCode: { type: 'string', enum: ['admin', 'business_head', 'sales_executive', 'marketing_executive'] },
                  managerId: { type: 'string', format: 'uuid', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'User created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '409': { description: 'Email already exists' },
        },
      },
    },
    '/users/{id}': {
      get: {
        summary: 'Get user by ID (scope-enforced: returns 404 if outside caller scope)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'User retrieved' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found (or outside scope)' },
        },
      },
      put: {
        summary: 'Update user profile fields (users.manage)',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phone: { type: 'string', nullable: true },
                  managerId: { type: 'string', format: 'uuid', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'User updated' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/users/{id}/role': {
      patch: {
        summary: 'Change user role (users.manage). Blocks: self-role-change, last-admin demote.',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['roleCode'],
                properties: {
                  roleCode: { type: 'string', enum: ['admin', 'business_head', 'sales_executive', 'marketing_executive'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Role changed' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden (self, last admin)' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/users/{id}/status': {
      patch: {
        summary: 'Change user active status (users.manage). Deactivation revokes refresh tokens.',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['isActive'],
                properties: {
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Status changed' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden (self, last admin)' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/users/{id}/reset-password': {
      post: {
        summary: 'Reset user password (users.manage). Revokes all active refresh tokens.',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['newPassword'],
                properties: {
                  newPassword: { type: 'string', format: 'password', description: 'Min 8 chars, uppercase, lowercase, digit' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password reset' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/companies': {
      get: {
        summary: 'List companies (companies.view)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of companies with scoped leadCount and contactCount' } },
      },
      post: {
        summary: 'Create company (companies.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Company created' }, '409': { description: 'Company with this name already exists' } },
      },
    },
    '/companies/{id}': {
      get: {
        summary: 'Get company detail with primary contact (companies.view)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Company detail' }, '404': { description: 'Company not found' } },
      },
      put: {
        summary: 'Update company (companies.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Company updated' }, '409': { description: 'Duplicate name' } },
      },
      delete: {
        summary: 'Soft-delete company (leads.delete)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Company deleted' }, '404': { description: 'Not found' } },
      },
    },
    '/companies/{id}/contacts': {
      get: {
        summary: 'List contacts for company (companies.view)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of contacts' } },
      },
      post: {
        summary: 'Create contact for company (contacts.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Contact created' }, '404': { description: 'Company not found' } },
      },
    },
    '/companies/{id}/leads': {
      get: {
        summary: 'List leads for company (companies.view, scoped)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of leads' } },
      },
    },
    '/contacts/{id}': {
      put: {
        summary: 'Update contact (contacts.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Contact updated' } },
      },
      delete: {
        summary: 'Soft-delete contact (contacts.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Contact deleted' } },
      },
    },
    '/contacts/{id}/primary': {
      patch: {
        summary: 'Set contact as primary (contacts.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Contact set as primary' } },
      },
    },
    '/followups': {
      get: {
        summary: 'List follow-ups (leads.view_*, scoped)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of follow-ups' } },
      },
      post: {
        summary: 'Create follow-up (followups.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Follow-up created' }, '422': { description: 'Lead is closed or invalid state' } },
      },
    },
    '/followups/{id}': {
      get: {
        summary: 'Get follow-up by id (leads.view_*, scoped)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Follow-up detail' } },
      },
      put: {
        summary: 'Update pending follow-up (followups.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Follow-up updated' }, '422': { description: 'Not pending' } },
      },
    },
    '/followups/{id}/status': {
      patch: {
        summary: 'Change follow-up status (followups.manage, completed/missed/rescheduled)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Status changed' }, '422': { description: 'Already closed or invalid state' } },
      },
    },
    '/tasks': {
      get: {
        summary: 'List tasks (visible to user)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of tasks' } },
      },
      post: {
        summary: 'Create task (tasks.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Task created' } },
      },
    },
    '/tasks/{id}': {
      get: {
        summary: 'Get task by id',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Task detail' } },
      },
      put: {
        summary: 'Update task (tasks.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Task updated' } },
      },
      patch: {
        summary: 'Change task status',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Status changed' } },
      },
      delete: {
        summary: 'Delete task (tasks.manage)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Task deleted' } },
      },
    },
    '/leads/{id}/activities': {
      get: {
        summary: 'List activities on a lead (leads.view_*, scoped)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of activities' } },
      },
      post: {
        summary: 'Log user activity on a lead (activities.create)',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Activity created' } },
      },
    },
  },
};
