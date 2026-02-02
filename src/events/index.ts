import type { EventStatus } from '../db/schema';
import { truncateProviderResponse } from '../db/schema';

export interface GeocodeEventPayload {
  inputRaw: string;
  normalizedKey: string;
  status: EventStatus;
  provider?: string | null;
  providerResponse?: unknown;
  requestId?: string | null;
}

export function serializeProviderResponse(response: unknown): string | null {
  if (response === undefined || response === null) {
    return null;
  }

  if (typeof response === 'string') {
    return truncateProviderResponse(response);
  }

  try {
    return truncateProviderResponse(JSON.stringify(response));
  } catch {
    return truncateProviderResponse(String(response));
  }
}

export async function recordGeocodeEvent(
  db: D1Database,
  payload: GeocodeEventPayload
): Promise<void> {
  const sql = `
    INSERT INTO geocode_events (
      input_raw,
      input_norm_key,
      status,
      provider,
      provider_response,
      request_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  await db
    .prepare(sql)
    .bind(
      payload.inputRaw,
      payload.normalizedKey,
      payload.status,
      payload.provider ?? null,
      serializeProviderResponse(payload.providerResponse),
      payload.requestId ?? null
    )
    .run();
}
