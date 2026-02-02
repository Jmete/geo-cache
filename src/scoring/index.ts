/**
 * Candidate Scoring (F024)
 *
 * Computes deterministic 0..1 scores for provider candidates using:
 * - Country match
 * - Admin1/city similarity
 * - Feature type match
 * - Importance proxy (population)
 */

import { normalizeToken } from '../normalize';
import type { Granularity, ProviderCandidate, ScoredCandidate } from '../types/api';

export interface ScoringContext {
  countryIso2?: string | null;
  admin1?: string | null;
  city?: string | null;
  granularityHint: Granularity;
}

export interface ScoringWeights {
  country: number;
  admin1: number;
  city: number;
  feature: number;
  importance: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  country: 0.35,
  admin1: 0.2,
  city: 0.25,
  feature: 0.1,
  importance: 0.1,
};

const MAX_POPULATION = 50_000_000;
const LOG_MAX_POPULATION = Math.log10(MAX_POPULATION);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prev = new Uint32Array(bLen + 1);
  const curr = new Uint32Array(bLen + 1);

  for (let j = 0; j <= bLen; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const prevJ = prev[j] ?? 0;
      const currJMinus = curr[j - 1] ?? 0;
      const prevJMinus = prev[j - 1] ?? 0;
      curr[j] = Math.min(prevJ + 1, currJMinus + 1, prevJMinus + cost);
    }
    for (let j = 0; j <= bLen; j += 1) {
      prev[j] = curr[j] ?? 0;
    }
  }

  return prev[bLen] ?? 0;
}

export function tokenSimilarity(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const normA = normalizeToken(a ?? '');
  const normB = normalizeToken(b ?? '');

  if (!normA || !normB) {
    return 0;
  }

  if (normA === normB) {
    return 1;
  }

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) {
    return 0;
  }

  const distance = levenshteinDistance(normA, normB);
  return clamp(1 - distance / maxLen, 0, 1);
}

function featureMatchScore(
  candidate: ProviderCandidate,
  granularityHint: Granularity
): number {
  const featureClass = candidate.featureClass?.toUpperCase();
  const featureCode = candidate.featureCode?.toUpperCase();

  if (!featureClass && !featureCode) {
    return 0;
  }

  if (granularityHint === 'city') {
    if (featureCode?.startsWith('PPL')) return 1;
    if (featureClass === 'P') return 0.7;
    return 0;
  }

  if (granularityHint === 'region') {
    if (featureCode === 'ADM1') return 1;
    if (featureClass === 'A') return 0.7;
    return 0;
  }

  // country or multi
  if (featureCode === 'PCLI') return 1;
  if (featureClass === 'A') return 0.7;
  return 0;
}

function populationScore(population?: number): number {
  if (!population || population <= 0) {
    return 0;
  }

  const capped = Math.min(population, MAX_POPULATION);
  const normalized = Math.log10(capped) / LOG_MAX_POPULATION;
  return clamp(normalized, 0, 1);
}

export function computeConfidence(score: number): number {
  return clamp(score, 0, 1);
}

export function scoreCandidate(
  candidate: ProviderCandidate,
  context: ScoringContext,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): ScoredCandidate {
  const countryScore =
    context.countryIso2 &&
    candidate.countryIso2.toUpperCase() === context.countryIso2.toUpperCase()
      ? 1
      : 0;

  const admin1Score =
    context.admin1 !== undefined && context.admin1 !== null
      ? tokenSimilarity(context.admin1, candidate.admin1)
      : 0;

  const cityScore =
    context.city !== undefined && context.city !== null
      ? tokenSimilarity(context.city, candidate.city)
      : 0;

  const featureScore = featureMatchScore(candidate, context.granularityHint);
  const importanceScore = populationScore(candidate.population);

  const weightedParts: Array<{ weight: number; value: number }> = [];

  if (context.countryIso2) {
    weightedParts.push({ weight: weights.country, value: countryScore });
  }
  if (context.admin1 !== undefined && context.admin1 !== null) {
    weightedParts.push({ weight: weights.admin1, value: admin1Score });
  }
  if (context.city !== undefined && context.city !== null) {
    weightedParts.push({ weight: weights.city, value: cityScore });
  }

  weightedParts.push({ weight: weights.feature, value: featureScore });
  weightedParts.push({ weight: weights.importance, value: importanceScore });

  const totalWeight = weightedParts.reduce((sum, part) => sum + part.weight, 0);
  const rawScore = weightedParts.reduce(
    (sum, part) => sum + part.weight * part.value,
    0
  );

  const score = totalWeight > 0 ? rawScore / totalWeight : 0;

  return {
    ...candidate,
    score: computeConfidence(score),
  };
}

export function scoreCandidates(
  candidates: ProviderCandidate[],
  context: ScoringContext,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): ScoredCandidate[] {
  return candidates.map((candidate) => scoreCandidate(candidate, context, weights));
}
