// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore } from "./collaboration";
import type { CollaborationOperation } from "../src/lib/collaboration-operations";

describe("collaboration room store transactions and convergence", () => {
  it("returns the incremental operations covering an afterVersion interval", () => {
    const store = createRoomStore({ generateId: () => "OPS01", generateSecret: () => "op-secret" });
    store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const opA: CollaborationOperation = { type: "set", path: ["a"], value: 1 };
    const opB: CollaborationOperation = { type: "set", path: ["b"], value: 2 };
    const opC: CollaborationOperation = { type: "set", path: ["c"], value: 3 };
    store.apply("OPS01", "op-secret", { txId: "op-1", clientId: "owner", baseVersion: 0, operations: [opA] });
    store.apply("OPS01", "op-secret", { txId: "op-2", clientId: "owner", baseVersion: 1, operations: [opB] });
    store.apply("OPS01", "op-secret", { txId: "op-3", clientId: "owner", baseVersion: 2, operations: [opC] });

    expect(store.getOperations("OPS01", "op-secret", 0)).toMatchObject({ version: 3, operations: [opA, opB, opC] });
    expect(store.getOperations("OPS01", "op-secret", 1)).toMatchObject({ operations: [opB, opC] });
    expect(store.getOperations("OPS01", "op-secret", 3)).toMatchObject({ operations: [] });
    expect(() => store.getOperations("OPS01", "op-secret", -1)).toThrowError(expect.objectContaining({ code: "INVALID_TRANSACTION" }));
    expect(() => store.getOperations("OPS01", "op-secret", 4)).toThrowError(expect.objectContaining({ code: "VERSION_CONFLICT", currentVersion: 3 }));
  });

  it("rejects a backfill when operation history has been trimmed or replaced by a snapshot", () => {
    const store = createRoomStore({ generateId: () => "OPS02", generateSecret: () => "op-secret" });
    store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    store.apply("OPS02", "op-secret", { txId: "op-1", clientId: "owner", baseVersion: 0, operations: [{ type: "set", path: ["a"], value: 1 }] });
    store.apply("OPS02", "op-secret", { txId: "snap-2", clientId: "owner", baseVersion: 1, snapshot: { title: "全量" } });

    expect(() => store.getOperations("OPS02", "op-secret", 0)).toThrowError(expect.objectContaining({ code: "VERSION_CONFLICT", currentVersion: 2 }));
    expect(store.getOperations("OPS02", "op-secret", 2)).toMatchObject({ operations: [] });
  });

  it("rejects an operations backfill while the initial snapshot is still uploading", () => {
    const store = createRoomStore({ generateId: () => "OPS03", generateSecret: () => "op-secret" });
    store.create(undefined, { clientId: "owner", displayName: "创建者" });
    expect(() => store.getOperations("OPS03", "op-secret", 0)).toThrowError(expect.objectContaining({ code: "ROOM_INITIALIZING" }));
  });

  it("applies incremental operations without replacing untouched room data", () => {
    const store = createRoomStore(() => "PATCH1");
    store.create({ project: { title: "初始", map: { scale: 1 } }, assets: ["keep"] }, "client-a");

    const updated = store.apply("PATCH1", {
      txId: "patch-1",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.2 }],
    });

    expect(updated.snapshot).toEqual({ project: { title: "初始", map: { scale: 1.2 } }, assets: ["keep"] });
    expect(updated.operations).toEqual([{ type: "set", path: ["project", "map", "scale"], value: 1.2 }]);
  });

  it("merges stale incremental operations when intervening paths do not overlap", () => {
    const store = createRoomStore(() => "PATCH2");
    store.create({ project: { title: "初始", map: { scale: 1 } } }, "client-a");
    store.apply("PATCH2", {
      txId: "patch-a",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "set", path: ["project", "title"], value: "甲" }],
    });

    const merged = store.apply("PATCH2", {
      txId: "patch-b",
      clientId: "client-b",
      baseVersion: 0,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.3 }],
    });

    expect(merged).toMatchObject({ version: 2, rebasedFromVersion: 0 });
    expect(merged.snapshot).toEqual({ project: { title: "甲", map: { scale: 1.3 } } });
  });

  it("rejects stale incremental operations that overlap intervening paths", () => {
    const store = createRoomStore(() => "PATCH3");
    store.create({ project: { map: { scale: 1 } } }, "client-a");
    store.apply("PATCH3", {
      txId: "patch-a",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.1 }],
    });

    expect(() => store.apply("PATCH3", {
      txId: "patch-b",
      clientId: "client-b",
      baseVersion: 0,
      operations: [{ type: "set", path: ["project", "map"], value: { scale: 1.2 } }],
    })).toThrowError(expect.objectContaining({ code: "VERSION_CONFLICT", currentVersion: 1 }));
  });

  it("merges stale array-element operations for different ids within the same collection", () => {
    const store = createRoomStore(() => "STUD01");
    store.create({ students: [{ id: "A", name: "甲" }, { id: "B", name: "乙" }] }, "client-a");
    store.apply("STUD01", {
      txId: "patch-a",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "array-upsert", path: ["students"], item: { id: "A", name: "甲改" } }],
    });

    const merged = store.apply("STUD01", {
      txId: "patch-b",
      clientId: "client-b",
      baseVersion: 0,
      operations: [{ type: "array-upsert", path: ["students"], item: { id: "B", name: "乙改" } }],
    });

    expect(merged).toMatchObject({ version: 2, rebasedFromVersion: 0 });
    expect(merged.snapshot).toEqual({ students: [{ id: "A", name: "甲改" }, { id: "B", name: "乙改" }] });
  });

  it("rejects stale array-element operations that target the same id", () => {
    const store = createRoomStore(() => "STUD02");
    store.create({ students: [{ id: "A", name: "甲" }] }, "client-a");
    store.apply("STUD02", {
      txId: "patch-a",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "array-upsert", path: ["students"], item: { id: "A", name: "甲改" } }],
    });

    expect(() => store.apply("STUD02", {
      txId: "patch-b",
      clientId: "client-b",
      baseVersion: 0,
      operations: [{ type: "array-upsert", path: ["students"], item: { id: "A", name: "甲再改" } }],
    })).toThrowError(expect.objectContaining({ code: "VERSION_CONFLICT", currentVersion: 1 }));
  });

  it("rejects collection-level atomic replacement conflicting with element-level operations in both directions", () => {
    const store = createRoomStore(() => "STUD03");
    store.create({ students: [{ id: "A", name: "甲" }] }, "client-a");
    store.apply("STUD03", {
      txId: "patch-a",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "set", path: ["students"], value: [{ id: "A", name: "甲改" }] }],
    });

    expect(() => store.apply("STUD03", {
      txId: "patch-b",
      clientId: "client-b",
      baseVersion: 0,
      operations: [{ type: "array-upsert", path: ["students"], item: { id: "A", name: "乙改" } }],
    })).toThrowError(expect.objectContaining({ code: "VERSION_CONFLICT", currentVersion: 1 }));

    const store2 = createRoomStore(() => "STUD04");
    store2.create({ students: [{ id: "A", name: "甲" }] }, "client-a");
    store2.apply("STUD04", {
      txId: "patch-a",
      clientId: "client-a",
      baseVersion: 0,
      operations: [{ type: "array-upsert", path: ["students"], item: { id: "A", name: "甲改" } }],
    });

    expect(() => store2.apply("STUD04", {
      txId: "patch-b",
      clientId: "client-b",
      baseVersion: 0,
      operations: [{ type: "set", path: ["students"], value: [{ id: "A", name: "丙" }] }],
    })).toThrowError(expect.objectContaining({ code: "VERSION_CONFLICT", currentVersion: 1 }));
  });

  it("creates a room and applies versioned snapshot transactions", () => {
    const store = createRoomStore(() => "ROOM01");
    const room = store.create({ title: "初始" }, "client-a");
    expect(room).toMatchObject({ id: "ROOM01", version: 0, snapshot: { title: "初始" } });

    const updated = store.apply("ROOM01", { txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "更新" } });
    expect(updated).toMatchObject({ version: 1, snapshot: { title: "更新" }, lastTxId: "tx-1" });
    expect(store.apply("ROOM01", { txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "重复" } })).toEqual(updated);
  });

  it("deduplicates an old transaction without retaining or restoring its historical snapshot", () => {
    const store = createRoomStore(() => "ROOM06");
    store.create({ title: "初始" }, "client-a");
    store.apply("ROOM06", { txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "第一版" } });
    const latest = store.apply("ROOM06", { txId: "tx-2", clientId: "client-b", baseVersion: 1, snapshot: { title: "第二版" } });

    const duplicate = store.apply("ROOM06", { txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "重复" } });

    expect(duplicate).toEqual(latest);
    expect(store.get("ROOM06")).toEqual(latest);
  });

  it("rejects stale transactions without overwriting newer state", () => {
    const store = createRoomStore(() => "ROOM02");
    store.create({ count: 0 }, "client-a");
    store.apply("ROOM02", { txId: "tx-a", clientId: "client-a", baseVersion: 0, snapshot: { count: 1 } });
    let conflict: unknown;
    try {
      store.apply("ROOM02", { txId: "tx-b", clientId: "client-b", baseVersion: 0, snapshot: { count: 2 } });
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 1 });
    expect(store.get("ROOM02")?.snapshot).toEqual({ count: 1 });
  });

  it("rejects missing snapshots and negative base versions", () => {
    const store = createRoomStore(() => "ROOM04");
    store.create({ title: "initial" }, "client-a");
    expect(() => store.apply("ROOM04", {
      txId: "tx-negative",
      clientId: "client-a",
      baseVersion: -1,
      snapshot: { title: "invalid" },
    })).toThrowError(expect.objectContaining({ code: "INVALID_TRANSACTION" }));
    expect(() => store.apply("ROOM04", {
      txId: "tx-missing",
      clientId: "client-a",
      baseVersion: 0,
      snapshot: undefined,
    })).toThrowError(expect.objectContaining({ code: "INVALID_TRANSACTION" }));
  });

  it("notifies subscribers and removes them cleanly", () => {
    const store = createRoomStore(() => "ROOM03");
    store.create({}, "client-a");
    const listener = vi.fn();
    const unsubscribe = store.subscribe("ROOM03", listener);
    store.apply("ROOM03", { txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { ok: true } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
    unsubscribe();
    store.apply("ROOM03", { txId: "tx-2", clientId: "client-a", baseVersion: 1, snapshot: { ok: false } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reuses the immutable stored snapshot across reads and broadcasts", () => {
    const store = createRoomStore(() => "ROOM05");
    store.create(undefined, "client-a");
    const input = { payload: { title: "大型工程" } };
    const listener = vi.fn();
    store.subscribe("ROOM05", listener);

    const applied = store.apply("ROOM05", {
      txId: "tx-large",
      clientId: "client-a",
      baseVersion: 0,
      snapshot: input,
    });
    const read = store.get("ROOM05")!;
    const broadcast = listener.mock.calls[0]?.[0];

    expect(applied).not.toBe(read);
    expect(applied.snapshot).not.toBe(input);
    expect(read.snapshot).toBe(applied.snapshot);
    expect(broadcast.snapshot).toBe(applied.snapshot);
  });
});
