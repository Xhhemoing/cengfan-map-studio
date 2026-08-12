// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore } from "./collaboration";
import type { CollaborationOperation } from "../src/lib/collaboration-operations";

describe("collaboration room store", () => {
  it("creates a room with the owner as its first member", () => {
    const secrets = ["owner-access"];
    const store = createRoomStore({ generateId: () => "MEM001", generateSecret: () => secrets.shift()! });
    const created = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });

    expect(created.room.members).toEqual([
      expect.objectContaining({ clientId: "owner", role: "owner" }),
    ]);
    expect(created.room.members![0]!.joinedAt).toBeDefined();
    expect(created.room.members![0]!.lastSeenAt).toBeDefined();
  });

  it("tracks members across joins and refreshes lastSeenAt on heartbeat", () => {
    let tick = 1_000;
    const secrets = ["owner-access", "editor-invite", "editor-access", "viewer-invite", "viewer-access"];
    const store = createRoomStore({
      generateId: () => "MEM002",
      generateSecret: () => secrets.shift()!,
      now: () => tick,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("MEM002", owner.access.accessToken, "editor");
    const editor = store.join("MEM002", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });
    const viewerInvite = store.createInvitation("MEM002", owner.access.accessToken, "viewer");
    store.join("MEM002", { inviteToken: viewerInvite.token, clientId: "viewer", displayName: "查看同学" });

    expect(store.get("MEM002")!.members.map((member) => ({ clientId: member.clientId, role: member.role }))).toEqual([
      { clientId: "owner", role: "owner" },
      { clientId: "editor", role: "editor" },
      { clientId: "viewer", role: "viewer" },
    ]);

    tick += 5_000;
    const heartbeat = store.refreshMember("MEM002", editor.access.accessToken, "editor");
    expect(heartbeat.members).toHaveLength(3);
    const editorMember = heartbeat.members.find((member) => member.clientId === "editor")!;
    expect(editorMember.lastSeenAt).toBe(new Date(1_000 + 5_000).toISOString());
    expect(editorMember.joinedAt).toBe(new Date(1_000).toISOString());
    expect(heartbeat.version).toBe(0);
  });

  it("removes a member on leave and stays idempotent for unknown members", () => {
    const secrets = ["owner-access", "editor-invite", "editor-access"];
    const store = createRoomStore({ generateId: () => "MEM003", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("MEM003", owner.access.accessToken, "editor");
    const editor = store.join("MEM003", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });

    const left = store.leave("MEM003", editor.access.accessToken, "editor");
    expect(left.members.map((member) => member.clientId)).toEqual(["owner"]);
    expect(store.leave("MEM003", editor.access.accessToken, "editor").members.map((member) => member.clientId)).toEqual(["owner"]);
    expect(store.leave("MEM003", owner.access.accessToken, "nobody").members.map((member) => member.clientId)).toEqual(["owner"]);
  });

  it("lets only the owner set readonly/close; closed rooms reject writes, joins, and further access changes", () => {
    const secrets = ["owner-access", "editor-invite", "editor-access", "late-invite"];
    const store = createRoomStore({ generateId: () => "ACC01", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("ACC01", owner.access.accessToken, "editor");
    const editor = store.join("ACC01", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });

    expect(() => store.setAccess("ACC01", editor.access.accessToken, "editor", "set-readonly")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));

    expect(store.setAccess("ACC01", owner.access.accessToken, "owner", "set-readonly")).toMatchObject({ readonly: true, closed: false });
    expect(() => store.apply("ACC01", editor.access.accessToken, { txId: "write-1", clientId: "editor", baseVersion: 0, snapshot: { title: "越权" } }))
      .toThrowError(expect.objectContaining({ code: "READONLY_ROOM" }));
    expect(store.refreshMember("ACC01", editor.access.accessToken, "editor").members).toHaveLength(2);
    expect(store.setAccess("ACC01", owner.access.accessToken, "owner", "set-readonly")).toMatchObject({ readonly: false });

    expect(store.setAccess("ACC01", owner.access.accessToken, "owner", "close")).toMatchObject({ readonly: false, closed: true });
    expect(() => store.apply("ACC01", owner.access.accessToken, { txId: "write-2", clientId: "owner", baseVersion: 0, snapshot: { title: "关闭后" } }))
      .toThrowError(expect.objectContaining({ code: "ROOM_CLOSED" }));
    expect(() => store.refreshMember("ACC01", editor.access.accessToken, "editor")).toThrowError(expect.objectContaining({ code: "ROOM_CLOSED" }));
    expect(() => store.setAccess("ACC01", owner.access.accessToken, "owner", "set-readonly")).toThrowError(expect.objectContaining({ code: "ROOM_CLOSED" }));

    const lateInvite = store.createInvitation("ACC01", owner.access.accessToken, "viewer");
    expect(() => store.join("ACC01", { inviteToken: lateInvite.token, clientId: "late", displayName: "迟到" }))
      .toThrowError(expect.objectContaining({ code: "ROOM_CLOSED" }));
  });

  it("still admits viewers into a readonly room", () => {
    const secrets = ["owner-access", "viewer-invite", "viewer-access"];
    const store = createRoomStore({ generateId: () => "ACC02", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    store.setAccess("ACC02", owner.access.accessToken, "owner", "set-readonly");
    const viewerInvite = store.createInvitation("ACC02", owner.access.accessToken, "viewer");
    const viewer = store.join("ACC02", { inviteToken: viewerInvite.token, clientId: "viewer", displayName: "查看同学" });

    expect(viewer.room.members.map((member) => ({ clientId: member.clientId, role: member.role }))).toEqual([
      { clientId: "owner", role: "owner" },
      { clientId: "viewer", role: "viewer" },
    ]);
  });

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

  it("broadcasts members, access, and closed lifecycle events to subscribers", () => {
    const secrets = ["owner-access", "editor-invite", "editor-access"];
    const store = createRoomStore({ generateId: () => "EVT01", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const listener = vi.fn();
    const unsubscribe = store.subscribeLifecycle("EVT01", owner.access.accessToken, listener);

    const editorInvite = store.createInvitation("EVT01", owner.access.accessToken, "editor");
    store.join("EVT01", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "members",
      members: expect.arrayContaining([expect.objectContaining({ clientId: "editor" })]),
    }));

    store.setAccess("EVT01", owner.access.accessToken, "owner", "set-readonly");
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "access", room: expect.objectContaining({ readonly: true }) }));

    store.setAccess("EVT01", owner.access.accessToken, "owner", "close");
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "closed", room: expect.objectContaining({ closed: true }) }));

    unsubscribe();
    store.leave("EVT01", owner.access.accessToken, "owner");
    const before = listener.mock.calls.length;
    expect(listener.mock.calls.length).toBe(before);
  });

  it("permits an invited editor to update a room and rejects a viewer write", () => {
    const secrets = ["owner-access", "editor-invite", "viewer-invite", "editor-access", "viewer-access"];
    const store = createRoomStore({
      generateId: () => "ROLE01",
      generateSecret: () => secrets.shift()!,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("ROLE01", owner.access.accessToken, "editor");
    const viewerInvite = store.createInvitation("ROLE01", owner.access.accessToken, "viewer");
    const editor = store.join("ROLE01", {
      inviteToken: editorInvite.token,
      clientId: "editor",
      displayName: "编辑同学",
    });
    const viewer = store.join("ROLE01", {
      inviteToken: viewerInvite.token,
      clientId: "viewer",
      displayName: "查看同学",
    });

    expect(store.apply("ROLE01", editor.access.accessToken, {
      txId: "editor-1",
      clientId: "editor",
      baseVersion: 0,
      snapshot: { title: "编辑完成" },
    }).snapshot).toEqual({ title: "编辑完成" });

    expect(() => store.apply("ROLE01", viewer.access.accessToken, {
      txId: "viewer-1",
      clientId: "viewer",
      baseVersion: 1,
      snapshot: { title: "越权" },
    })).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
  });

  it("rejects unknown access tokens and non-owner invitations", () => {
    const secrets = ["owner-access", "editor-invite", "editor-access"];
    const store = createRoomStore({ generateId: () => "ACCESS1", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const invitation = store.createInvitation("ACCESS1", owner.access.accessToken, "editor");
    const editor = store.join("ACCESS1", { inviteToken: invitation.token, clientId: "editor", displayName: "编辑同学" });

    expect(() => store.authorize("ACCESS1", "not-a-token", "read")).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
    expect(() => store.createInvitation("ACCESS1", editor.access.accessToken, "viewer")).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
  });

  it("consumes invitations once and rejects expired invitations", () => {
    let now = 1_000;
    const secrets = ["owner-access", "invite-once", "member-access", "invite-expired"];
    const store = createRoomStore({
      generateId: () => "INVITE1",
      generateSecret: () => secrets.shift()!,
      invitationTtlMs: 10,
      now: () => now,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const oneTime = store.createInvitation("INVITE1", owner.access.accessToken, "viewer");
    store.join("INVITE1", { inviteToken: oneTime.token, clientId: "viewer", displayName: "查看同学" });

    expect(() => store.join("INVITE1", { inviteToken: oneTime.token, clientId: "again", displayName: "重复" })).toThrowError(expect.objectContaining({ code: "INVITATION_INVALID" }));

    const expired = store.createInvitation("INVITE1", owner.access.accessToken, "viewer");
    now += 11;
    expect(() => store.join("INVITE1", { inviteToken: expired.token, clientId: "late", displayName: "迟到" })).toThrowError(expect.objectContaining({ code: "INVITATION_EXPIRED" }));
  });

  it("enforces a maximum room count", () => {
    const store = createRoomStore({ maxRooms: 1, generateId: () => "LIMIT01" });
    store.create({ title: "first" }, "client-a");

    expect(() => store.create({ title: "second" }, "client-b")).toThrowError(expect.objectContaining({
      code: "ROOM_LIMIT_REACHED",
    }));
  });

  it("enforces a maximum number of live room subscribers", () => {
    const store = createRoomStore({ maxSubscribers: 1, generateId: () => "SUBSCR1" });
    store.create({ title: "room" }, "client-a");
    const unsubscribe = store.subscribe("SUBSCR1", () => {});

    expect(() => store.subscribe("SUBSCR1", () => {})).toThrowError(expect.objectContaining({
      code: "SUBSCRIBER_LIMIT_REACHED",
    }));
    unsubscribe();
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
