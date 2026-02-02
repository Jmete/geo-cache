import { isAmbiguousResult, sortCandidatesDeterministically } from '../normalize';
import type { ScoredCandidate } from '../types/api';

export interface SelectionResult {
  best: ScoredCandidate | null;
  sorted: ScoredCandidate[];
  ambiguous: boolean;
  confidence: number | null;
}

function filterCandidatesByCountry(
  candidates: ScoredCandidate[],
  countryIso2?: string | null
): ScoredCandidate[] {
  if (!countryIso2) {
    return candidates;
  }

  const target = countryIso2.toUpperCase();
  return candidates.filter(
    (candidate) => candidate.countryIso2.toUpperCase() === target
  );
}

function ambiguousConfidence(bestScore: number, secondScore: number): number {
  const average = (bestScore + secondScore) / 2;
  return Math.min(bestScore, Math.max(0, average));
}

export function selectBestCandidate(
  candidates: ScoredCandidate[],
  countryIso2?: string | null
): SelectionResult {
  const filtered = filterCandidatesByCountry(candidates, countryIso2);
  const sorted = sortCandidatesDeterministically(filtered);
  const best = sorted[0] ?? null;

  if (!best) {
    return {
      best: null,
      sorted: [],
      ambiguous: false,
      confidence: null,
    };
  }

  const ambiguous = isAmbiguousResult(sorted);
  const confidence =
    ambiguous && sorted[1]
      ? ambiguousConfidence(best.score, sorted[1].score)
      : best.score;

  return {
    best,
    sorted,
    ambiguous,
    confidence,
  };
}
