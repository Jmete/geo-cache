import type { MiddlewareHandler } from 'hono';
import { internalError, invalidApiKeyError, missingApiKeyError } from '../errors';
import type { AppBindings } from '../types/app';

const encoder = new TextEncoder();

export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < maxLen; i += 1) {
    const aByte = i < aBytes.length ? (aBytes[i] ?? 0) : 0;
    const bByte = i < bBytes.length ? (bBytes[i] ?? 0) : 0;
    diff |= aByte ^ bByte;
  }

  return diff === 0;
}

export const authMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next
) => {
  const logger = c.get('logger');
  const expectedKey = c.env.API_KEY;

  if (!expectedKey) {
    logger.error('request.error', {
      category: 'internal',
      status: 500,
      reason: 'api_key_missing',
    });
    return c.json(internalError(), 500);
  }

  const providedKey = c.req.header('x-api-key');

  if (!providedKey) {
    logger.warn('request.error', {
      category: 'auth',
      status: 401,
      reason: 'missing_api_key',
    });
    return c.json(missingApiKeyError(), 401);
  }

  if (!timingSafeEqual(providedKey, expectedKey)) {
    logger.warn('request.error', {
      category: 'auth',
      status: 401,
      reason: 'invalid_api_key',
    });
    return c.json(invalidApiKeyError(), 401);
  }

  await next();
};
