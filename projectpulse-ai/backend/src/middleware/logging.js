import crypto from 'crypto';

/**
 * Correlation ID & Structured Request Logging Middleware
 * Generates or propagates an X-Correlation-Id header across requests.
 * Records request duration, status code, and correlation ID without leaking sensitive credentials.
 */
export function correlationAndLoggingMiddleware(req, res, next) {
  // Extract or generate unique correlation ID
  const incomingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const correlationId = (typeof incomingId === 'string' && incomingId.trim().length > 0)
    ? incomingId.trim()
    : crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    // Do not log in test mode unless DEBUG is explicitly enabled
    if (process.env.NODE_ENV === 'test' && !process.env.DEBUG) {
      return;
    }

    const timestamp = new Date().toISOString();
    const method = req.method;
    // Strip query params if sensitive or sanitize url
    const sanitizedUrl = req.originalUrl ? req.originalUrl.split('?')[0] : req.url;
    const status = res.statusCode;

    // Structured log output
    console.info(`[${timestamp}] [${correlationId}] ${method} ${sanitizedUrl} ${status} ${durationMs.toFixed(2)}ms`);
  });

  next();
}

export default correlationAndLoggingMiddleware;
