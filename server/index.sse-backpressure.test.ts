// @vitest-environment node
// 慢订阅者的积压上界、可丢事件暂停与单事件体积上限。
import { describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import type http from "node:http";
import { createAiServer } from "./index";
import { captureProcessFailures, createBackpressuredEventStream, createCollaborationRoom, createEventsTicket, joinRoomMember, rawGet, roomHeaders, startServer, installServerFixture, wait } from "./index-test-fixtures";

const { servers } = installServerFixture();

describe("unified application server — room event stream backpressure", () => {
  it("does not throw when a slow subscriber stops draining the stream", async () => {
    const monitor = captureProcessFailures();
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    const target = new URL(origin);
    const idleResponse = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const request = httpRequest({
        hostname: target.hostname,
        port: target.port,
        path: `/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=0`,
        method: "GET",
      }, resolve);
      request.on("error", reject);
      request.end();
    });
    idleResponse.pause();
    try {
      const applied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ txId: "slow-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "x".repeat(1_000_000) } }),
      });
      expect(applied.status).toBe(200);
      await wait(50);
      expect(monitor.failures).toEqual([]);
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
      idleResponse.destroy();
    }
  });

  it("bounds buffered bytes and disconnects laggards when 50 subscribers never drain", async () => {
    const monitor = captureProcessFailures();
    const maxRoomStreamBufferedBytes = 128 * 1024;
    const maxRoomEventBytes = 512 * 1024;
    const subscriberCount = 50;
    const eventCount = 8;
    const server = createAiServer({
      maxRoomEventBytes,
      maxRoomStreamBufferedBytes,
      maxRoomSubscribers: subscriberCount + 10,
      roomHeartbeatIntervalMs: 60_000,
    });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const editorToken = await joinRoomMember(origin, created.room.id, created.access.accessToken, "editor", "editor");
    const streams = [] as Array<ReturnType<typeof createBackpressuredEventStream>>;
    for (let index = 0; index < subscriberCount; index += 1) {
      const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
      // version 高于房间版本，跳过引导快照，测量的就是广播事件本身的积压。
      const stream = createBackpressuredEventStream(
        `/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=999`,
      );
      server.emit("request", stream.request, stream.response);
      streams.push(stream);
    }

    const blob = "x".repeat(100_000);
    try {
      for (let index = 0; index < eventCount; index += 1) {
        const applied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
          method: "POST",
          headers: roomHeaders(editorToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            txId: `laggard-${index}`,
            clientId: "editor",
            baseVersion: index,
            snapshot: { title: `v${index}`, blob },
          }),
        });
        expect(applied.status).toBe(200);
      }
      await wait(20);

      // 传输侧观测（与服务端指标无关）：不设背压时每条连接都会攒下全部 8 个事件。
      const naiveBufferedBytes = subscriberCount * eventCount * blob.length;
      const observedBufferedBytes = streams.reduce((total, stream) => total + stream.state.peakBufferedBytes, 0);
      expect(observedBufferedBytes).toBeLessThan(naiveBufferedBytes / 4);
      expect(streams.every((stream) => stream.state.peakBufferedBytes <= maxRoomStreamBufferedBytes + maxRoomEventBytes)).toBe(true);
      expect(streams.every((stream) => stream.response.destroyed || stream.response.writableEnded)).toBe(true);
      expect(streams.every((stream) => stream.state.writesAfterEnd === 0)).toBe(true);

      const stats = server.roomStreamStats!();
      // 每条连接最多积压「上限 + 一个事件」，越过就断开；进程侧总量因此有硬上界。
      expect(stats.peakStreamBufferedBytes).toBeLessThanOrEqual(maxRoomStreamBufferedBytes + maxRoomEventBytes);
      expect(stats.peakBufferedBytes).toBeLessThanOrEqual(subscriberCount * (maxRoomStreamBufferedBytes + maxRoomEventBytes));
      expect(stats.peakBufferedBytes).toBeLessThan(naiveBufferedBytes / 4);
      expect(stats.laggardDisconnects).toBe(subscriberCount);
      expect(stats.openStreams).toBe(0);
      expect(stats.bufferedBytes).toBe(0);
      expect(monitor.failures).toEqual([]);
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
      streams.forEach((stream) => stream.disconnect());
    }
  });

  it("pauses droppable events under backpressure before disconnecting the laggard", async () => {
    const monitor = captureProcessFailures();
    const server = createAiServer({
      maxRoomEventBytes: 512 * 1024,
      maxRoomStreamBufferedBytes: 256 * 1024,
      roomHeartbeatIntervalMs: 60_000,
    });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const editorToken = await joinRoomMember(origin, created.room.id, created.access.accessToken, "editor", "editor");
    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    const stream = createBackpressuredEventStream(
      `/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=999`,
    );
    server.emit("request", stream.request, stream.response);
    const blob = "y".repeat(200_000);
    try {
      const first = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(editorToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ txId: "pause-1", clientId: "editor", baseVersion: 0, snapshot: { title: "big", blob } }),
      });
      expect(first.status).toBe(200);
      expect(stream.state.frames).toHaveLength(1);

      // 自己提交的事务只会广播元数据事件，积压时跳过它不会让客户端漏内容。
      const own = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          txId: "pause-2",
          clientId: "client-a",
          baseVersion: 1,
          operations: [{ type: "set", path: ["title"], value: "paused" }],
        }),
      });
      expect(own.status).toBe(200);
      expect(stream.state.frames).toHaveLength(1);
      expect(stream.response.writableEnded).toBe(false);
      expect(server.roomStreamStats!().droppedEvents).toBeGreaterThanOrEqual(1);

      const second = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(editorToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ txId: "pause-3", clientId: "editor", baseVersion: 2, snapshot: { title: "big-2", blob } }),
      });
      expect(second.status).toBe(200);
      const stats = server.roomStreamStats!();
      expect(stats.laggardDisconnects).toBe(1);
      expect(stats.bufferedBytes).toBe(0);
      expect(stats.openStreams).toBe(0);
      expect(stream.response.destroyed).toBe(true);
      expect(stream.state.frames).toHaveLength(1);
      expect(monitor.failures).toEqual([]);
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
      stream.disconnect();
    }
  });

  it("refuses to push a snapshot event past the per-event size cap", async () => {
    const monitor = captureProcessFailures();
    const server = createAiServer({ maxRoomEventBytes: 64 * 1024, roomHeartbeatIntervalMs: 60_000 });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const editorToken = await joinRoomMember(origin, created.room.id, created.access.accessToken, "editor", "editor");
    const ticket = await createEventsTicket(origin, created.room.id, created.access.accessToken);
    // 健康订阅者：写入立刻完成，所以断流只可能来自事件体积上限。
    const stream = createBackpressuredEventStream(
      `/api/rooms/${created.room.id}/events?ticket=${encodeURIComponent(ticket)}&version=999`,
      { drain: true },
    );
    server.emit("request", stream.request, stream.response);
    try {
      const applied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(editorToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          txId: "oversize-1",
          clientId: "editor",
          baseVersion: 0,
          snapshot: { title: "huge", blob: "z".repeat(200_000) },
        }),
      });
      expect(applied.status).toBe(200);
      expect(stream.response.writableEnded).toBe(true);
      // 超限事件既不半发也不降级为 lite：降级会让客户端把版本推到它没收到的内容上。
      expect(stream.state.frames.some((frame) => frame.includes("zzz"))).toBe(false);
      expect(stream.state.writesAfterEnd).toBe(0);
      const stats = server.roomStreamStats!();
      expect(stats.oversizedEvents).toBe(1);
      expect(stats.laggardDisconnects).toBe(1);
      expect(stats.openStreams).toBe(0);
      expect(monitor.failures).toEqual([]);
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
      stream.disconnect();
    }
  });
});
