import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from '../config/swagger';
import { authRoutes } from './auth.routes';
import { healthRoutes } from './health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Swagger documentation
router.get('/docs.json', (_req: Request, res: Response) => {
  res.status(200).json(swaggerDocument);
});
router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

export const rootRouter = router;
export default router;
