import type { MiddlewareHandler } from 'hono';
import { internalError, invalidApiKeyError, missingApiKeyError } from '../errors';
import type { AppBindings } from '../types/app';
import {
  hashApiKey,
  readApiKeyFromD1,
  readApiKeyFromKv,
  writeApiKeyToKv,
} from '../auth/api-keys';

export const authMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next
) => {
  const logger = c.get('logger');
  const secret = c.env.API_KEY_HMAC_SECRET;

  if (!secret) {
    logger.error('request.error', {
      category: 'internal',
      status: 500,
      reason: 'api_key_hmac_secret_missing',
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

  let keyHash: string;
  try {
    keyHash = await hashApiKey(providedKey, secret);
  } catch (error) {
    logger.error('request.error', {
      category: 'internal',
      status: 500,
      reason: 'api_key_hash_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return c.json(internalError(), 500);
  }

  try {
    const cached = await readApiKeyFromKv(c.env.GEO_KV, keyHash);
    if (cached?.status === 'active') {
      c.set('apiKeyTier', cached.tier);
      await next();
      return;
    }

    const record = await readApiKeyFromD1(c.env.DB, keyHash);
    if (record?.status === 'active') {
      await writeApiKeyToKv(c.env.GEO_KV, keyHash, record);
      c.set('apiKeyTier', record.tier);
      await next();
      return;
    }
  } catch (error) {
    logger.error('request.error', {
      category: 'internal',
      status: 500,
      reason: 'api_key_lookup_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return c.json(internalError(), 500);
  }

  logger.warn('request.error', {
    category: 'auth',
    status: 401,
    reason: 'invalid_api_key',
  });
  return c.json(invalidApiKeyError(), 401);
};
