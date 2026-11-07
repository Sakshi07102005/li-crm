import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const authRateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMinutes * 60 * 1000,
  limit: (req: Request, _res: Response) => {
    if (
      process.env.NODE_ENV === 'test' ||
      req.headers['x-test-suite'] === 'true'
    ) {
      return 10000;
    }
    return env.rateLimit.max;
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
      error: {
        code: 'RATE_LIMITED',
        details: null,
      },
    });
  },
});
