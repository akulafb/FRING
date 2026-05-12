import "server-only";

type CacheEntry = { expiresAtMs: number; payload: unknown };

const MAX_ENTRIES = 256;

const bucket = new Map<string, CacheEntry>();

function prune(now: number) {
  for (const [k, v] of bucket) {
    if (v.expiresAtMs <= now) {
      bucket.delete(k);
    }
  }
  if (bucket.size <= MAX_ENTRIES) {
    return;
  }
  const sorted = [...bucket.entries()].sort(
    (a, b) => a[1].expiresAtMs - b[1].expiresAtMs
  );
  const drop = bucket.size - MAX_ENTRIES;
  for (let i = 0; i < drop; i++) {
    bucket.delete(sorted[i][0]);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const now = Date.now();
  const hit = bucket.get(key);
  if (!hit || hit.expiresAtMs <= now) {
    if (hit) {
      bucket.delete(key);
    }
    return undefined;
  }
  return hit.payload as T;
}

export function cacheSet(key: string, payload: unknown, ttlMs: number) {
  const now = Date.now();
  prune(now);
  bucket.set(key, { expiresAtMs: now + ttlMs, payload });
}
