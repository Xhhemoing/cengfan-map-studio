// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore } from "./collaboration";

describe("collaboration room store expiry and purge", () => {
  it("does not keep a room alive when get is followed by invalid authorization probes", () => {
    let now = 0;
    const store = createRoomStore({
      generateId: () => "AUTH03",
      generateSecret: () => "owner-access",
      roomTtlMs: 100,
      now: () => now,
    });
    store.create({}, { clientId: "owner", displayName: "Owner" });

    // This is the HTTP read order: get the room, then validate the presented token.
    for (const probeAt of [90, 180, 270]) {
      now = probeAt;
      store.get("AUTH03");
      try {
        store.authorize("AUTH03", "invalid-access", "read");
      } catch {
        // Invalid probes are expected; only their effect on the TTL matters here.
      }
    }

    expect(store.get("AUTH03")).toBeUndefined();
  });

  it("expires idle rooms and releases their listeners", () => {
    let now = 1_000;
    const store = createRoomStore({ roomTtlMs: 100, now: () => now, generateId: () => "EXPIRE1" });
    store.create({ title: "room" }, "client-a");
    const unsubscribe = store.subscribe("EXPIRE1", () => {});
    now += 101;

    expect(store.get("EXPIRE1")).toBeUndefined();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => store.create({ title: "new" }, "client-b")).not.toThrow();
  });

  it("purges access, invitations, and operation history together with an expired room", () => {
    let now = 0;
    const secrets = ["old-owner-access", "old-invitation", "new-owner-access"];
    const store = createRoomStore({
      roomTtlMs: 100,
      now: () => now,
      generateId: () => "EXPIRE2",
      generateSecret: () => secrets.shift()!,
    });
    const oldOwner = store.create({}, { clientId: "old-owner", displayName: "Old Owner" });
    const oldInvitation = store.createInvitation("EXPIRE2", oldOwner.access.accessToken, "viewer");
    store.apply("EXPIRE2", oldOwner.access.accessToken, {
      txId: "old-operation",
      clientId: "old-owner",
      baseVersion: 0,
      operations: [{ type: "set", path: ["old"], value: true }],
    });

    now = 101;
    const newOwner = store.create({}, { clientId: "new-owner", displayName: "New Owner" });

    expect(() => store.authorize("EXPIRE2", oldOwner.access.accessToken, "read"))
      .toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
    expect(() => store.join("EXPIRE2", {
      inviteToken: oldInvitation.token,
      clientId: "stale-viewer",
      displayName: "Stale Viewer",
    })).toThrowError(expect.objectContaining({ code: "INVITATION_INVALID" }));
    expect(store.getOperations("EXPIRE2", newOwner.access.accessToken, 0)).toEqual({
      version: 0,
      operations: [],
    });
  });

  it("tells live subscribers a room closed before purging it", () => {
    let now = 0;
    const secrets = ["owner-access", "next-owner-access"];
    const store = createRoomStore({
      maxSubscribers: 1,
      roomTtlMs: 100,
      now: () => now,
      generateId: () => "PURGE1",
      generateSecret: () => secrets.shift()!,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const lifecycle = vi.fn();
    const snapshots = vi.fn();
    const unsubscribeLifecycle = store.subscribeLifecycle("PURGE1", owner.access.accessToken, lifecycle);
    const unsubscribe = store.subscribe("PURGE1", owner.access.accessToken, snapshots);

    now = 101;
    expect(store.get("PURGE1")).toBeUndefined();
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith({
      kind: "closed",
      room: expect.objectContaining({ id: "PURGE1", closed: true }),
      members: [expect.objectContaining({ clientId: "owner" })],
    });
    expect(snapshots).not.toHaveBeenCalled();
    expect(() => store.authorize("PURGE1", owner.access.accessToken, "read"))
      .toThrowError(expect.objectContaining({ code: "ROOM_NOT_FOUND" }));

    // Both subscriber sets must be gone, not merely unreachable: the cap of one
    // has to be free for the next room reusing this id, and the stale listener
    // must never see that room's events.
    const next = store.create({ title: "复用" }, { clientId: "next-owner", displayName: "接任者" });
    expect(next.room.id).toBe("PURGE1");
    expect(() => store.subscribe("PURGE1", next.access.accessToken, () => {})).not.toThrow();
    expect(() => store.subscribeLifecycle("PURGE1", next.access.accessToken, () => {})).not.toThrow();
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(snapshots).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => unsubscribeLifecycle()).not.toThrow();
  });

  it("does not let an attached event stream extend the room lifetime", () => {
    let now = 0;
    const store = createRoomStore({
      roomTtlMs: 100,
      now: () => now,
      generateId: () => "PURGE2",
      generateSecret: () => "owner-access",
    });
    const owner = store.create({}, { clientId: "owner", displayName: "创建者" });
    const lifecycle = vi.fn();

    now = 50;
    store.subscribe("PURGE2", owner.access.accessToken, () => {});
    store.subscribeLifecycle("PURGE2", owner.access.accessToken, lifecycle);

    now = 101;
    expect(store.get("PURGE2")).toBeUndefined();
    expect(lifecycle).toHaveBeenCalledTimes(1);
  });

  it("keeps a lifecycle listener that re-enters the store from resurrecting its purged room", () => {
    let now = 0;
    const store = createRoomStore({
      roomTtlMs: 100,
      now: () => now,
      generateId: () => "PURGE3",
      generateSecret: () => "owner-access",
    });
    const owner = store.create({}, { clientId: "owner", displayName: "创建者" });
    const observed: string[] = [];
    const listener = vi.fn(() => {
      observed.push(store.get("PURGE3")?.closed === true ? "closed" : "missing");
      try {
        store.refreshMember("PURGE3", owner.access.accessToken, "owner");
        observed.push("refreshed");
      } catch (error) {
        observed.push((error as { code: string }).code);
      }
    });
    store.subscribeLifecycle("PURGE3", owner.access.accessToken, listener);

    now = 101;
    expect(store.get("PURGE3")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(observed).toEqual(["closed", "ROOM_CLOSED"]);

    now = 202;
    expect(store.get("PURGE3")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the closed event when the owner already closed the room", () => {
    let now = 0;
    const store = createRoomStore({
      roomTtlMs: 100,
      now: () => now,
      generateId: () => "PURGE4",
      generateSecret: () => "owner-access",
    });
    const owner = store.create({}, { clientId: "owner", displayName: "创建者" });
    const lifecycle = vi.fn();
    store.subscribeLifecycle("PURGE4", owner.access.accessToken, lifecycle);
    store.setAccess("PURGE4", owner.access.accessToken, "owner", "close");
    expect(lifecycle).toHaveBeenCalledTimes(1);

    now = 101;
    expect(store.get("PURGE4")).toBeUndefined();
    expect(lifecycle).toHaveBeenCalledTimes(1);
  });
});
