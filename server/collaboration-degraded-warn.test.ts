// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore } from "./collaboration";
import type { RoomStoreSnapshot } from "./collaboration";
import { seedSkippedRoom, seedTrimmedRoom } from "./collaboration-test-fixtures";

describe("collaboration room store degraded persistence warnings", () => {
  const flushDegradedWarn = async (
    seed: (store: ReturnType<typeof createRoomStore>) => void,
    generateId: () => string,
  ) => {
    let persisted: RoomStoreSnapshot | undefined;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId,
        generateSecret: () => "owner-access",
        now: () => 4_000,
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      seed(store);
      await store.flush();
      expect(warn).toHaveBeenCalledTimes(1);
      return { persisted, warned: String(warn.mock.calls[0]![0]) };
    } finally {
      warn.mockRestore();
    }
  };

  it("explains only the trim outcome when nothing was skipped", async () => {
    const { persisted, warned } = await flushDegradedWarn(
      (store) => seedTrimmedRoom(store, "LEGENDTRIM"),
      () => "LEGENDTRIM",
    );

    expect(persisted?.trimmedRoomIds).toEqual(["LEGENDTRIM"]);
    expect(persisted?.skippedRoomIds).toBeUndefined();
    expect(warned).toContain("trimmed operation history for 1 room(s) (LEGENDTRIM)");
    expect(warned).toContain("Trimmed rooms remain restorable but stale clients must re-snapshot");
    expect(warned).not.toContain("skipped rooms remain in memory");
  });

  it("explains only the skip outcome when nothing was trimmed", async () => {
    const { persisted, warned } = await flushDegradedWarn(
      (store) => seedSkippedRoom(store, "LEGENDSKIP"),
      () => "LEGENDSKIP",
    );

    expect(persisted?.skippedRoomIds).toEqual(["LEGENDSKIP"]);
    expect(persisted?.trimmedRoomIds).toBeUndefined();
    expect(warned).toContain("skipped 1 room(s) from persistence (LEGENDSKIP)");
    expect(warned).toContain("skipped rooms remain in memory but will not be restored after restart");
    expect(warned).not.toContain("Trimmed rooms remain restorable");
  });

  it("explains both outcomes in order when a flush trims and skips", async () => {
    const roomIds = ["BOTHTRIM", "BOTHSKIP"];
    const { persisted, warned } = await flushDegradedWarn(
      (store) => {
        seedTrimmedRoom(store, "BOTHTRIM");
        seedSkippedRoom(store, "BOTHSKIP");
      },
      () => roomIds.shift()!,
    );

    expect(persisted?.trimmedRoomIds).toEqual(["BOTHTRIM"]);
    expect(persisted?.skippedRoomIds).toEqual(["BOTHSKIP"]);
    const trimLegendAt = warned.indexOf("Trimmed rooms remain restorable but stale clients must re-snapshot");
    const skipLegendAt = warned.indexOf("skipped rooms remain in memory but will not be restored after restart");
    expect(trimLegendAt).toBeGreaterThan(-1);
    expect(skipLegendAt).toBeGreaterThan(trimLegendAt);
  });
});
