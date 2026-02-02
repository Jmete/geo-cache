import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../types/app';
import { createLogger, resolveRequestId } from '../logging';

export const requestContextMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next
) => {
  const requestId = resolveRequestId(
    c.req.header('x-request-id'),
    c.req.header('cf-ray')
  );
  const logger = createLogger({
    requestId,
    method: c.req.method,
    path: c.req.path,
  });

  c.set('requestId', requestId);
  c.set('logger', logger);

  logger.info('request.start', {
    cfRay: c.req.header('cf-ray') ?? undefined,
  });

  const start = Date.now();
  try {
    await next();
  } catch (error) {
    logger.error('request.error', {
      category: 'internal',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  } finally {
    const durationMs = Date.now() - start;
    const status = c.res?.status ?? 500;
    logger.info('request.complete', {
      status,
      durationMs,
    });
  }
};
