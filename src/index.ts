import { Hono } from 'hono';
import type { Env } from './env.d';
import { invalidRequestError } from './errors';
import { corsMiddleware } from './middleware/cors';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);

// GET /health - Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// POST /v1/geocode - Geocoding endpoint (placeholder - returns 501)
app.post('/v1/geocode', (c) => {
  return c.json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Geocoding endpoint not yet implemented',
    },
  }, 501);
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json(invalidRequestError(`Route not found: ${c.req.method} ${c.req.path}`), 404);
});

export default app;
