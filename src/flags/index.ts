/**
 * Validation Flags (F027)
 *
 * Computes validation-related flags like adminMismatch and providerFallback.
 */

import { tokenSimilarity } from '../scoring';
import type { GeocodeFlags, ParsedLocation, ProviderCandidate } from '../types/api';

export const ADMIN_MISMATCH_THRESHOLD = 0.6;

export function isAdminMismatch(
  inputAdmin1: string | null | undefined,
  candidateAdmin1: string | null | undefined,
  threshold: number = ADMIN_MISMATCH_THRESHOLD
): boolean {
  if (!inputAdmin1 || inputAdmin1.trim().length === 0) {
    return false;
  }

  const similarity = tokenSimilarity(inputAdmin1, candidateAdmin1);
  return similarity < threshold;
}

export interface ValidationFlagsContext {
  parsed: ParsedLocation;
  bestCandidate: ProviderCandidate | null;
  usedFallback: boolean;
  adminMismatchThreshold?: number;
}

export function buildValidationFlags(context: ValidationFlagsContext): GeocodeFlags {
  const flags: GeocodeFlags = {};

  if (context.usedFallback) {
    flags.providerFallback = true;
  }

  if (context.parsed.admin1 && context.bestCandidate) {
    const threshold = context.adminMismatchThreshold ?? ADMIN_MISMATCH_THRESHOLD;
    if (isAdminMismatch(context.parsed.admin1, context.bestCandidate.admin1, threshold)) {
      flags.adminMismatch = true;
    }
  }

  return flags;
}
