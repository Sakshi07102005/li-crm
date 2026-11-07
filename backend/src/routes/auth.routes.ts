import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { authRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  changePasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.validator';

const router = Router();

router.post(
  '/register',
  validate(registerSchema),
  AuthController.register,
);

router.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  AuthController.login,
);

router.post(
  '/refresh',
  validate(refreshTokenSchema),
  AuthController.refresh,
);

router.post(
  '/logout',
  validate(refreshTokenSchema),
  AuthController.logout,
);

router.get(
  '/me',
  authenticate,
  AuthController.getMe,
);

router.put(
  '/me',
  authenticate,
  validate(updateProfileSchema),
  AuthController.updateMe,
);

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  AuthController.changePassword,
);

export const authRoutes = router;
export default router;
