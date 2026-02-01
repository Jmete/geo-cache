/**
 * Error handling utilities for Geo-Cache API
 *
 * Provides consistent error response generation and classification
 * for all non-2xx responses (except OPTIONS preflight).
 */

import type { ErrorResponse, HttpErrorCode } from '../types/api';

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Machine-readable error codes for API errors
 */
export const ErrorCode = {
  // 400 Bad Request
  INVALID_JSON: 'INVALID_JSON',
  MISSING_TEXT: 'MISSING_TEXT',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG',
  TEXT_EMPTY: 'TEXT_EMPTY',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // 401 Unauthorized
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_API_KEY: 'INVALID_API_KEY',

  // 403 Forbidden
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',

  // 405 Method Not Allowed
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',

  // 429 Too Many Requests
  RATE_LIMITED: 'RATE_LIMITED',

  // 500 Internal Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // 502 Bad Gateway
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// =============================================================================
// Retryable Error Classification
// =============================================================================

/**
 * HTTP status codes that indicate retryable errors
 * Client should implement exponential backoff for these
 */
export const RETRYABLE_STATUS_CODES: readonly HttpErrorCode[] = [429, 502];

/**
 * HTTP status codes that indicate non-retryable errors
 * Client should not retry these automatically
 */
export const NON_RETRYABLE_STATUS_CODES: readonly HttpErrorCode[] = [
  400, 401, 403, 405, 500,
];

/**
 * Check if an HTTP status code indicates a retryable error
 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.includes(status as HttpErrorCode);
}

/**
 * Check if an HTTP status code indicates a non-retryable error
 */
export function isNonRetryableStatus(status: number): boolean {
  return NON_RETRYABLE_STATUS_CODES.includes(status as HttpErrorCode);
}

// =============================================================================
// Error Response Factory
// =============================================================================

/**
 * Create a standardized error response object
 */
export function createErrorResponse(
  code: ErrorCodeType,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  const response: ErrorResponse = {
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    response.error.details = details;
  }

  return response;
}

// =============================================================================
// Pre-built Error Responses
// =============================================================================

// 400 Bad Request
export const invalidJsonError = () =>
  createErrorResponse(ErrorCode.INVALID_JSON, 'Request body must be valid JSON');

export const missingTextError = () =>
  createErrorResponse(ErrorCode.MISSING_TEXT, 'Missing required field: text');

export const emptyTextError = () =>
  createErrorResponse(ErrorCode.TEXT_EMPTY, 'Field "text" cannot be empty');

export const textTooLongError = (maxLength: number) =>
  createErrorResponse(
    ErrorCode.TEXT_TOO_LONG,
    `Field "text" exceeds maximum length of ${maxLength} characters`,
    { maxLength }
  );

export const invalidRequestError = (message: string) =>
  createErrorResponse(ErrorCode.INVALID_REQUEST, message);

// 401 Unauthorized
export const missingApiKeyError = () =>
  createErrorResponse(
    ErrorCode.MISSING_API_KEY,
    'Missing required header: x-api-key'
  );

export const invalidApiKeyError = () =>
  createErrorResponse(ErrorCode.INVALID_API_KEY, 'Invalid API key');

// 403 Forbidden
export const originNotAllowedError = () =>
  createErrorResponse(ErrorCode.ORIGIN_NOT_ALLOWED, 'Origin not allowed');

// 405 Method Not Allowed
export const methodNotAllowedError = (allowed: string[]) =>
  createErrorResponse(
    ErrorCode.METHOD_NOT_ALLOWED,
    `Method not allowed. Allowed methods: ${allowed.join(', ')}`,
    { allowed }
  );

// 429 Too Many Requests
export const rateLimitedError = (retryAfter?: number) =>
  createErrorResponse(
    ErrorCode.RATE_LIMITED,
    'Rate limit exceeded. Please retry later.',
    retryAfter !== undefined ? { retryAfter } : undefined
  );

// 500 Internal Server Error
export const internalError = () =>
  createErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    'An internal error occurred. Please try again later.'
  );

// 502 Bad Gateway
export const providerError = (provider?: string) =>
  createErrorResponse(
    ErrorCode.PROVIDER_ERROR,
    'Geocoding provider returned an error. Please retry.',
    provider !== undefined ? { provider } : undefined
  );

export const providerTimeoutError = (provider?: string) =>
  createErrorResponse(
    ErrorCode.PROVIDER_TIMEOUT,
    'Geocoding provider request timed out. Please retry.',
    provider !== undefined ? { provider } : undefined
  );

// =============================================================================
// HTTP Status Code Mapping
// =============================================================================

/**
 * Map error codes to their corresponding HTTP status codes
 */
export function getHttpStatusForErrorCode(code: ErrorCodeType): HttpErrorCode {
  switch (code) {
    // 400 Bad Request
    case ErrorCode.INVALID_JSON:
    case ErrorCode.MISSING_TEXT:
    case ErrorCode.TEXT_TOO_LONG:
    case ErrorCode.TEXT_EMPTY:
    case ErrorCode.INVALID_REQUEST:
      return 400;

    // 401 Unauthorized
    case ErrorCode.MISSING_API_KEY:
    case ErrorCode.INVALID_API_KEY:
      return 401;

    // 403 Forbidden
    case ErrorCode.ORIGIN_NOT_ALLOWED:
      return 403;

    // 405 Method Not Allowed
    case ErrorCode.METHOD_NOT_ALLOWED:
      return 405;

    // 429 Too Many Requests
    case ErrorCode.RATE_LIMITED:
      return 429;

    // 502 Bad Gateway
    case ErrorCode.PROVIDER_ERROR:
    case ErrorCode.PROVIDER_TIMEOUT:
      return 502;

    // 500 Internal Server Error (default)
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}
