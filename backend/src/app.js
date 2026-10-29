import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db.js';
import { requireAdmin } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { adminInquiriesRouter } from './routes/admin-inquiries.js';
import { authRouter } from './routes/auth.js';
import { publicInquiriesRouter } from './routes/public-inquiries.js';

export const app = express();

// Behind one proxy (Vercel / Render): trust the last X-Forwarded-For hop for req.ip.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
if (config.corsOrigins.length) {
  app.use('/api', cors({ origin: config.corsOrigins, credentials: true }));
}
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

// API responses are personal data; never cache them in shared caches.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', async (_req, res) => {
  const started = Date.now();
  await query('select 1');
  res.json({ ok: true, db: 'connected', dbLatencyMs: Date.now() - started });
});

// Public
app.use('/api/inquiries', publicInquiriesRouter);
app.use('/api/auth', authRouter);

// Protected: requireAdmin runs before every /api/admin route.
app.use('/api/admin', requireAdmin);
app.use('/api/admin/inquiries', adminInquiriesRouter);

app.use(notFound);
app.use(errorHandler);
