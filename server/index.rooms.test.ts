// @vitest-environment node
// 房间创建/事务/成员/权限/回填等 HTTP 路由在统一服务器上的行为。
import { describe, expect, it } from "vitest";
import { createAiServer } from "./index";
import { createCollaborationRoom, roomHeaders, startServer, installServerFixture } from "./index-test-fixtures";

const { servers } = installServerFixture();

describe("unified application server — collaboration room routes", () => {
  it("requires a room token before returning private room data", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "owner", displayName: "创建者", snapshot: { title: "private" } }),
    }).then((response) => response.json()) as { room: { id: string }; access: { accessToken: string } };

    expect((await fetch(`${origin}/api/rooms/${created.room.id}`)).status).toBe(403);
    const allowed = await fetch(`${origin}/api/rooms/${created.room.id}`, {
      headers: { "X-Cengfan-Room-Token": created.access.accessToken },
    });
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toMatchObject({ snapshot: { title: "private" }, role: "owner" });
  });

  it("creates, reads, updates, and rejects stale collaboration room snapshots", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });

    const update = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "更新" } }),
    });
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({ version: 1, snapshot: { title: "更新" } });

    const stale = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "tx-2", clientId: "client-a", baseVersion: 0, snapshot: { title: "冲突" } }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "VERSION_CONFLICT", currentVersion: 1 } });

    const room = await fetch(`${origin}/api/rooms/${created.room.id}`, { headers: roomHeaders(created.access.accessToken) });
    await expect(room.json()).resolves.toMatchObject({ version: 1, snapshot: { title: "更新" } });
  });

  it("returns a room code before its initial snapshot upload completes", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, undefined, "client-fast");
    expect(created.room).toMatchObject({ version: 0, ready: false });

    const earlyJoin = await fetch(`${origin}/api/rooms/${created.room.id}`, { headers: roomHeaders(created.access.accessToken) });
    expect(earlyJoin.status).toBe(425);
    await expect(earlyJoin.json()).resolves.toMatchObject({ error: { code: "ROOM_INITIALIZING" } });

    const initialized = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "init-1", clientId: "client-fast", baseVersion: 0, snapshot: { title: "ready" } }),
    });
    await expect(initialized.json()).resolves.toMatchObject({ version: 1, ready: true });
    const readyRoom = await fetch(`${origin}/api/rooms/${created.room.id}`, { headers: roomHeaders(created.access.accessToken) });
    await expect(readyRoom.json()).resolves.toMatchObject({ version: 1, snapshot: { title: "ready" } });
  });

  it("returns only room metadata when a transaction requests a minimal acknowledgement", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "initial" });

    const updated = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({ txId: "minimal-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "large" } }),
    });
    const body = await updated.json() as Record<string, unknown>;

    expect(body).toMatchObject({ version: 1, ready: true, lastTxId: "minimal-1" });
    expect(body.snapshot).toBeUndefined();
  });

  it("rejects viewer writes while allowing an invited editor to update a room", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "initial" });
    const editorInvite = await fetch(`${origin}/api/rooms/${created.room.id}/invitations`, { method: "POST", headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }), body: JSON.stringify({ role: "editor" }) }).then((response) => response.json()) as { token: string };
    const viewerInvite = await fetch(`${origin}/api/rooms/${created.room.id}/invitations`, { method: "POST", headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }), body: JSON.stringify({ role: "viewer" }) }).then((response) => response.json()) as { token: string };
    const editor = await fetch(`${origin}/api/rooms/${created.room.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑者" }) }).then((response) => response.json()) as { access: { accessToken: string } };
    const viewer = await fetch(`${origin}/api/rooms/${created.room.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteToken: viewerInvite.token, clientId: "viewer", displayName: "查看者" }) }).then((response) => response.json()) as { access: { accessToken: string } };
    const edited = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, { method: "POST", headers: roomHeaders(editor.access.accessToken, { "Content-Type": "application/json" }), body: JSON.stringify({ txId: "editor-1", clientId: "editor", baseVersion: 0, snapshot: { title: "edited" } }) });
    expect(edited.status).toBe(200);
    const denied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, { method: "POST", headers: roomHeaders(viewer.access.accessToken, { "Content-Type": "application/json" }), body: JSON.stringify({ txId: "viewer-1", clientId: "viewer", baseVersion: 1, snapshot: { title: "forbidden" } }) });
    expect(denied.status).toBe(403);
  });

  it("tracks members through join, heartbeat, and leave endpoints", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const invitationResponse = await fetch(`${origin}/api/rooms/${created.room.id}/invitations`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "editor" }),
    });
    const invitation = await invitationResponse.json() as { token: string };
    const joined = await fetch(`${origin}/api/rooms/${created.room.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: invitation.token, clientId: "editor", displayName: "编辑同学" }),
    });
    const editorAccess = (await joined.json() as { access: { accessToken: string } }).access;

    const heartbeat = await fetch(`${origin}/api/rooms/${created.room.id}/members`, {
      method: "POST",
      headers: roomHeaders(editorAccess.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "editor" }),
    });
    expect(heartbeat.status).toBe(200);
    const heartbeatBody = await heartbeat.json() as { id: string; version: number; members: Array<{ clientId: string; role: string }> };
    expect(heartbeatBody).toMatchObject({ id: created.room.id, version: 0 });
    expect(heartbeatBody.members.map((member) => member.clientId)).toEqual(["client-a", "editor"]);

    const heartbeatAgain = await fetch(`${origin}/api/rooms/${created.room.id}/members`, {
      method: "POST",
      headers: roomHeaders(editorAccess.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "editor" }),
    });
    const heartbeatAgainBody = await heartbeatAgain.json() as { members: Array<{ clientId: string; role: string }> };
    expect(heartbeatAgainBody.members).toEqual(expect.arrayContaining([expect.objectContaining({ clientId: "editor", role: "editor" })]));
    expect(heartbeatAgainBody.members).toHaveLength(2);

    const left = await fetch(`${origin}/api/rooms/${created.room.id}/leave`, {
      method: "POST",
      headers: roomHeaders(editorAccess.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "editor" }),
    });
    await expect(left.json()).resolves.toMatchObject({ members: [{ clientId: "client-a", role: "owner" }] });
    const leftAgain = await fetch(`${origin}/api/rooms/${created.room.id}/leave`, {
      method: "POST",
      headers: roomHeaders(editorAccess.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "editor" }),
    });
    await expect(leftAgain.json()).resolves.toMatchObject({ members: [{ clientId: "client-a", role: "owner" }] });
  });

  it("validates member bodies and rejects heartbeat on closed rooms", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });

    const invalid = await fetch(`${origin}/api/rooms/${created.room.id}/members`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const anonymous = await fetch(`${origin}/api/rooms/${created.room.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a" }),
    });
    expect(anonymous.status).toBe(403);

    const closed = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "client-a", action: "close" }),
    });
    expect(closed.status).toBe(200);
    const heartbeatOnClosed = await fetch(`${origin}/api/rooms/${created.room.id}/members`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "client-a" }),
    });
    expect(heartbeatOnClosed.status).toBe(409);
    await expect(heartbeatOnClosed.json()).resolves.toMatchObject({ error: { code: "ROOM_CLOSED" } });
  });

  it("lets only the owner change access; readonly blocks writes and close blocks joins", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const invitationResponse = await fetch(`${origin}/api/rooms/${created.room.id}/invitations`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "editor" }),
    });
    const invitation = await invitationResponse.json() as { token: string };
    const joined = await fetch(`${origin}/api/rooms/${created.room.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: invitation.token, clientId: "editor", displayName: "编辑同学" }),
    });
    const editorAccess = (await joined.json() as { access: { accessToken: string } }).access;

    const editorForbidden = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
      method: "POST",
      headers: roomHeaders(editorAccess.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "editor", action: "set-readonly" }),
    });
    expect(editorForbidden.status).toBe(403);
    await expect(editorForbidden.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });

    const readonly = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "client-a", action: "set-readonly" }),
    });
    await expect(readonly.json()).resolves.toMatchObject({ readonly: true, closed: false });

    const blockedWrite = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(editorAccess.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "write-1", clientId: "editor", baseVersion: 0, snapshot: { title: "越权" } }),
    });
    expect(blockedWrite.status).toBe(403);
    await expect(blockedWrite.json()).resolves.toMatchObject({ error: { code: "READONLY_ROOM" } });

    const closed = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "client-a", action: "close" }),
    });
    await expect(closed.json()).resolves.toMatchObject({ readonly: true, closed: true });

    const writeAfterClose = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "write-2", clientId: "client-a", baseVersion: 0, snapshot: { title: "关闭后" } }),
    });
    expect(writeAfterClose.status).toBe(409);
    await expect(writeAfterClose.json()).resolves.toMatchObject({ error: { code: "ROOM_CLOSED" } });

    const accessAfterClose = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ clientId: "client-a", action: "set-readonly" }),
    });
    expect(accessAfterClose.status).toBe(409);

    const lateInviteResponse = await fetch(`${origin}/api/rooms/${created.room.id}/invitations`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "viewer" }),
    });
    const lateInvite = await lateInviteResponse.json() as { token: string };
    const lateJoin = await fetch(`${origin}/api/rooms/${created.room.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: lateInvite.token, clientId: "late", displayName: "迟到" }),
    });
    expect(lateJoin.status).toBe(409);
    await expect(lateJoin.json()).resolves.toMatchObject({ error: { code: "ROOM_CLOSED" } });
  });

  it("returns operation backfills for authorized members and validates afterVersion", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const opA = { type: "set", path: ["title"], value: "甲" };
    const opB = { type: "set", path: ["title"], value: "乙" };
    await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "op-1", clientId: "client-a", baseVersion: 0, operations: [opA] }),
    });
    await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "op-2", clientId: "client-a", baseVersion: 1, operations: [opB] }),
    });

    const backfill = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=1`, { headers: roomHeaders(created.access.accessToken) });
    expect(backfill.status).toBe(200);
    await expect(backfill.json()).resolves.toMatchObject({ id: created.room.id, version: 2, afterVersion: 1, operations: [opB] });

    const upToDate = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=2`, { headers: roomHeaders(created.access.accessToken) });
    await expect(upToDate.json()).resolves.toMatchObject({ version: 2, operations: [] });

    const invalidVersion = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=abc`, { headers: roomHeaders(created.access.accessToken) });
    expect(invalidVersion.status).toBe(400);
    await expect(invalidVersion.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    const negativeVersion = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=-1`, { headers: roomHeaders(created.access.accessToken) });
    expect(negativeVersion.status).toBe(400);
    await expect(negativeVersion.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const noToken = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=0`);
    expect(noToken.status).toBe(403);
  });

  it("rejects backfills when the room is initializing or history was trimmed", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, undefined, "client-fast");

    const initializing = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=0`, { headers: roomHeaders(created.access.accessToken) });
    expect(initializing.status).toBe(425);
    await expect(initializing.json()).resolves.toMatchObject({ error: { code: "ROOM_INITIALIZING" } });

    await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "init-1", clientId: "client-fast", baseVersion: 0, snapshot: { title: "ready" } }),
    });
    await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "op-1", clientId: "client-fast", baseVersion: 1, operations: [{ type: "set", path: ["title"], value: "甲" }] }),
    });
    await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "snap-2", clientId: "client-fast", baseVersion: 2, snapshot: { title: "全量" } }),
    });

    const trimmed = await fetch(`${origin}/api/rooms/${created.room.id}/operations?afterVersion=0`, { headers: roomHeaders(created.access.accessToken) });
    expect(trimmed.status).toBe(409);
    await expect(trimmed.json()).resolves.toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  });
});
