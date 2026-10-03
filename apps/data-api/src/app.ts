import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { errorHandler, HttpError } from './lib/http.js';
import { v1 } from './routes/v1.js';
import { admin } from './routes/admin.js';

export const app = express();
app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', 1);

const pub = fileURLToPath(new URL('../public/', import.meta.url));

/*
 * The admin page runs its own small script; nothing is loaded from elsewhere.
 * The API itself is called server to server with a secret key, so there is no
 * CORS: a key in a web page is a key anyone can copy.
 */
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] } },
  }),
);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ ok: up });
});

app.use('/v1', v1);
app.use('/admin/api', admin);
app.use('/admin', express.static(`${pub}admin`, { index: 'index.html' }));
app.use('/docs', express.static(`${pub}docs`, { index: 'index.html' }));
app.get('/', (_req, res) => res.redirect('/docs/'));

app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'No such endpoint — see /docs/')));
app.use(errorHandler);
