// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createServerLifecycle, validateProductionConfig } from "./production";

describe("production configuration", () => {
  it("rejects an unsafe production secret and missing AI access policy", () => {
    const result = validateProductionConfig({
      NODE_ENV: "production",
      AI_BUDGET_RECEIPT_SECRET: "short",
      AI_PRIMARY_API_KEY: "configured",
      AI_PRIMARY_MODEL: "model",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "AI_BUDGET_RECEIPT_SECRET_TOO_SHORT",
      "AI_ACCESS_POLICY_MISSING",
    ]));
  });

  it("rejects invalid proxy settings and accepts explicit public AI access", () => {
    expect(validateProductionConfig({ NODE_ENV: "production", AI_BUDGET_RECEIPT_SECRET: "x".repeat(32), TRUST_PROXY: "yes" }).errors)
      .toContain("TRUST_PROXY_INVALID");
    const result = validateProductionConfig({
      NODE_ENV: "production",
      AI_BUDGET_RECEIPT_SECRET: "x".repeat(32),
      AI_PRIMARY_API_KEY: "configured",
      AI_PRIMARY_MODEL: "model",
      AI_PUBLIC_ACCESS: "1",
      TRUST_PROXY: "1",
      DATA_DIR: "/srv/cengfan/data",
      SHUTDOWN_TIMEOUT_MS: "4000",
    });
    expect(result).toMatchObject({ ok: true, config: { trustProxy: true, dataDir: "/srv/cengfan/data", shutdownTimeoutMs: 4000 } });
  });

  it("keeps development compatible without production-only secrets", () => {
    expect(validateProductionConfig({ NODE_ENV: "development" })).toMatchObject({ ok: true, config: { nodeEnv: "development" } });
  });
});

describe("server lifecycle", () => {
  it("marks draining before close, flushes, and is idempotent", async () => {
    const order: string[] = [];
    const server = { close: vi.fn((callback: () => void) => { order.push("close"); callback(); }) };
    const flush = vi.fn(async () => { order.push("flush"); });
    const onDraining = vi.fn(() => { order.push("draining"); });
    const lifecycle = createServerLifecycle({ server, flush, onDraining, timeoutMs: 100 });

    const first = lifecycle.shutdown("SIGTERM");
    const second = lifecycle.shutdown("SIGINT");
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(lifecycle.isDraining()).toBe(true);
    expect(onDraining).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
    expect(order[0]).toBe("draining");
  });

  it("resolves after the timeout when close or flush does not finish", async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn() },
        flush: () => new Promise<void>(() => undefined),
        timeoutMs: 50,
      });
      const pending = lifecycle.shutdown();
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
