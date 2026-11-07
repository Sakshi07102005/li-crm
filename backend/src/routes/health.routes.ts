import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../db/pool';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const isDbUp = await checkDatabaseConnection();

  const data = {
    status: isDbUp ? 'healthy' : 'degraded',
    database: isDbUp ? 'up' : 'down',
    timestamp: new Date().toISOString(),
  };

  if (!isDbUp) {
    res.status(503).json({
      success: false,
      message: 'Database service unavailable',
      data,
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Health check passed',
    data,
  });
});

export const healthRoutes = router;
export default router;
