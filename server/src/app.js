import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { databaseStatus } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import consultationRoutes from './routes/consultation.routes.js';
import expertRoutes from './routes/expert.routes.js';
import libraryRoutes from './routes/library.routes.js';
import outbreakRoutes from './routes/outbreak.routes.js';
import plotRoutes from './routes/plot.routes.js';
import reviewRoutes from './routes/review.routes.js';
import riskRoutes from './routes/risk.routes.js';
import scanRoutes from './routes/scan.routes.js';
import { classifierStatus } from './services/inference/index.js';

const CLIENT_DIST = path.resolve(config.serverRoot, '../client/dist');

export function createApp() {
  const app = express();

  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://tile.openstreetmap.org'],
          // The service worker caches scan photos with fetch(), which connect-src governs.
          connectSrc: ["'self'", 'https://res.cloudinary.com'],
          workerSrc: ["'self'", 'blob:'],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // Uploaded images are loaded by the same-origin SPA; nothing needs cross-origin embedding.
      crossOriginResourcePolicy: { policy: 'same-origin' },
      // OpenStreetMap refuses tile requests that carry no Referer (403 "Access blocked"), which is what
      // helmet's default no-referrer sent. This policy sends other sites only the origin, never a path.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());
  if (config.NODE_ENV !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  if (config.CLIENT_ORIGIN) {
    // Only needed when the frontend is hosted separately; the default deployment is same-origin.
    app.use('/api', (req, res, next) => {
      res.set('Access-Control-Allow-Origin', config.CLIENT_ORIGIN);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      // PUT is how an expert resubmits an application (PUT /api/experts/me/application).
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.status(204).end();
      next();
    });
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const db = databaseStatus();
    const classifier = classifierStatus();
    const healthy = db.state === 'connected';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? (classifier.status === 'ready' ? 'ok' : 'degraded') : 'down',
      database: db,
      classifier,
      storage: config.STORAGE_DRIVER,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', libraryRoutes);
  app.use('/api/plots', plotRoutes);
  app.use('/api/scans', scanRoutes);
  app.use('/api/outbreaks', outbreakRoutes);
  app.use('/api/risk', riskRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/consultations', consultationRoutes);
  app.use('/api/experts', expertRoutes);
  app.use('/api', notFoundHandler);

  if (config.STORAGE_DRIVER === 'local') {
    app.use('/uploads', express.static(config.UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false }));
  }
  // A missing image must 404, not fall through to the SPA and come back as index.html.
  app.use('/uploads', notFoundHandler);

  // In production one Node process serves both the API and the built React app. Same origin
  // means no CORS and first-party refresh cookies, and it is one service to deploy.
  if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.use('/assets', (_req, res) => res.status(404).end());
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
