// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("fixed-window rate limiter", () => {
  it("isolates keys, enforces the exact boundary, and resets windows", () => {
    let now = 1000;
    const limiter = createRateLimiter({ limit: 2, windowMs: 100, now: () => now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    now += 100;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("removes stale keys and keeps the entry map bounded", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, maxEntries: 3, now: () => now });
    limiter.check("a");
    now += 1;
    limiter.check("b");
    now += 1;
    limiter.check("c");
    expect(limiter.size()).toBe(3);
    now = 101;
    limiter.check("d");
    expect(limiter.size()).toBeLessThanOrEqual(3);
    expect(limiter.has("a")).toBe(false);
  });
});
