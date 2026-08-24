// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createRoomStore,
  MAX_PERSISTED_ROOM_BYTES,
  MAX_PERSISTED_SNAPSHOT_BYTES,
} from "./collaboration";
import type { RoomStoreSnapshot } from "./collaboration";
import type { CollaborationOperation } from "../src/lib/collaboration-operations";

describe("collaboration room store snapshot trimming and eviction", () => {
  it("persists a six MiB room accepted by the collaboration API", async () => {
    let persisted: RoomStoreSnapshot | undefined;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => "API6MIB",
        generateSecret: () => "owner-access",
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      store.create(
        { payload: "x".repeat(6 * 1024 * 1024) },
        { clientId: "owner", displayName: "Owner" },
      );

      await store.flush();

      expect(persisted).toMatchObject({
        version: 1,
        rooms: [expect.objectContaining({ room: expect.objectContaining({ id: "API6MIB" }) })],
      });
      expect(persisted?.skippedRoomCount).toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("restores an API-accepted near-limit room after degrading its operation history", async () => {
    let persisted: RoomStoreSnapshot | undefined;
    const payload = "x".repeat(MAX_PERSISTED_ROOM_BYTES - 8 * 1024);
    const historyPadding = "h".repeat(256);
    const operation: CollaborationOperation = { type: "set", path: ["historyPadding"], value: historyPadding };
    const transaction = {
      txId: "near-limit-op",
      clientId: "owner",
      baseVersion: 0,
      operations: [operation],
    };
    expect(Buffer.byteLength(JSON.stringify({
      snapshot: { payload },
      clientId: "owner",
      displayName: "Owner",
    }), "utf8")).toBeLessThanOrEqual(MAX_PERSISTED_ROOM_BYTES);
    expect(Buffer.byteLength(JSON.stringify({
      accessToken: "owner-access",
      ...transaction,
    }), "utf8")).toBeLessThanOrEqual(MAX_PERSISTED_ROOM_BYTES);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => "NEARLIMIT",
        generateSecret: () => "owner-access",
        now: () => 1_000,
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      store.create({ payload }, { clientId: "owner", displayName: "Owner" });
      for (let version = 0; version < 64; version += 1) {
        store.apply("NEARLIMIT", "owner-access", {
          ...transaction,
          txId: `near-limit-op-${version}`,
          baseVersion: version,
        });
      }

      await store.flush();

      expect(persisted).toMatchObject({
        version: 1,
        trimmedRoomIds: ["NEARLIMIT"],
        rooms: [expect.objectContaining({
          room: expect.objectContaining({ id: "NEARLIMIT", version: 64 }),
          operationHistory: [],
        })],
      });
      expect((persisted?.rooms[0]?.room.snapshot as { payload: string }).payload).toBe(payload);
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: [],
        trimmedIds: ["NEARLIMIT"],
        at: 1_000,
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("trimmed operation history"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("NEARLIMIT"));
      const restored = createRoomStore({ restore: persisted, now: () => 1_000 });
      expect(restored.get("NEARLIMIT")?.snapshot).toEqual({ payload, historyPadding });
      expect(restored.authorize("NEARLIMIT", "owner-access", "read"))
        .toMatchObject({ id: "owner", role: "owner" });
      expect(() => restored.getOperations("NEARLIMIT", "owner-access", 0))
        .toThrowError(expect.objectContaining({
          code: "VERSION_CONFLICT",
          message: "增量历史已被裁剪，请重新获取完整快照",
          currentVersion: 64,
        }));
    } finally {
      warn.mockRestore();
    }
  });

  it("restores two five MiB rooms after trimming duplicate operation history", async () => {
    let persisted: RoomStoreSnapshot | undefined;
    const payload = "f".repeat(5 * 1024 * 1024);
    const historyPadding = "h".repeat(16 * 1024);
    const roomIds = ["FIVEA", "FIVEB"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => roomIds.shift()!,
        generateSecret: () => "owner-access",
        now: () => 2_000,
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      for (const id of ["FIVEA", "FIVEB"]) {
        store.create({ payload }, { clientId: `${id}-owner`, displayName: `${id} Owner` });
        for (let version = 0; version < 256; version += 1) {
          store.apply(id, "owner-access", {
            txId: `${id}-op-${version}`,
            clientId: `${id}-owner`,
            baseVersion: version,
            operations: [{ type: "set", path: ["historyPadding"], value: historyPadding }],
          });
        }
      }

      await store.flush();

      expect(persisted?.trimmedRoomIds).toEqual(["FIVEA", "FIVEB"]);
      expect(persisted?.skippedRoomIds).toBeUndefined();
      expect(persisted?.rooms.map(({ room }) => room.id)).toEqual(["FIVEA", "FIVEB"]);
      expect(persisted?.rooms.every(({ operationHistory }) => operationHistory.length === 0)).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(persisted), "utf8"))
        .toBeLessThanOrEqual(MAX_PERSISTED_SNAPSHOT_BYTES);
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: [],
        trimmedIds: ["FIVEA", "FIVEB"],
        at: 2_000,
      });

      const restored = createRoomStore({ restore: persisted, now: () => 2_000 });
      for (const id of ["FIVEA", "FIVEB"]) {
        const snapshot = restored.get(id)?.snapshot as { payload: string } | undefined;
        expect(snapshot?.payload).toBe(payload);
        expect(restored.authorize(id, "owner-access", "read"))
          .toMatchObject({ id: `${id}-owner`, role: "owner" });
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("trims history before evicting a room from the aggregate snapshot budget", async () => {
    let persisted: RoomStoreSnapshot | undefined;
    const payload = "b".repeat(3.5 * 1024 * 1024);
    const historyPadding = "h".repeat(14 * 1024);
    const roomIds = ["BUDGETA", "BUDGETB"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => roomIds.shift()!,
        generateSecret: () => "owner-access",
        now: () => 3_000,
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      for (const id of ["BUDGETA", "BUDGETB"]) {
        store.create({ payload }, { clientId: `${id}-owner`, displayName: `${id} Owner` });
        for (let version = 0; version < 256; version += 1) {
          store.apply(id, "owner-access", {
            txId: `${id}-op-${version}`,
            clientId: `${id}-owner`,
            baseVersion: version,
            operations: [{ type: "set", path: ["historyPadding"], value: historyPadding }],
          });
        }
      }

      await store.flush();

      expect(persisted?.rooms.map(({ room }) => room.id)).toEqual(["BUDGETA", "BUDGETB"]);
      expect(persisted?.trimmedRoomIds).toEqual(["BUDGETA"]);
      expect(persisted?.skippedRoomIds).toBeUndefined();
      expect(Buffer.byteLength(JSON.stringify(persisted), "utf8"))
        .toBeLessThanOrEqual(MAX_PERSISTED_SNAPSHOT_BYTES);
    } finally {
      warn.mockRestore();
    }
  });

  it("omits oversized rooms from persistence and records the restart fallback", async () => {
    let persisted: RoomStoreSnapshot | undefined;
    const roomIds = ["OVERSIZED", "PERSIST4"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => roomIds.shift()!,
        generateSecret: () => "owner-access",
        now: () => 1_000,
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      store.create({ payload: "x".repeat(MAX_PERSISTED_ROOM_BYTES) }, { clientId: "large-owner", displayName: "Large owner" });
      store.create({ title: "persist me" }, { clientId: "small-owner", displayName: "Small owner" });

      await store.flush();

      expect(store.get("OVERSIZED")).toBeDefined();
      expect(persisted).toMatchObject({
        version: 1,
        skippedRoomCount: 1,
        skippedRoomIds: ["OVERSIZED"],
        rooms: [expect.objectContaining({ room: expect.objectContaining({ id: "PERSIST4" }) })],
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipped 1 room(s)"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("OVERSIZED"));
      expect(store.lastPersistOutcome()).toEqual({
        skippedIds: ["OVERSIZED"],
        trimmedIds: [],
        at: 1_000,
      });

      const restored = createRoomStore({ restore: persisted, now: () => 1_000 });
      expect(restored.get("OVERSIZED")).toBeUndefined();
      expect(restored.get("PERSIST4")?.snapshot).toEqual({ title: "persist me" });
    } finally {
      warn.mockRestore();
    }
  });

  it("bounds the total snapshot by skipping the largest room record first", async () => {
    let persisted: RoomStoreSnapshot | undefined;
    const roomIds = ["MEDIUM", "LARGEST", "SMALL"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createRoomStore({
        generateId: () => roomIds.shift()!,
        generateSecret: () => "owner-access",
        persistIntervalMs: Number.POSITIVE_INFINITY,
        persist: (snapshot) => {
          persisted = snapshot;
        },
      });
      store.create({ payload: "m".repeat(4 * 1024 * 1024) }, { clientId: "medium-owner", displayName: "Medium owner" });
      store.create({ payload: "l".repeat(6 * 1024 * 1024) }, { clientId: "large-owner", displayName: "Large owner" });
      store.create({ payload: "s".repeat(3 * 1024 * 1024) }, { clientId: "small-owner", displayName: "Small owner" });

      await store.flush();

      expect(persisted).toMatchObject({
        skippedRoomCount: 1,
        skippedRoomIds: ["LARGEST"],
      });
      expect(persisted?.rooms.map(({ room }) => room.id)).toEqual(["MEDIUM", "SMALL"]);
      expect(Buffer.byteLength(JSON.stringify(persisted), "utf8"))
        .toBeLessThanOrEqual(MAX_PERSISTED_SNAPSHOT_BYTES);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("LARGEST"));
    } finally {
      warn.mockRestore();
    }
  });
});
