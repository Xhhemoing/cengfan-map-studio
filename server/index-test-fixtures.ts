// 统一应用服务器测试的共享装置：`server/index.test.ts` 按域拆分前的前言原样搬到这里，
// 供 `server/index.*.test.ts` 各域文件共用，同时提供文件级的服务器/临时目录清理网。
import { afterEach, expect, vi } from "vitest";
import { rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import type http from "node:http";

export async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

export async function rawGet(origin: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "GET", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

/** 捕获进程级崩溃信号：写入已结束的响应会以未处理的 error 事件形式冒泡。 */
export function captureProcessFailures(): { failures: unknown[]; restore: () => void } {
  const failures: unknown[] = [];
  const record = (error: unknown) => { failures.push(error); };
  process.on("uncaughtException", record);
  process.on("unhandledRejection", record);
  return {
    failures,
    restore: () => {
      process.off("uncaughtException", record);
      process.off("unhandledRejection", record);
    },
  };
}

export const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * 内存中的 SSE 请求/响应对：真实 socket 无法稳定复现「房间关闭后又收到成员事件」的时序，
 * 这里直接驱动服务器回调，并像 Node 一样把结束后的写入视为致命错误。
 */
export function createInMemoryEventStream(path: string) {
  const request = Object.assign(new EventEmitter(), {
    url: path,
    method: "GET",
    headers: {} as Record<string, string>,
    socket: { remoteAddress: "127.0.0.1" },
  }) as unknown as http.IncomingMessage;
  const chunks: string[] = [];
  const writesAfterEnd: string[] = [];
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead(this: { headersSent: boolean }) { this.headersSent = true; return this; },
    flushHeaders() { return undefined; },
    write(chunk: string) {
      if (response.writableEnded) {
        writesAfterEnd.push(chunk);
        throw new Error("ERR_STREAM_WRITE_AFTER_END");
      }
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (typeof chunk === "string") chunks.push(chunk);
      response.writableEnded = true;
      return response;
    },
  }) as unknown as http.ServerResponse & { writableEnded: boolean };
  return {
    request,
    response,
    chunks,
    writesAfterEnd,
    disconnect: () => { request.emit("close"); },
  };
}

/**
 * 背压可控的 SSE 响应替身：默认 write 永远返回 false 且不回调完成函数，等价于对端
 * socket 一直不读。真实 socket 会先被内核缓冲吞掉几百 KB，无法稳定复现慢订阅者。
 * `drain: true` 则是健康订阅者：写入立即完成，不产生积压。
 */
export function createBackpressuredEventStream(path: string, options: { drain?: boolean } = {}) {
  const request = Object.assign(new EventEmitter(), {
    url: path,
    method: "GET",
    headers: {} as Record<string, string>,
    socket: { remoteAddress: "127.0.0.1" },
    destroyed: false,
  }) as unknown as http.IncomingMessage;
  const state = { bufferedBytes: 0, peakBufferedBytes: 0, writesAfterEnd: 0, frames: [] as string[] };
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead(this: { headersSent: boolean }) { this.headersSent = true; return this; },
    flushHeaders() { return undefined; },
    write(chunk: string, callback?: () => void) {
      if (response.writableEnded || response.destroyed) {
        state.writesAfterEnd += 1;
        throw new Error("ERR_STREAM_WRITE_AFTER_END");
      }
      state.frames.push(chunk);
      if (options.drain) {
        callback?.();
        return true;
      }
      state.bufferedBytes += Buffer.byteLength(chunk, "utf8");
      if (state.bufferedBytes > state.peakBufferedBytes) state.peakBufferedBytes = state.bufferedBytes;
      return false;
    },
    end() {
      response.writableEnded = true;
      return response;
    },
    destroy() {
      response.destroyed = true;
      // 连接销毁时内核队列一起释放，这正是慢订阅者必须被断开的理由。
      state.bufferedBytes = 0;
      response.emit("close");
      return response;
    },
  }) as unknown as http.ServerResponse & { writableEnded: boolean; destroyed: boolean };
  return { request, response, state, disconnect: () => { request.emit("close"); } };
}

/** 创建/加入/快照三个响应上的落盘三态兄弟字段；`at` 为 null 表示还没有成功落过盘。 */
export interface RoomPersistenceField {
  outcome: "persisted" | "trimmed" | "skipped";
  at: number | null;
  /** 最近一次落盘失败的时刻；当前没有失败连击时这个键不出现。 */
  lastFailureAt?: number;
}

export interface PersistenceEnvelope {
  persistedAtLastFlush?: boolean;
  persistence?: RoomPersistenceField;
}

export async function createCollaborationRoom(origin: string, snapshot: unknown, clientId = "client-a") {
  const response = await fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, displayName: clientId, ...(snapshot === undefined ? {} : { snapshot }) }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{
    room: { id: string; version: number; ready: boolean };
    access: { accessToken: string };
    persistedAtLastFlush?: boolean;
    persistence?: RoomPersistenceField;
  }>;
}

export function roomHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { "X-Cengfan-Room-Token": accessToken, ...headers };
}

/** 事务 ack：正在编辑的成员在稳态下唯一会反复收到的响应。 */
export async function postRoomTransaction(
  origin: string,
  roomId: string,
  accessToken: string,
  body: { txId: string; clientId: string; baseVersion: number; snapshot?: unknown },
  minimal = false,
): Promise<PersistenceEnvelope & { version: number; snapshot?: unknown }> {
  const response = await fetch(`${origin}/api/rooms/${roomId}/transactions`, {
    method: "POST",
    headers: roomHeaders(accessToken, { "Content-Type": "application/json", ...(minimal ? { Prefer: "return=minimal" } : {}) }),
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return await response.json() as PersistenceEnvelope & { version: number; snapshot?: unknown };
}

export async function createEventsTicket(origin: string, roomId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${origin}/api/rooms/${roomId}/events-ticket`, {
    method: "POST",
    headers: roomHeaders(accessToken),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { ticket: string }).ticket;
}

export async function joinRoomMember(
  origin: string,
  roomId: string,
  ownerToken: string,
  role: "editor" | "viewer",
  clientId: string,
): Promise<string> {
  const invitation = await fetch(`${origin}/api/rooms/${roomId}/invitations`, {
    method: "POST",
    headers: roomHeaders(ownerToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ role }),
  }).then((response) => response.json()) as { token: string };
  const joined = await fetch(`${origin}/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken: invitation.token, clientId, displayName: clientId }),
  });
  expect(joined.status).toBe(200);
  return (await joined.json() as { access: { accessToken: string } }).access.accessToken;
}

export async function openEventStream(origin: string, roomId: string, accessToken: string, version = 0) {
  const ticket = await createEventsTicket(origin, roomId, accessToken);
  const controller = new AbortController();
  const response = await fetch(
    `${origin}/api/rooms/${roomId}/events?ticket=${encodeURIComponent(ticket)}&version=${version}`,
    { signal: controller.signal },
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  return {
    response,
    controller,
    reader,
    read: async () => {
      const chunk = await reader.read();
      return chunk.done ? null : decoder.decode(chunk.value, { stream: true });
    },
    close: async () => {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    },
  };
}

export async function rawPost(origin: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const target = new URL(origin);
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end(payload);
  });
}

export function workspaceRequestInit(token = "workspace-test-token"): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

/**
 * 每个域文件在顶层调用一次：登记服务器与临时目录，并挂上文件级的 afterEach 清理。
 * 漏掉它的文件会把监听中的服务器和临时目录留给下一个用例。
 */
export function useServerFixture(): { servers: http.Server[]; directories: string[] } {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections?.();
          }),
      ),
    );
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
    servers.length = 0;
    directories.length = 0;
  });

  return { servers, directories };
}
