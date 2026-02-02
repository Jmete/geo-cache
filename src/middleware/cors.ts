import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env.d';
import { originNotAllowedError } from '../errors';

const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'] as const;
const ALLOWED_HEADERS = ['content-type', 'x-api-key'] as const;

type AllowedOriginCache = {
  raw: string;
  set: Set<string>;
};

let allowedOriginCache: AllowedOriginCache | null = null;

export function parseAllowedOrigins(value: string): Set<string> {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return new Set(origins);
}

function getAllowedOrigins(env: Env): Set<string> {
  if (allowedOriginCache?.raw === env.ALLOWED_ORIGINS) {
    return allowedOriginCache.set;
  }

  const set = parseAllowedOrigins(env.ALLOWED_ORIGINS ?? '');
  allowedOriginCache = { raw: env.ALLOWED_ORIGINS ?? '', set };
  return set;
}

function applyCorsHeaders(headers: Headers, origin: string): void {
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(','));
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(','));
}

export const corsMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next
) => {
  const origin = c.req.header('origin');
  const allowedOrigins = getAllowedOrigins(c.env);
  const isAllowedOrigin = origin !== undefined && allowedOrigins.has(origin);

  if (origin !== undefined && !isAllowedOrigin) {
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 403 });
    }

    return new Response(JSON.stringify(originNotAllowedError()), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  if (origin !== undefined && isAllowedOrigin && c.req.method === 'OPTIONS') {
    const response = new Response(null, { status: 204 });
    applyCorsHeaders(response.headers, origin);
    return response;
  }

  await next();

  if (origin !== undefined && isAllowedOrigin) {
    applyCorsHeaders(c.res.headers, origin);
  }

  return;
};
