import type { GeocodeResponse } from '../types/api';

export const KV_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const record = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        const entry = record[key];
        if (entry !== undefined) {
          sorted[key] = entry;
        }
      }
      return sorted;
    }
    return val;
  });
}

export function serializeGeocodeResponse(response: GeocodeResponse): string {
  return stableJsonStringify(response);
}

export function withCacheHit(
  response: GeocodeResponse,
  hit: boolean
): GeocodeResponse {
  return {
    ...response,
    cache: { hit },
  };
}

export async function readGeocodeFromKv(
  kv: KVNamespace,
  key: string
): Promise<GeocodeResponse | null> {
  const cached = await kv.get(key, 'text');
  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as GeocodeResponse;
  } catch {
    return null;
  }
}

export async function writeGeocodeToKv(
  kv: KVNamespace,
  key: string,
  response: GeocodeResponse
): Promise<void> {
  const payload = withCacheHit(response, true);
  const serialized = serializeGeocodeResponse(payload);
  await kv.put(key, serialized, { expirationTtl: KV_CACHE_TTL_SECONDS });
}
