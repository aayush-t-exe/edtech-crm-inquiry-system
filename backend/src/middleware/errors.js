import { HttpError } from '../lib/http-error.js';

export function notFound(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.path}`));
}

// One place that turns every thrown error into a clean JSON response.
// Unknown errors are logged with detail but the client only sees a generic message,
// so database internals never leak.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { fields: err.details }) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  // Postgres CHECK constraint (23514) means the data broke a rule in schema.sql.
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Some of the submitted values are not allowed.' });
  }
  console.error('[api] unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
