// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore, MAX_PERSISTED_ROOM_BYTES } from "./collaboration";

describe("collaboration room store persistence failure reporting", () => {
  it("reports one interval persistence error per failure streak and clears it on success", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const persist = vi.fn()
        .mockRejectedValueOnce(new Error("disk unavailable 1"))
        .mockRejectedValueOnce(new Error("disk unavailable 2"))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("disk unavailable 3"));
      const store = createRoomStore({
        generateId: () => "INTERVAL1",
        generateSecret: () => "owner-access",
        persist,
        persistIntervalMs: 25,
      });
      store.create({ revision: 0 }, { clientId: "owner", displayName: "Owner" });

      await vi.advanceTimersByTimeAsync(25);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenLastCalledWith(
        expect.stringContaining("interval persistence failed"),
        expect.objectContaining({ message: "disk unavailable 1" }),
      );

      await vi.advanceTimersByTimeAsync(25);
      expect(persist).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(25);
      expect(persist).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledTimes(1);

      store.apply("INTERVAL1", "owner-access", {
        txId: "new-failure-streak",
        clientId: "owner",
        baseVersion: 0,
        snapshot: { revision: 1 },
      });
      await vi.advanceTimersByTimeAsync(25);
      expect(error).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenLastCalledWith(
        expect.stringContaining("interval persistence failed"),
        expect.objectContaining({ message: "disk unavailable 3" }),
      );
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });

  it("records every explicit flush failure while keeping the last successful skip facts readable", async () => {
    let clock = 1_000;
    const roomIds = ["FAILSKIP", "FAILSMALL"];
    const persist = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk unavailable 1"))
      .mockRejectedValueOnce(new Error("disk unavailable 2"))
      .mockResolvedValueOnce(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => roomIds.shift()!,
        generateSecret: () => "owner-access",
        now: () => clock,
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist,
      });
      store.create({ payload: "x".repeat(MAX_PERSISTED_ROOM_BYTES) }, { clientId: "large-owner", displayName: "Large owner" });
      store.create({ title: "persist me" }, { clientId: "small-owner", displayName: "Small owner" });

      await store.flush();
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: ["FAILSKIP"],
        trimmedIds: [],
        at: 1_000,
      });

      clock = 2_000;
      await expect(store.flush()).rejects.toThrow("disk unavailable 1");
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: ["FAILSKIP"],
        trimmedIds: [],
        at: 1_000,
        lastFailure: { at: 2_000, message: "disk unavailable 1" },
      });

      clock = 3_000;
      await expect(store.flush()).rejects.toThrow("disk unavailable 2");
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: ["FAILSKIP"],
        trimmedIds: [],
        at: 1_000,
        lastFailure: { at: 3_000, message: "disk unavailable 2" },
      });

      clock = 4_000;
      await store.flush();
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: ["FAILSKIP"],
        trimmedIds: [],
        at: 4_000,
      });
      expect(store.lastPersistOutcome()?.lastFailure).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it("reports a persist failure that happened before any successful flush", async () => {
    const persist = vi.fn().mockRejectedValueOnce("disk on fire");
    const store = createRoomStore({
      generateId: () => "NEVERFLUSHED",
      generateSecret: () => "owner-access",
      now: () => 5_000,
      persistIntervalMs: Number.POSITIVE_INFINITY,
      persist,
    });
    store.create({ revision: 0 }, { clientId: "owner", displayName: "Owner" });

    await expect(store.flush()).rejects.toBe("disk on fire");

    expect(store.lastPersistOutcome()).toEqual({
      skippedIds: [],
      trimmedIds: [],
      at: 0,
      lastFailure: { at: 5_000, message: "disk on fire" },
    });
  });

  it("records interval persist failures without changing the deduped console report", async () => {
    vi.useFakeTimers();
    let clock = 1_000;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const persist = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("disk unavailable 1"))
        .mockRejectedValueOnce(new Error("disk unavailable 2"));
      const store = createRoomStore({
        generateId: () => "INTERVAL2",
        generateSecret: () => "owner-access",
        now: () => clock,
        persist,
        persistIntervalMs: 25,
      });
      store.create({ revision: 0 }, { clientId: "owner", displayName: "Owner" });

      await vi.advanceTimersByTimeAsync(25);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(store.lastPersistOutcome()).toEqual({ skippedIds: [], trimmedIds: [], at: 1_000 });

      for (const [tick, message] of [[2_000, "disk unavailable 1"], [3_000, "disk unavailable 2"]] as const) {
        clock = tick;
        store.apply("INTERVAL2", "owner-access", {
          txId: `interval-op-${tick}`,
          clientId: "owner",
          baseVersion: store.get("INTERVAL2")!.version,
          snapshot: { revision: tick },
        });
        await vi.advanceTimersByTimeAsync(25);
        expect(store.lastPersistOutcome()).toEqual({
          skippedIds: [],
          trimmedIds: [],
          at: 1_000,
          lastFailure: { at: tick, message },
        });
      }

      expect(persist).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenLastCalledWith(
        expect.stringContaining("interval persistence failed"),
        expect.objectContaining({ message: "disk unavailable 1" }),
      );
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});
