export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function createRateLimiter(options: { limit: number; windowMs: number; maxEntries?: number; now?: () => number }) {
  const entries = new Map<string, { startedAt: number; count: number }>();
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 10_000));
  const purge = (timestamp: number) => {
    for (const [key, entry] of entries) {
      if (timestamp - entry.startedAt >= options.windowMs) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };
  return {
    check(key: string): RateLimitResult {
      const timestamp = now();
      purge(timestamp);
      const current = entries.get(key);
      if (!current || timestamp - current.startedAt >= options.windowMs) {
        entries.set(key, { startedAt: timestamp, count: 1 });
        return { allowed: true, remaining: Math.max(0, options.limit - 1) };
      }
      if (current.count >= options.limit) {
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, options.windowMs - (timestamp - current.startedAt)) };
      }
      current.count += 1;
      return { allowed: true, remaining: Math.max(0, options.limit - current.count) };
    },
    reset() { entries.clear(); },
    size() { return entries.size; },
    has(key: string) { return entries.has(key); },
  };
}
