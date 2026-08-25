// @vitest-environment node
// SSE 票据、广播、断连回收与房间关闭后的写入安全。
import { describe, expect, it, vi } from "vitest";
import { createAiServer } from "./index";
import { captureProcessFailures, createCollaborationRoom, createEventsTicket, createInMemoryEventStream, joinRoomMember, openEventStream, rawGet, roomHeaders, startServer, useServerFixture, wait } from "./index-test-fixtures";

const { servers } = useServerFixture();

describe("unified application server — room event streams", () => {
  it("issues one-use SSE tickets and broadcasts incremental operations", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { project: { title: "initial" }, assets: ["large"] });
    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=0`, { signal: controller.signal });
    const reader = events.body!.getReader();
    try {
      expect(events.headers.get("content-type")).toContain("text/event-stream");
      await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ txId: "patch-live", clientId: "client-a", baseVersion: 0, operations: [{ type: "set", path: ["project", "title"], value: "patched" }] }),
      });
      const stream = new TextDecoder().decode((await reader.read()).value, { stream: true });
      expect(stream).toContain("patch-live");
      expect(stream).toContain("operations");
      expect(stream).not.toContain("large");
      const reused = await fetch(`${origin}/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}`);
      expect(reused.status).toBe(403);
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it("returns the full snapshot when an authorized member reconnects from a stale version", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { payload: "initial" });
    await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "own-reconnect", clientId: "client-a", baseVersion: 0, snapshot: { payload: "recover-me" } }),
    });

    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=0`, { signal: controller.signal });
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    try {
      const chunk = await reader.read();
      const stream = decoder.decode(chunk.value, { stream: true });
      expect(stream).toContain("\"version\":1");
      expect(stream).toContain("recover-me");
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it("broadcasts members and closed events over SSE", async () => {
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
    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);

    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=0`, { signal: controller.signal });
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    try {
      const joined = await fetch(`${origin}/api/rooms/${created.room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: invitation.token, clientId: "editor", displayName: "编辑同学" }),
      });
      expect(joined.status).toBe(200);
      const membersChunk = await reader.read();
      const membersStream = decoder.decode(membersChunk.value, { stream: true });
      expect(membersStream).toContain("event: members");
      expect(membersStream).toContain("\"clientId\":\"editor\"");

      const closed = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId: "client-a", action: "close" }),
      });
      expect(closed.status).toBe(200);
      const closedChunk = await reader.read();
      const closedStream = decoder.decode(closedChunk.value, { stream: true });
      expect(closedStream).toContain("event: closed");
      expect(closedStream).toContain("\"closed\":true");
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it("never writes to an event stream that was ended by a room close", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const editorToken = await joinRoomMember(origin, created.room.id, created.access.accessToken, "editor", "editor");
    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    const stream = createInMemoryEventStream(`/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=0`);
    server.emit("request", stream.request, stream.response);
    try {
      const closed = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId: "client-a", action: "close" }),
      });
      expect(closed.status).toBe(200);
      expect(stream.chunks.join("")).toContain("event: closed");
      expect(stream.response.writableEnded).toBe(true);

      const left = await fetch(`${origin}/api/rooms/${created.room.id}/leave`, {
        method: "POST",
        headers: roomHeaders(editorToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId: "editor" }),
      });

      expect(stream.writesAfterEnd).toEqual([]);
      expect(left.status).toBe(200);
    } finally {
      stream.disconnect();
    }
  });

  it("survives a member leaving after the owner closed the room", async () => {
    const monitor = captureProcessFailures();
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const editorToken = await joinRoomMember(origin, created.room.id, created.access.accessToken, "editor", "editor");
    const stream = await openEventStream(origin, created.room.id, created.access.accessToken);
    try {
      const closed = await fetch(`${origin}/api/rooms/${created.room.id}/access`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId: "client-a", action: "close" }),
      });
      expect(closed.status).toBe(200);
      expect(await stream.read()).toContain("event: closed");
      expect(await stream.read()).toBeNull();

      const left = await fetch(`${origin}/api/rooms/${created.room.id}/leave`, {
        method: "POST",
        headers: roomHeaders(editorToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId: "editor" }),
      });
      expect(left.status).toBe(200);
      await wait(50);

      expect(monitor.failures).toEqual([]);
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
      await stream.close();
    }
  });

  it("serializes one payload per broadcast no matter how many subscribers are attached", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { project: { title: "initial" }, assets: ["large"] });
    const streams = [] as Array<Awaited<ReturnType<typeof openEventStream>>>;
    for (let index = 0; index < 10; index += 1) {
      streams.push(await openEventStream(origin, created.room.id, created.access.accessToken));
    }
    const serialize = JSON.stringify;
    let broadcastSerializations = 0;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown, ...rest: unknown[]) => {
      const room = value as { id?: unknown; members?: unknown; snapshot?: unknown; version?: unknown } | null;
      if (
        room && typeof room === "object" && !Array.isArray(room)
        && room.id === created.room.id && Array.isArray(room.members)
        && typeof room.version === "number" && room.snapshot === undefined
      ) {
        broadcastSerializations += 1;
      }
      return (serialize as (...args: unknown[]) => string)(value, ...rest);
    }) as typeof JSON.stringify);
    try {
      const applied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ txId: "fanout-1", clientId: "client-a", baseVersion: 0, operations: [{ type: "set", path: ["project", "title"], value: "patched" }] }),
      });
      expect(applied.status).toBe(200);
      const received = await Promise.all(streams.map((stream) => stream.read()));
      expect(received.every((chunk) => chunk?.includes("fanout-1"))).toBe(true);
      expect(received.every((chunk) => !chunk?.includes("large"))).toBe(true);
    } finally {
      spy.mockRestore();
      await Promise.all(streams.map((stream) => stream.close()));
    }
    expect(broadcastSerializations).toBe(1);
  });

  it("frees the subscriber slot and stops the heartbeat when a stream disconnects mid-session", async () => {
    const server = createAiServer({ maxRoomSubscribers: 1 });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const stream = await openEventStream(origin, created.room.id, created.access.accessToken);
    const secondTicket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    const rejected = await fetch(`${origin}/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(secondTicket)}&version=0`);
    expect(rejected.status).toBe(429);
    await expect(rejected.json()).resolves.toMatchObject({ error: { code: "SUBSCRIBER_LIMIT_REACHED" } });

    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    try {
      await stream.close();
      await wait(80);
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
    }

    const reconnected = await openEventStream(origin, created.room.id, created.access.accessToken);
    try {
      expect(reconnected.response.status).toBe(200);
    } finally {
      await reconnected.close();
    }
  });

  it("keeps heartbeats from extending the room lifetime", async () => {
    const monitor = captureProcessFailures();
    const server = createAiServer({ roomHeartbeatIntervalMs: 25, roomTtlMs: 150 });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const stream = await openEventStream(origin, created.room.id, created.access.accessToken);
    try {
      expect(await stream.read()).toContain(": heartbeat");
      await wait(300);
      const expired = await fetch(`${origin}/api/rooms/${created.room.id}`, { headers: roomHeaders(created.access.accessToken) });
      expect(expired.status).toBe(404);
      await expect(expired.json()).resolves.toMatchObject({ error: { code: "ROOM_NOT_FOUND" } });
      expect(monitor.failures).toEqual([]);
    } finally {
      monitor.restore();
      await stream.close();
    }
  });
});
