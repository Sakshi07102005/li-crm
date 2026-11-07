import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  updateProfileSchema,
} from "../validators/auth.validator";

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: "Public registration (automatically assigns the lowest role: Marketing Executive)"
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: new.leadgen@licrm.example
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Secure@12345
 *               firstName:
 *                 type: string
 *                 example: Priya
 *               lastName:
 *                 type: string
 *                 example: Sharma
 *               phone:
 *                 type: string
 *                 example: "+91-9876543299"
 *     responses:
 *       201:
 *         description: User registered successfully with Marketing Executive role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         $ref: '#/components/responses/ConflictError'
 */
router.post("/register", validate(registerSchema), AuthController.register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password (for all 4 roles)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@licrm.example
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin@12345
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/login", validate(loginSchema), AuthController.login);

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh JWT access token with rotation (invalidates old token, creates new pair; detects reuse)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  "/refresh-token",
  validate(refreshTokenSchema),
  AuthController.refreshToken
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Revoke refresh token and log out
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post("/logout", validate(logoutSchema), AuthController.logout);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get profile of authenticated user
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User profile retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/me", authenticate, AuthController.getMe);

/**
 * @openapi
 * /api/auth/me:
 *   put:
 *     summary: Update profile of authenticated user
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Priya
 *               lastName:
 *                 type: string
 *                 example: Sharma
 *               phone:
 *                 type: string
 *                 example: "+91-9876543211"
 *               avatarUrl:
 *                 type: string
 *                 example: "https://images.example/avatars/priya.png"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put(
  "/me",
  authenticate,
  validate(updateProfileSchema),
  AuthController.updateMe
);

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     summary: Change password and invalidate all active sessions
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: Sample@12345
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewStrongPassword@2026
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  AuthController.changePassword
);

export default router;
