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

  it("drains long-lived connections after close and waits for both close and flush", async () => {
    const order: string[] = [];
    let releaseClose: (() => void) | undefined;
    const server = {
      close: vi.fn((callback: () => void) => {
        order.push("close");
        releaseClose = () => { order.push("closed"); callback(); };
      }),
    };
    const flush = vi.fn(async () => { order.push("flush"); });
    const drain = vi.fn(async () => { order.push("drain"); });
    const lifecycle = createServerLifecycle({ server, flush, drain, timeoutMs: 2_000 });

    let settled = false;
    const pending = lifecycle.shutdown("SIGTERM").then(() => { settled = true; });
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });

    // 排空必须发生在 close 之后（close 只停止接收新连接），刷盘再排在排空之后。
    expect(order).toEqual(["close", "drain", "flush"]);
    // flush 已完成，但连接还没走干净：此时结束关停会把在途请求直接丢掉。
    expect(settled).toBe(false);

    releaseClose!();
    await pending;
    expect(settled).toBe(true);
    expect(order).toEqual(["close", "drain", "flush", "closed"]);
  });

  it("invokes the deadline hook when in-flight connections outlive the timeout", async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn() },
        flush: async () => undefined,
        onTimeout,
        timeoutMs: 50,
      });
      const pending = lifecycle.shutdown();
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBeUndefined();
      expect(onTimeout).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a rejected flush to the hook and still completes before the deadline", async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error("ENOSPC: no space left on device");
      const onFlushError = vi.fn();
      const onTimeout = vi.fn();
      const flush = vi.fn(async () => { throw failure; });
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn((callback: () => void) => callback()) },
        flush,
        drain: vi.fn(),
        onFlushError,
        onTimeout,
        timeoutMs: 50,
      });

      // 没有推进时钟：关停必须靠 close+flush 自己走完，而不是被截止时间兜住。
      await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
      expect(onFlushError).toHaveBeenCalledOnce();
      expect(onFlushError).toHaveBeenCalledWith(failure, { phase: "flush" });
      expect(onTimeout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a rejected drain under the drain phase and still flushes afterwards", async () => {
    const failure = new Error("SSE 断流失败");
    const onFlushError = vi.fn();
    const flush = vi.fn(async () => undefined);
    const lifecycle = createServerLifecycle({
      server: { close: vi.fn((callback: () => void) => callback()) },
      flush,
      drain: async () => { throw failure; },
      onFlushError,
      timeoutMs: 100,
    });

    await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
    // 排空失败以前被 `.catch(() => undefined)` 吞掉：连接没走干净，退出码却仍是 0。
    expect(onFlushError).toHaveBeenCalledWith(failure, { phase: "drain" });
    // 排空失败不能连累落盘：状态照样要写到盘上。
    expect(flush).toHaveBeenCalledOnce();
  });

  it("falls back to console.error when no flush-error hook is provided", async () => {
    const failure = new Error("EROFS: read-only file system");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn((callback: () => void) => callback()) },
        flush: async () => { throw failure; },
        timeoutMs: 100,
      });
      await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError.mock.calls[0]).toContain(failure);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reports a synchronous close failure and a throwing deadline hook under their own phases", async () => {
    vi.useFakeTimers();
    try {
      const closeFailure = new Error("EADDRINUSE");
      const onFlushError = vi.fn();
      const flush = vi.fn(async () => undefined);
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn(() => { throw closeFailure; }) },
        flush,
        onFlushError,
        timeoutMs: 50,
      });
      await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
      expect(onFlushError).toHaveBeenCalledWith(closeFailure, { phase: "close" });
      expect(flush).toHaveBeenCalledOnce();

      const timeoutFailure = new Error("socket destroy failed");
      const onTimeoutError = vi.fn();
      const stalled = createServerLifecycle({
        server: { close: vi.fn() },
        flush: () => new Promise<void>(() => undefined),
        onTimeout: () => { throw timeoutFailure; },
        onFlushError: onTimeoutError,
        timeoutMs: 50,
      });
      const pending = stalled.shutdown("SIGTERM");
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBeUndefined();
      expect(onTimeoutError).toHaveBeenCalledWith(timeoutFailure, { phase: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("labels the default console.error report with the failing phase", async () => {
    const failure = new Error("ECONNRESET");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn((callback: () => void) => callback()) },
        flush: async () => undefined,
        drain: async () => { throw failure; },
        timeoutMs: 100,
      });
      await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalledOnce();
      // 默认日志要能区分排空失败与落盘失败，否则运维只知道「关停出事了」。
      expect(String(consoleError.mock.calls[0]?.[0])).toContain("排空连接失败");
      expect(consoleError.mock.calls[0]).toContain(failure);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("completes shutdown even when the flush-error hook itself throws", async () => {
    const onFlushError = vi.fn(() => { throw new Error("logger is down"); });
    const lifecycle = createServerLifecycle({
      server: { close: vi.fn((callback: () => void) => callback()) },
      flush: async () => { throw new Error("ENOSPC"); },
      onFlushError,
      timeoutMs: 100,
    });
    await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
    expect(onFlushError).toHaveBeenCalledOnce();
  });

  it("ignores a second signal that arrives while drain is still running", async () => {
    let releaseDrain: (() => void) | undefined;
    const drain = vi.fn(() => new Promise<void>((resolve) => { releaseDrain = resolve; }));
    const flush = vi.fn(async () => undefined);
    const onDraining = vi.fn();
    const server = { close: vi.fn((callback: () => void) => callback()) };
    const lifecycle = createServerLifecycle({ server, flush, drain, onDraining, timeoutMs: 2_000 });

    const first = lifecycle.shutdown("SIGTERM");
    await Promise.resolve();
    expect(drain).toHaveBeenCalledOnce();
    expect(flush).not.toHaveBeenCalled();

    // 排空还没结束时再来一个信号：不能重跑 drain/flush，也不能抛。
    const second = lifecycle.shutdown("SIGINT");
    const third = lifecycle.shutdown("SIGTERM");
    expect(second).toBe(first);
    expect(third).toBe(first);

    releaseDrain!();
    await expect(Promise.all([first, second, third])).resolves.toEqual([undefined, undefined, undefined]);
    expect(drain).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
    expect(onDraining).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
  });

  it("memoizes the shutdown promise before running any hook that could re-enter", async () => {
    const flush = vi.fn(async () => undefined);
    const drain = vi.fn();
    let reentrant: Promise<void> | undefined;
    // 排空钩子里再触发一次关停（信号处理器在同步段内重入的等价场景）。
    const onDraining = vi.fn(() => { reentrant = lifecycle.shutdown("SIGINT"); });
    const server = { close: vi.fn((callback: () => void) => callback()) };
    const lifecycle = createServerLifecycle({ server, flush, drain, onDraining, timeoutMs: 100 });

    const first = lifecycle.shutdown("SIGTERM");
    await first;
    await reentrant;

    expect(reentrant).toBe(first);
    expect(onDraining).toHaveBeenCalledOnce();
    expect(drain).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
  });

  // 这条曾经断言 shutdown() 把 onDraining 的异常抛出去。信号处理器里没人 catch，
  // 抛出去就是 uncaughtException：进程死在关停中途，close/drain/flush 一个都没跑。
  it("does not let a throwing draining hook escape the signal handler, and still closes, drains and flushes", async () => {
    const failure = new Error("draining hook exploded");
    const onFlushError = vi.fn();
    const flush = vi.fn(async () => undefined);
    const drain = vi.fn(async () => undefined);
    const server = { close: vi.fn((callback: () => void) => callback()) };
    const lifecycle = createServerLifecycle({
      server,
      flush,
      drain,
      onDraining: () => { throw failure; },
      onFlushError,
      timeoutMs: 100,
    });

    await expect(lifecycle.shutdown("SIGTERM")).resolves.toBeUndefined();
    expect(onFlushError).toHaveBeenCalledWith(failure, { phase: "draining" });
    expect(server.close).toHaveBeenCalledOnce();
    expect(drain).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("still lands the memoized shutdown at the deadline when a draining hook throws", async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = createServerLifecycle({
        server: { close: vi.fn() },
        flush: async () => undefined,
        onDraining: () => { throw new Error("draining hook exploded"); },
        timeoutMs: 50,
      });
      const first = lifecycle.shutdown("SIGTERM");
      // 记名的 promise 已经存在，第二个信号会拿到它：它必须能落地，不能永远挂着。
      const pending = lifecycle.shutdown("SIGINT");
      expect(pending).toBe(first);
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
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
