import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { correlationAndLoggingMiddleware } from './middleware/logging.js';
import { errorHandler, notFound } from './middleware/errors.js';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const clientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = isProduction
  ? [...new Set(clientUrls)]
  : [...new Set(['http://localhost:3000', 'http://localhost:3001', ...clientUrls])];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(correlationAndLoggingMiddleware);

app.use('/api/v1', routes);
app.get('/', (req, res) => res.redirect('/api/v1'));

app.use(notFound);
app.use(errorHandler);

export default app;
