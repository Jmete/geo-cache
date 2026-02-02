import { Hono } from 'hono';
import type { Env } from './env.d';
import {
  emptyTextError,
  internalError,
  invalidJsonError,
  invalidRequestError,
  methodNotAllowedError,
  missingTextError,
  providerError,
  providerTimeoutError,
  rateLimitedError,
  textTooLongError,
} from './errors';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { resolveGeocode } from './geocode';
import { ProviderFetchError, ProviderTimeoutError } from './providers';

const app = new Hono<{ Bindings: Env }>();
const MAX_TEXT_LENGTH = 512;
const ALLOWED_HOSTS = new Set(['api.geocache.dev', 'localhost', '127.0.0.1']);

app.use('*', async (c, next) => {
  const hostname = new URL(c.req.url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) {
    return c.text('Not found', 404);
  }
  return next();
});
app.use('*', corsMiddleware);
app.use('/v1/*', authMiddleware);
app.use('/v1/geocode', async (c, next) => {
  if (c.req.method !== 'POST') {
    return next();
  }

  const apiKey = c.req.header('x-api-key')?.trim();
  if (apiKey) {
    const key = `${apiKey}:POST:/v1/geocode`;
    const { success } = await c.env.GEOCODE_RATE_LIMITER.limit({ key });
    if (!success) {
      return c.json(rateLimitedError(), 429);
    }
  }

  return next();
});

// GET /health - Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// /v1/geocode - Geocoding endpoint
app.all('/v1/geocode', async (c) => {
  if (c.req.method !== 'POST') {
    return c.json(methodNotAllowedError(['POST']), 405);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(invalidJsonError(), 400);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return c.json(
      invalidRequestError('Request body must be a JSON object'),
      400
    );
  }

  const text = (body as Record<string, unknown>).text;

  if (text === undefined) {
    return c.json(missingTextError(), 400);
  }

  if (typeof text !== 'string') {
    return c.json(invalidRequestError('Field "text" must be a string'), 400);
  }

  if (text.trim().length === 0) {
    return c.json(emptyTextError(), 400);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return c.json(textTooLongError(MAX_TEXT_LENGTH), 400);
  }

  try {
    const response = await resolveGeocode(text, {
      kv: c.env.GEO_KV,
      db: c.env.DB,
      geonamesUsername: c.env.GEONAMES_USERNAME,
    });
    return c.json(response, 200);
  } catch (error) {
    if (error instanceof ProviderTimeoutError) {
      return c.json(providerTimeoutError(error.provider), 502);
    }
    if (error instanceof ProviderFetchError) {
      return c.json(providerError(error.provider), 502);
    }
    return c.json(internalError(), 500);
  }
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json(invalidRequestError(`Route not found: ${c.req.method} ${c.req.path}`), 404);
});

export default app;
