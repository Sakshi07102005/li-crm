import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestIdMiddleware, requestLogger } from './middleware/requestLogger';
import { rootRouter } from './routes';
import { AppError } from './utils/AppError';

const app: Express = express();

// Trust proxy for rate limiting and IP capture behind reverse proxies
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI to load its assets inline
  }),
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        env.corsOrigins.includes('*') ||
        env.corsOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(AppError.corsNotAllowed('CORS origin not allowed'));
    },
    credentials: true,
  }),
);

// Body Parsers with 1MB limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID and Request Logging
app.use(requestIdMiddleware);
app.use(requestLogger);

// Mount main API router
app.use('/api', rootRouter);

// 404 Handler
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

export { app };
export default app;
