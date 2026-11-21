import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  // Needed for correct client IPs (rate limiting, audit logs) behind Render/Vercel/nginx.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / server-to-server requests (no Origin header) and configured clients.
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.use('/api', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
