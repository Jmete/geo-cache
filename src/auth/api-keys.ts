import type { ApiKeyStatus, ApiKeyTier } from '../db/schema';

const encoder = new TextEncoder();
const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;
const API_KEY_CACHE_PREFIX = 'api_key:';
const API_KEY_CACHE_TTL_SECONDS = 60;

type ApiKeyCacheEntry = {
  tier: ApiKeyTier;
  status: ApiKeyStatus;
};

let cachedSecret: string | null = null;
let cachedCryptoKey: CryptoKey | null = null;

async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (cachedSecret === secret && cachedCryptoKey) {
    return cachedCryptoKey;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    HMAC_ALGORITHM,
    false,
    ['sign']
  );
  cachedSecret = secret;
  cachedCryptoKey = key;
  return key;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashApiKey(apiKey: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(apiKey));
  return toHex(signature);
}

export async function readApiKeyFromKv(
  kv: KVNamespace,
  keyHash: string
): Promise<ApiKeyCacheEntry | null> {
  const cached = await kv.get(`${API_KEY_CACHE_PREFIX}${keyHash}`, 'text');
  if (!cached) {
    return null;
  }
  try {
    const parsed = JSON.parse(cached) as ApiKeyCacheEntry;
    if (!parsed?.tier || !parsed?.status) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeApiKeyToKv(
  kv: KVNamespace,
  keyHash: string,
  entry: ApiKeyCacheEntry
): Promise<void> {
  await kv.put(`${API_KEY_CACHE_PREFIX}${keyHash}`, JSON.stringify(entry), {
    expirationTtl: API_KEY_CACHE_TTL_SECONDS,
  });
}

export async function readApiKeyFromD1(
  db: D1Database,
  keyHash: string
): Promise<ApiKeyCacheEntry | null> {
  const row = await db
    .prepare('SELECT tier, status FROM api_keys WHERE key_hash = ? LIMIT 1')
    .bind(keyHash)
    .first<ApiKeyCacheEntry>();
  if (!row?.tier || !row?.status) {
    return null;
  }
  return row;
}
