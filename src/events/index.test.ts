import { describe, expect, it } from 'vitest';
import { MAX_PROVIDER_RESPONSE_LENGTH } from '../db/schema';
import { recordGeocodeEvent } from './index';

function createEventMock() {
  const captured: { sql: string; bindings: unknown[]; runCount: number } = {
    sql: '',
    bindings: [],
    runCount: 0,
  };

  const db = {
    prepare: (sql: string) => {
      captured.sql = sql;
      return {
        bind: (...bindings: unknown[]) => {
          captured.bindings = bindings;
          return {
            run: async () => {
              captured.runCount += 1;
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, captured };
}

describe('F030 geocode_events logging', () => {
  it('records event with serialized provider response', async () => {
    const { db, captured } = createEventMock();

    await recordGeocodeEvent(db, {
      inputRaw: 'Riyadh, Saudi Arabia',
      normalizedKey: 'SA||riyadh|',
      status: 'resolved',
      provider: 'geonames',
      providerResponse: { candidates: 3, usedFallback: false },
      requestId: 'req-123',
    });

    expect(captured.runCount).toBe(1);
    expect(captured.sql).toContain('INSERT INTO geocode_events');
    expect(captured.bindings).toEqual([
      'Riyadh, Saudi Arabia',
      'SA||riyadh|',
      'resolved',
      'geonames',
      JSON.stringify({ candidates: 3, usedFallback: false }),
      'req-123',
    ]);
  });

  it('truncates long provider responses safely', async () => {
    const { db, captured } = createEventMock();
    const longValue = 'a'.repeat(MAX_PROVIDER_RESPONSE_LENGTH + 50);

    await recordGeocodeEvent(db, {
      inputRaw: 'Riyadh, Saudi Arabia',
      normalizedKey: 'SA||riyadh|',
      status: 'error',
      provider: 'geonames',
      providerResponse: longValue,
      requestId: null,
    });

    const stored = captured.bindings[4];
    expect(typeof stored).toBe('string');
    if (typeof stored !== 'string') {
      throw new Error('Expected provider_response to be a string');
    }
    expect(stored.length).toBe(MAX_PROVIDER_RESPONSE_LENGTH);
    expect(stored.endsWith('...')).toBe(true);
  });

  it('stores null when provider response is missing', async () => {
    const { db, captured } = createEventMock();

    await recordGeocodeEvent(db, {
      inputRaw: 'Riyadh, Saudi Arabia',
      normalizedKey: 'SA||riyadh|',
      status: 'hit',
      provider: null,
      requestId: 'req-456',
    });

    expect(captured.bindings[4]).toBeNull();
  });
});
