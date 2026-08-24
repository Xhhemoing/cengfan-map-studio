// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRoomStore } from "./collaboration";

describe("collaboration room store access control and capacity limits", () => {
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

  it("lets a participant leave cleanly after the room has closed", () => {
    const secrets = ["owner-access", "viewer-invite", "viewer-access"];
    const store = createRoomStore({ generateId: () => "CLOSE1", generateSecret: () => secrets.shift()! });
    const owner = store.create({}, { clientId: "owner", displayName: "Owner" });
    const invitation = store.createInvitation("CLOSE1", owner.access.accessToken, "viewer");
    const viewer = store.join("CLOSE1", {
      inviteToken: invitation.token,
      clientId: "viewer",
      displayName: "Viewer",
    });
    store.setAccess("CLOSE1", owner.access.accessToken, "owner", "close");

    expect(store.leave("CLOSE1", viewer.access.accessToken, "viewer").members)
      .toEqual([expect.objectContaining({ clientId: "owner" })]);
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

  it("enforces the subscriber cap for lifecycle listeners and releases capacity", () => {
    const store = createRoomStore({
      maxSubscribers: 1,
      generateId: () => "SUBSCR2",
      generateSecret: () => "owner-access",
    });
    const owner = store.create({}, { clientId: "owner", displayName: "Owner" });
    const firstListener = () => {};
    const secondListener = () => {};
    const unsubscribe = store.subscribeLifecycle("SUBSCR2", owner.access.accessToken, firstListener);

    expect(() => store.subscribeLifecycle("SUBSCR2", owner.access.accessToken, secondListener))
      .toThrowError(expect.objectContaining({ code: "SUBSCRIBER_LIMIT_REACHED" }));
    unsubscribe();

    const unsubscribeSecond = store.subscribeLifecycle("SUBSCR2", owner.access.accessToken, secondListener);
    unsubscribeSecond();
  });
});
