/**
 * Tests for error handling utilities
 *
 * Validates F004 requirements:
 * - Error JSON shape: {error:{code,message,details?}}
 * - Status code mappings: 400, 401, 403, 405, 429, 500, 502
 * - Client can distinguish retryable (429/502) from non-retryable (400/401/403/405/500)
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  createErrorResponse,
  isRetryableStatus,
  isNonRetryableStatus,
  getHttpStatusForErrorCode,
  invalidJsonError,
  missingTextError,
  emptyTextError,
  textTooLongError,
  invalidRequestError,
  missingApiKeyError,
  invalidApiKeyError,
  originNotAllowedError,
  methodNotAllowedError,
  rateLimitedError,
  internalError,
  providerError,
  providerTimeoutError,
  RETRYABLE_STATUS_CODES,
  NON_RETRYABLE_STATUS_CODES,
} from './index';

describe('Error Response Structure', () => {
  it('creates error response with required fields', () => {
    const response = createErrorResponse(ErrorCode.INVALID_JSON, 'Test message');

    expect(response).toHaveProperty('error');
    expect(response.error).toHaveProperty('code', ErrorCode.INVALID_JSON);
    expect(response.error).toHaveProperty('message', 'Test message');
    expect(response.error).not.toHaveProperty('details');
  });

  it('creates error response with optional details', () => {
    const details = { field: 'text', reason: 'too long' };
    const response = createErrorResponse(
      ErrorCode.TEXT_TOO_LONG,
      'Text too long',
      details
    );

    expect(response.error.details).toEqual(details);
  });

  it('omits details when undefined', () => {
    const response = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'Internal error',
      undefined
    );

    expect(response.error).not.toHaveProperty('details');
  });
});

describe('Retryable vs Non-Retryable Classification', () => {
  it('identifies 429 as retryable', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isNonRetryableStatus(429)).toBe(false);
  });

  it('identifies 502 as retryable', () => {
    expect(isRetryableStatus(502)).toBe(true);
    expect(isNonRetryableStatus(502)).toBe(false);
  });

  it('identifies 400 as non-retryable', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isNonRetryableStatus(400)).toBe(true);
  });

  it('identifies 401 as non-retryable', () => {
    expect(isRetryableStatus(401)).toBe(false);
    expect(isNonRetryableStatus(401)).toBe(true);
  });

  it('identifies 403 as non-retryable', () => {
    expect(isRetryableStatus(403)).toBe(false);
    expect(isNonRetryableStatus(403)).toBe(true);
  });

  it('identifies 405 as non-retryable', () => {
    expect(isRetryableStatus(405)).toBe(false);
    expect(isNonRetryableStatus(405)).toBe(true);
  });

  it('identifies 500 as non-retryable', () => {
    expect(isRetryableStatus(500)).toBe(false);
    expect(isNonRetryableStatus(500)).toBe(true);
  });

  it('retryable and non-retryable lists are disjoint', () => {
    const retryable = new Set(RETRYABLE_STATUS_CODES);
    const nonRetryable = new Set(NON_RETRYABLE_STATUS_CODES);
    const intersection = [...retryable].filter((x) => nonRetryable.has(x));
    expect(intersection).toHaveLength(0);
  });

  it('covers all documented HTTP error codes', () => {
    const allCodes = [...RETRYABLE_STATUS_CODES, ...NON_RETRYABLE_STATUS_CODES];
    expect(allCodes).toContain(400);
    expect(allCodes).toContain(401);
    expect(allCodes).toContain(403);
    expect(allCodes).toContain(405);
    expect(allCodes).toContain(429);
    expect(allCodes).toContain(500);
    expect(allCodes).toContain(502);
  });
});

describe('HTTP Status Code Mapping', () => {
  // 400 Bad Request
  it('maps INVALID_JSON to 400', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.INVALID_JSON)).toBe(400);
  });

  it('maps MISSING_TEXT to 400', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.MISSING_TEXT)).toBe(400);
  });

  it('maps TEXT_TOO_LONG to 400', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.TEXT_TOO_LONG)).toBe(400);
  });

  it('maps TEXT_EMPTY to 400', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.TEXT_EMPTY)).toBe(400);
  });

  it('maps INVALID_REQUEST to 400', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.INVALID_REQUEST)).toBe(400);
  });

  // 401 Unauthorized
  it('maps MISSING_API_KEY to 401', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.MISSING_API_KEY)).toBe(401);
  });

  it('maps INVALID_API_KEY to 401', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.INVALID_API_KEY)).toBe(401);
  });

  // 403 Forbidden
  it('maps ORIGIN_NOT_ALLOWED to 403', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.ORIGIN_NOT_ALLOWED)).toBe(403);
  });

  // 405 Method Not Allowed
  it('maps METHOD_NOT_ALLOWED to 405', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.METHOD_NOT_ALLOWED)).toBe(405);
  });

  // 429 Too Many Requests
  it('maps RATE_LIMITED to 429', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.RATE_LIMITED)).toBe(429);
  });

  // 500 Internal Server Error
  it('maps INTERNAL_ERROR to 500', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.INTERNAL_ERROR)).toBe(500);
  });

  // 502 Bad Gateway
  it('maps PROVIDER_ERROR to 502', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.PROVIDER_ERROR)).toBe(502);
  });

  it('maps PROVIDER_TIMEOUT to 502', () => {
    expect(getHttpStatusForErrorCode(ErrorCode.PROVIDER_TIMEOUT)).toBe(502);
  });
});

describe('Pre-built Error Responses', () => {
  describe('400 Bad Request errors', () => {
    it('invalidJsonError has correct shape', () => {
      const error = invalidJsonError();
      expect(error.error.code).toBe(ErrorCode.INVALID_JSON);
      expect(error.error.message).toContain('JSON');
    });

    it('missingTextError has correct shape', () => {
      const error = missingTextError();
      expect(error.error.code).toBe(ErrorCode.MISSING_TEXT);
      expect(error.error.message).toContain('text');
    });

    it('emptyTextError has correct shape', () => {
      const error = emptyTextError();
      expect(error.error.code).toBe(ErrorCode.TEXT_EMPTY);
      expect(error.error.message).toContain('empty');
    });

    it('textTooLongError includes maxLength in details', () => {
      const error = textTooLongError(512);
      expect(error.error.code).toBe(ErrorCode.TEXT_TOO_LONG);
      expect(error.error.message).toContain('512');
      expect(error.error.details).toEqual({ maxLength: 512 });
    });

    it('invalidRequestError accepts custom message', () => {
      const error = invalidRequestError('Custom validation error');
      expect(error.error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(error.error.message).toBe('Custom validation error');
    });
  });

  describe('401 Unauthorized errors', () => {
    it('missingApiKeyError has correct shape', () => {
      const error = missingApiKeyError();
      expect(error.error.code).toBe(ErrorCode.MISSING_API_KEY);
      expect(error.error.message).toContain('x-api-key');
    });

    it('invalidApiKeyError has correct shape and no sensitive details', () => {
      const error = invalidApiKeyError();
      expect(error.error.code).toBe(ErrorCode.INVALID_API_KEY);
      expect(error.error.message).not.toContain('expected');
      expect(error.error.details).toBeUndefined();
    });
  });

  describe('403 Forbidden errors', () => {
    it('originNotAllowedError has correct shape', () => {
      const error = originNotAllowedError();
      expect(error.error.code).toBe(ErrorCode.ORIGIN_NOT_ALLOWED);
      expect(error.error.message).toContain('Origin');
    });
  });

  describe('405 Method Not Allowed errors', () => {
    it('methodNotAllowedError includes allowed methods', () => {
      const error = methodNotAllowedError(['POST', 'OPTIONS']);
      expect(error.error.code).toBe(ErrorCode.METHOD_NOT_ALLOWED);
      expect(error.error.message).toContain('POST');
      expect(error.error.message).toContain('OPTIONS');
      expect(error.error.details).toEqual({ allowed: ['POST', 'OPTIONS'] });
    });
  });

  describe('429 Too Many Requests errors', () => {
    it('rateLimitedError has correct shape without retryAfter', () => {
      const error = rateLimitedError();
      expect(error.error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.error.message).toContain('retry');
      expect(error.error.details).toBeUndefined();
    });

    it('rateLimitedError includes retryAfter when provided', () => {
      const error = rateLimitedError(60);
      expect(error.error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('500 Internal Server Error', () => {
    it('internalError has correct shape with generic message', () => {
      const error = internalError();
      expect(error.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.error.message).not.toContain('stack');
      expect(error.error.details).toBeUndefined();
    });
  });

  describe('502 Bad Gateway errors', () => {
    it('providerError has correct shape without provider name', () => {
      const error = providerError();
      expect(error.error.code).toBe(ErrorCode.PROVIDER_ERROR);
      expect(error.error.message).toContain('retry');
      expect(error.error.details).toBeUndefined();
    });

    it('providerError includes provider name when provided', () => {
      const error = providerError('geonames');
      expect(error.error.code).toBe(ErrorCode.PROVIDER_ERROR);
      expect(error.error.details).toEqual({ provider: 'geonames' });
    });

    it('providerTimeoutError has correct shape', () => {
      const error = providerTimeoutError('geonames');
      expect(error.error.code).toBe(ErrorCode.PROVIDER_TIMEOUT);
      expect(error.error.message).toContain('timed out');
      expect(error.error.details).toEqual({ provider: 'geonames' });
    });
  });
});

describe('Security: No Sensitive Data Leakage', () => {
  it('invalidApiKeyError does not reveal expected key', () => {
    const error = invalidApiKeyError();
    const errorStr = JSON.stringify(error);
    expect(errorStr).not.toMatch(/key.*=/i);
    expect(errorStr).not.toMatch(/expected/i);
  });

  it('internalError does not expose stack traces', () => {
    const error = internalError();
    const errorStr = JSON.stringify(error);
    expect(errorStr).not.toMatch(/stack/i);
    expect(errorStr).not.toMatch(/trace/i);
    expect(errorStr).not.toMatch(/at\s+\w+/);
  });
});
