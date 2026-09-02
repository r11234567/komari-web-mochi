const CACHE_LIMIT = 64;

interface CacheEntry<T> {
  promise: Promise<T>;
  /** 0 while the request is still in flight. */
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function sweep(now: number) {
  if (cache.size <= CACHE_LIMIT) return;
  for (const [key, entry] of cache) {
    if (entry.expiresAt !== 0 && entry.expiresAt <= now) cache.delete(key);
  }
}

const abortReason = (signal: AbortSignal): unknown =>
  (signal as { reason?: unknown }).reason ?? new DOMException("Aborted", "AbortError");

/**
 * Share one in-flight request across every caller asking for the same key, and
 * keep its result for `ttlMs` afterwards. The shared request owns its own
 * lifetime so that one caller unmounting cannot cancel it for the others —
 * pair it with `withAbort` to give each caller its own cancellation.
 */
export function dedupe<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && (cached.expiresAt === 0 || cached.expiresAt > now)) return cached.promise;

  const entry = { expiresAt: 0 } as CacheEntry<T>;
  entry.promise = (async () => factory())().then(
    (value) => {
      entry.expiresAt = Date.now() + ttlMs;
      return value;
    },
    (error) => {
      cache.delete(key);
      throw error;
    },
  );
  cache.set(key, entry as CacheEntry<unknown>);
  sweep(now);
  return entry.promise;
}

/** Reject for this caller once its signal aborts, leaving the shared request running. */
export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    const settle = () => signal.removeEventListener("abort", onAbort);
    promise.then(
      (value) => {
        settle();
        resolve(value);
      },
      (error) => {
        settle();
        reject(error);
      },
    );
  });
}

/**
 * Floor the window end onto a `stepMs` boundary. Requests issued moments apart
 * otherwise each carry their own `Date.now()` and can never share a cache key.
 */
export function quantizedWindow(hours: number, stepMs: number) {
  const end = new Date(Math.floor(Date.now() / stepMs) * stepMs);
  return { start: new Date(end.getTime() - hours * 3_600_000), end };
}
