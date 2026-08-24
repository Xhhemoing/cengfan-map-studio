// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore, jsonByteLengthWithin } from "./collaboration";
import type { RoomStoreSnapshot } from "./collaboration";
import type { CollaborationOperation } from "../src/lib/collaboration-operations";

describe("collaboration room store persistence and restore", () => {
  it("matches JSON.stringify byte length for escaped and surrogate string corpus", () => {
    const c0Controls = Array.from({ length: 0x20 }, (_, code) => String.fromCharCode(code)).join("");
    const record = {
      'quoted"key\\': [
        'quotes " and backslashes \\\\',
        c0Controls,
        "paired \ud83d\ude00",
        "unpaired high \ud800 and low \udfff",
        "mixed \ud800\ud83d\ude00\udfff",
      ],
      nested: { null: null, true: true, number: 12.5 },
    };
    const actualBytes = Buffer.byteLength(JSON.stringify(record), "utf8");

    expect(jsonByteLengthWithin(record, actualBytes)).toBe(actualBytes);
    expect(jsonByteLengthWithin(record, actualBytes - 1)).toBeUndefined();
  });

  it("restores authorization, invitations, versions, and operation history without persisting raw secrets", async () => {
    let now = 1_000;
    let persisted: RoomStoreSnapshot | undefined;
    const secrets = ["owner-access-raw", "editor-invite-raw", "editor-access-raw", "viewer-invite-raw"];
    const first = createRoomStore({
      generateId: () => "PERSIST1",
      generateSecret: () => secrets.shift()!,
      now: () => now,
      persist: async (snapshot) => {
        persisted = snapshot;
      },
    });
    const owner = first.create({ count: 0 }, { clientId: "owner", displayName: "Owner" });
    const editorInvitation = first.createInvitation("PERSIST1", owner.access.accessToken, "editor");
    const editor = first.join("PERSIST1", {
      inviteToken: editorInvitation.token,
      clientId: "editor",
      displayName: "Editor",
    });
    const viewerInvitation = first.createInvitation("PERSIST1", owner.access.accessToken, "viewer");
    const opA: CollaborationOperation = { type: "set", path: ["count"], value: 1 };
    const opB: CollaborationOperation = { type: "set", path: ["title"], value: "restored" };
    now = 1_100;
    first.apply("PERSIST1", editor.access.accessToken, {
      txId: "persist-op-1",
      clientId: "editor",
      baseVersion: 0,
      operations: [opA],
    });
    first.apply("PERSIST1", editor.access.accessToken, {
      txId: "persist-op-2",
      clientId: "editor",
      baseVersion: 1,
      operations: [opB],
    });

    await first.flush();

    expect(persisted).toBeDefined();
    const serialized = JSON.stringify(persisted);
    for (const rawSecret of ["owner-access-raw", "editor-invite-raw", "editor-access-raw", "viewer-invite-raw"]) {
      expect(serialized).not.toContain(rawSecret);
    }

    const restored = createRoomStore({
      now: () => now,
      restore: persisted,
      generateSecret: () => "viewer-access-after-restore",
    });
    expect(restored.authorize("PERSIST1", owner.access.accessToken, "invite")).toMatchObject({ id: "owner", role: "owner" });
    expect(restored.authorize("PERSIST1", editor.access.accessToken, "write")).toMatchObject({ id: "editor", role: "editor" });
    expect(restored.get("PERSIST1")).toMatchObject({
      version: 2,
      snapshot: { count: 1, title: "restored" },
      lastTxId: "persist-op-2",
    });
    expect(restored.getOperations("PERSIST1", owner.access.accessToken, 0)).toEqual({
      version: 2,
      operations: [opA, opB],
    });
    expect(restored.join("PERSIST1", {
      inviteToken: viewerInvitation.token,
      clientId: "viewer",
      displayName: "Viewer",
    }).access).toMatchObject({ role: "viewer", accessToken: "viewer-access-after-restore" });
  });

  it("does not resurrect a room whose persisted last activity is beyond the TTL", async () => {
    let now = 0;
    let persisted: RoomStoreSnapshot | undefined;
    const first = createRoomStore({
      generateId: () => "PERSIST2",
      generateSecret: () => "owner-access",
      roomTtlMs: 100,
      now: () => now,
      persist: (snapshot) => {
        persisted = snapshot;
      },
    });
    first.create({}, { clientId: "owner", displayName: "Owner" });
    await first.flush();

    now = 101;
    const restored = createRoomStore({
      restore: persisted,
      roomTtlMs: 100,
      now: () => now,
    });

    expect(restored.get("PERSIST2")).toBeUndefined();
    expect(() => restored.authorize("PERSIST2", "owner-access", "read"))
      .toThrowError(expect.objectContaining({ code: "ROOM_NOT_FOUND" }));
  });

  it("persists dirty room state on the configured interval", async () => {
    vi.useFakeTimers();
    try {
      const persist = vi.fn();
      const store = createRoomStore({
        generateId: () => "PERSIST3",
        persist,
        persistIntervalMs: 25,
      });
      store.create({}, "owner");

      expect(persist).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(25);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledWith(expect.objectContaining({
        version: 1,
        rooms: [expect.objectContaining({ room: expect.objectContaining({ id: "PERSIST3" }) })],
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces flushes while persistence is in flight and snapshots the latest dirty state", async () => {
    const releases: Array<() => void> = [];
    const snapshots: RoomStoreSnapshot[] = [];
    const persist = vi.fn(async (snapshot: RoomStoreSnapshot) => {
      snapshots.push(snapshot);
      await new Promise<void>((resolve) => releases.push(resolve));
    });
    const store = createRoomStore({
      generateId: () => "COALESCE1",
      persist,
      persistIntervalMs: Number.POSITIVE_INFINITY,
    });
    store.create({ revision: 0 }, "owner");

    const first = store.flush();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    store.apply("COALESCE1", {
      txId: "latest",
      clientId: "owner",
      baseVersion: 0,
      snapshot: { revision: 1 },
    });
    const second = store.flush();
    const third = store.flush();

    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    releases.shift()!();
    await first;
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(snapshots[1]?.rooms[0]?.room.snapshot).toEqual({ revision: 1 });

    releases.shift()!();
    await Promise.all([second, third]);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("surfaces an in-flight flush failure while allowing its coalesced successor to persist", async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const snapshots: RoomStoreSnapshot[] = [];
    const persist = vi.fn(async (snapshot: RoomStoreSnapshot) => {
      snapshots.push(snapshot);
      if (snapshots.length === 1) {
        await new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
    });
    const store = createRoomStore({
      generateId: () => "COALESCE2",
      persist,
      persistIntervalMs: Number.POSITIVE_INFINITY,
    });
    store.create({ revision: 0 }, "owner");

    const first = store.flush();
    const firstFailure = expect(first).rejects.toThrow("disk unavailable");
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    store.apply("COALESCE2", {
      txId: "retry-latest",
      clientId: "owner",
      baseVersion: 0,
      snapshot: { revision: 1 },
    });
    const successor = store.flush();

    rejectFirst(new Error("disk unavailable"));
    await firstFailure;
    await successor;

    expect(persist).toHaveBeenCalledTimes(2);
    expect(snapshots[1]?.rooms[0]?.room.snapshot).toEqual({ revision: 1 });
  });
});
