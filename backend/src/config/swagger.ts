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
              code: { type: 'string', example: 'VALIDATION_ERROR' },
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
  },
};
