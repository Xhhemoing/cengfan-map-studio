import { describe, expect, it, vi } from "vitest";
import {
  COLLABORATION_GET_RETRY_DELAYS,
  COLLABORATION_REQUEST_TIMEOUT_MS,
  CollaborationClientError,
  fetchRoom,
  fetchRoomOperations,
  isCollaborationAbortError,
  isCollaborationTransportError,
  submitRoomOperations,
} from "./collaboration-client";
import { createManualClock, neverSettles, ok } from "./collaboration-client-test-fixtures";

describe("collaboration HTTP partition handling", () => {
  it("rejects a never-settling GET at the abort deadline instead of hanging forever", async () => {
    vi.useFakeTimers();
    try {
      const signals: (AbortSignal | undefined)[] = [];
      const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        return neverSettles();
      });

      const pending = fetchRoom("ABC123", "owner-token", request);
      const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(
        (COLLABORATION_GET_RETRY_DELAYS.length + 1) * COLLABORATION_REQUEST_TIMEOUT_MS + 10_000,
      );
      await settled;

      // 有界重试:超时不是无限重连,尝试次数 = 退避序列长度 + 1。
      expect(request).toHaveBeenCalledTimes(COLLABORATION_GET_RETRY_DELAYS.length + 1);
      expect(signals.every((signal) => signal?.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries an idempotent GET with jittered backoff and recovers on the next attempt", async () => {
    const clock = createManualClock();
    let attempts = 0;
    const request = vi.fn(() => {
      attempts += 1;
      return attempts < 3 ? neverSettles() : ok({ id: "ABC123", version: 5, afterVersion: 4, operations: [] });
    });

    const pending = fetchRoomOperations("ABC123", "owner-token", 4, {
      request,
      timeoutMs: 5_000,
      retryDelays: [400, 800],
      random: () => 0.5,
      schedule: clock.schedule,
    });

    await vi.waitFor(() => expect(clock.pending).toBe(1));
    await clock.fireNext();
    // equal jitter:400/2 + 400/2*0.5 = 300。
    await vi.waitFor(() => expect(clock.delays).toEqual([5_000, 300]));
    await clock.fireNext();
    await vi.waitFor(() => expect(clock.delays).toEqual([5_000, 300, 5_000]));
    await clock.fireNext();
    await vi.waitFor(() => expect(clock.delays).toEqual([5_000, 300, 5_000, 600]));
    await clock.fireNext();

    await expect(pending).resolves.toMatchObject({ version: 5, operations: [] });
    expect(request).toHaveBeenCalledTimes(3);
    expect(clock.pending).toBe(0);
  });

  it("keeps every jittered retry delay inside [delay/2, delay]", async () => {
    for (const random of [0, 0.25, 1]) {
      const clock = createManualClock();
      const request = vi.fn(() => neverSettles());
      const pending = fetchRoom("ABC123", "owner-token", {
        request,
        timeoutMs: 1_000,
        retryDelays: [800],
        random: () => random,
        schedule: clock.schedule,
      });
      const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });

      await vi.waitFor(() => expect(clock.pending).toBe(1));
      await clock.fireNext();
      await vi.waitFor(() => expect(clock.delays).toHaveLength(2));
      const backoff = clock.delays[1]!;
      expect(backoff).toBeGreaterThanOrEqual(400);
      expect(backoff).toBeLessThanOrEqual(800);
      await clock.fireNext();
      await vi.waitFor(() => expect(clock.pending).toBe(1));
      await clock.fireNext();
      await settled;
      expect(clock.pending).toBe(0);
    }
  });

  it("retries a 503 on an idempotent GET but never a client error", async () => {
    const clock = createManualClock();
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ error: { code: "UPSTREAM", message: "网关错误" } }, 503))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 2, ready: true }));

    const recovered = fetchRoom("ABC123", "owner-token", { request, retryDelays: [300], schedule: clock.schedule });
    await vi.waitFor(() => expect(clock.delays).toHaveLength(2));
    await clock.fireNext();
    await expect(recovered).resolves.toMatchObject({ version: 2 });
    expect(request).toHaveBeenCalledTimes(2);

    const conflicting = vi.fn(() => ok({ error: { code: "VERSION_CONFLICT", message: "历史裁剪", currentVersion: 9 } }, 409));
    await expect(fetchRoomOperations("ABC123", "owner-token", 1, {
      request: conflicting,
      retryDelays: [300],
      schedule: clock.schedule,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 9 });
    expect(conflicting).toHaveBeenCalledTimes(1);
  });

  it("never replays a non-idempotent transaction, but still bounds it by a deadline", async () => {
    const clock = createManualClock();
    const request = vi.fn(() => neverSettles());

    const pending = submitRoomOperations("ABC123", "owner-token", {
      txId: "tx-1",
      clientId: "c1",
      baseVersion: 1,
      operations: [{ type: "set", path: ["title"], value: "甲" }],
    }, { request, timeoutMs: 2_000, schedule: clock.schedule });
    const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });

    await vi.waitFor(() => expect(clock.pending).toBe(1));
    await clock.fireNext();
    await settled;

    expect(request).toHaveBeenCalledTimes(1);
    expect(clock.pending).toBe(0);
  });

  it("honours an external abort signal without retrying and without issuing new requests", async () => {
    const clock = createManualClock();
    const controller = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return neverSettles();
    });

    const pending = fetchRoom("ABC123", "owner-token", {
      request,
      signal: controller.signal,
      retryDelays: [300],
      schedule: clock.schedule,
    });
    const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    controller.abort();
    await settled;
    expect(seen[0]?.aborted).toBe(true);
    expect(clock.pending).toBe(0);

    // 已取消的信号不再发起任何请求。
    await expect(fetchRoom("ABC123", "owner-token", { request, signal: controller.signal }))
      .rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("classifies transport failures apart from protocol failures", async () => {
    const failing = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await fetchRoom("ABC123", "owner-token", { request: failing, retryDelays: [] })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CollaborationClientError);
    expect(isCollaborationTransportError(error)).toBe(true);
    expect(isCollaborationAbortError(error)).toBe(false);
    expect(isCollaborationTransportError(new CollaborationClientError("ROOM_CLOSED", "已关闭"))).toBe(false);
    expect(isCollaborationAbortError(new CollaborationClientError("REQUEST_ABORTED", "已取消"))).toBe(true);
  });
});
