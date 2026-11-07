import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Logische Innovative CRM - REST API",
      version: "1.0.0",
      description:
        "Comprehensive API documentation for Logische Innovative CRM covering authentication, lead & pipeline management, activities, accounts, and contacts.",
      contact: {
        name: "Logische Innovative API Support",
        email: "support@licrm.example",
      },
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: "Local Development Server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your short-lived JWT access token in the format: `Bearer <token>`",
        },
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Operation completed successfully" },
            data: { type: "object", nullable: true },
          },
        },
        UserProfile: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", example: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d" },
            email: { type: "string", format: "email", example: "admin@licrm.example" },
            roleId: { type: "string", format: "uuid", example: "r1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d" },
            role: {
              type: "string",
              enum: ["admin", "business_head", "sales_executive", "marketing_executive"],
              example: "admin",
            },
            roleName: {
              type: "string",
              enum: ["Admin", "Business Head", "Sales Executive", "Marketing Executive"],
              example: "Admin",
            },
            firstName: { type: "string", example: "System" },
            lastName: { type: "string", example: "Administrator" },
            phone: { type: "string", nullable: true, example: "+91-9876543210" },
            avatarUrl: { type: "string", nullable: true, example: null },
            isActive: { type: "boolean", example: true },
            lastLogin: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TokenPair: {
          type: "object",
          properties: {
            accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
            refreshToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
            expiresIn: { type: "string", example: "15m" },
            tokenType: { type: "string", example: "Bearer" },
          },
        },
        AuthSuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Authentication successful" },
            data: {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/UserProfile" },
                tokens: { $ref: "#/components/schemas/TokenPair" },
              },
            },
          },
        },
        ErrorEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Error message description" },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "INVALID_CREDENTIALS" },
                details: { nullable: true },
              },
            },
          },
        },
      },
      responses: {
        ValidationError: {
          description: "Request validation failed",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorEnvelope",
              },
              example: {
                success: false,
                message: "Validation error on incoming request",
                error: {
                  code: "VALIDATION_ERROR",
                  details: [{ field: "email", message: "Invalid email address" }],
                },
              },
            },
          },
        },
        UnauthorizedError: {
          description: "Missing, expired, or invalid credentials",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorEnvelope",
              },
              example: {
                success: false,
                message: "Invalid email or password.",
                error: {
                  code: "INVALID_CREDENTIALS",
                  details: null,
                },
              },
            },
          },
        },
        ForbiddenError: {
          description: "Access forbidden due to permissions or account deactivation",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorEnvelope",
              },
              example: {
                success: false,
                message: "Access forbidden: required role [admin]",
                error: {
                  code: "FORBIDDEN",
                  details: null,
                },
              },
            },
          },
        },
        ConflictError: {
          description: "Resource already exists",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorEnvelope",
              },
              example: {
                success: false,
                message: "An account with this email address already exists.",
                error: {
                  code: "EMAIL_ALREADY_EXISTS",
                  details: null,
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/routes/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
