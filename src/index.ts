import { Hono } from 'hono';
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
import { requestContextMiddleware } from './middleware/request-context';
import { resolveGeocode } from './geocode';
import { ProviderFetchError, ProviderTimeoutError } from './providers';
import type { AppBindings } from './types/app';

const app = new Hono<AppBindings>();
const MAX_TEXT_LENGTH = 512;
const BASE_ALLOWED_HOSTS = new Set(['api.geocache.dev']);
const DEV_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);
const bootTime = Date.now();

app.use('*', async (c, next) => {
  const hostname = new URL(c.req.url).hostname;
  const allowLocalhost = c.env.ALLOW_LOCALHOST_HOSTS === 'true';
  const isAllowed =
    BASE_ALLOWED_HOSTS.has(hostname) ||
    (allowLocalhost && DEV_ALLOWED_HOSTS.has(hostname));

  if (!isAllowed) {
    return c.text('Not found', 404);
  }
  return next();
});
app.use('*', requestContextMiddleware);
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
      c.get('logger').warn('request.error', {
        category: 'rate_limit',
        status: 429,
      });
      return c.json(rateLimitedError(), 429);
    }
  }

  return next();
});

// GET /health - Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptimeMs: Math.max(0, Date.now() - bootTime),
    timestamp: new Date().toISOString(),
  });
});

// /v1/geocode - Geocoding endpoint
app.all('/v1/geocode', async (c) => {
  const logger = c.get('logger');
  if (c.req.method !== 'POST') {
    logger.warn('request.error', {
      category: 'method_not_allowed',
      status: 405,
    });
    return c.json(methodNotAllowedError(['POST']), 405);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    logger.warn('request.error', {
      category: 'validation',
      status: 400,
      code: 'INVALID_JSON',
    });
    return c.json(invalidJsonError(), 400);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    logger.warn('request.error', {
      category: 'validation',
      status: 400,
      code: 'INVALID_REQUEST',
    });
    return c.json(
      invalidRequestError('Request body must be a JSON object'),
      400
    );
  }

  const text = (body as Record<string, unknown>).text;

  if (text === undefined) {
    logger.warn('request.error', {
      category: 'validation',
      status: 400,
      code: 'MISSING_TEXT',
    });
    return c.json(missingTextError(), 400);
  }

  if (typeof text !== 'string') {
    logger.warn('request.error', {
      category: 'validation',
      status: 400,
      code: 'INVALID_REQUEST',
    });
    return c.json(invalidRequestError('Field "text" must be a string'), 400);
  }

  if (text.trim().length === 0) {
    logger.warn('request.error', {
      category: 'validation',
      status: 400,
      code: 'TEXT_EMPTY',
    });
    return c.json(emptyTextError(), 400);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    logger.warn('request.error', {
      category: 'validation',
      status: 400,
      code: 'TEXT_TOO_LONG',
    });
    return c.json(textTooLongError(MAX_TEXT_LENGTH), 400);
  }

  try {
    const response = await resolveGeocode(text, {
      kv: c.env.GEO_KV,
      db: c.env.DB,
      geonamesUsername: c.env.GEONAMES_USERNAME,
      logger,
      requestId: c.get('requestId'),
      logHitEvents: c.env.LOG_GEOCODE_HITS === 'true',
    });
    return c.json(response, 200);
  } catch (error) {
    if (error instanceof ProviderTimeoutError) {
      return c.json(providerTimeoutError(error.provider), 502);
    }
    if (error instanceof ProviderFetchError) {
      return c.json(providerError(error.provider), 502);
    }
    logger.error('request.error', {
      category: 'internal',
      status: 500,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return c.json(internalError(), 500);
  }
});

// 404 handler for unmatched routes
app.notFound((c) => {
  c.get('logger').warn('request.error', {
    category: 'not_found',
    status: 404,
  });
  return c.json(invalidRequestError(`Route not found: ${c.req.method} ${c.req.path}`), 404);
});

export default app;
