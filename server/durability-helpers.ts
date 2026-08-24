// 仅供 durability 旅程测试使用的共享装置：这些函数要跑真实 HTTP + 真实落盘，
// 从 durability.integration.test.ts 原样搬出，供多条旅程共用（不含任何断言改写）。
import { expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type http from "node:http";

// 复制自 server/index.test.ts：这条旅程要跑真实 HTTP + 真实落盘，不能改那份测试。
export async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

export function roomHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { "X-Cengfan-Room-Token": accessToken, ...headers };
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
  }>;
}

export async function createEventsTicket(origin: string, roomId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${origin}/api/rooms/${roomId}/events-ticket`, {
    method: "POST",
    headers: roomHeaders(accessToken),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { ticket: string }).ticket;
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

/** 快照信封在磁盘上的形状：这两条旅程关心恢复了谁、上次关停丢了谁、谁被裁掉了历史。 */
export interface PersistedEnvelope {
  version: number;
  rooms: {
    room: { id: string; version?: number; snapshot?: unknown };
    operationHistory?: { version: number }[];
  }[];
  skippedRoomCount?: number;
  skippedRoomIds?: string[];
  trimmedRoomIds?: string[];
}

export async function readEnvelope(file: string): Promise<PersistedEnvelope> {
  return JSON.parse(await readFile(file, "utf8")) as PersistedEnvelope;
}

export const lines = (spy: { mock: { calls: unknown[][] } }): string[] => spy.mock.calls.map((call) => String(call[0]));

/**
 * 原子落盘留在数据目录里的临时文件（`<file>.<pid>.tmp`）。落盘成功时它只在 write 与 rename
 * 之间存在,所以任何一次「静止时刻」的非空结果都是孤儿。
 */
export async function orphanedTempFiles(dataDir: string): Promise<string[]> {
  return (await readdir(dataDir)).filter((name) => name.endsWith(".tmp")).sort();
}

/** 房间响应上的落盘字段:创建/加入/事务 ack/快照四个响应共用这一份形状。 */
export interface RoomPersistenceFields {
  persistedAtLastFlush: boolean;
  persistence: {
    outcome: "persisted" | "trimmed" | "skipped";
    at: number | null;
    /** 当前失败连击的最近一次失败时刻;没有连击时整个键缺席。 */
    lastFailureAt?: number;
  };
}

/** 提交一次事务并返回 ack 原文:这条 ack 是编辑者稳态下唯一会反复收到的响应。 */
export async function applyRoomTransaction(
  origin: string,
  roomId: string,
  accessToken: string,
  body: { txId: string; clientId: string; baseVersion: number; snapshot: unknown },
): Promise<RoomPersistenceFields & { version: number }> {
  const response = await fetch(`${origin}/api/rooms/${roomId}/transactions`, {
    method: "POST",
    headers: roomHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return await response.json() as RoomPersistenceFields & { version: number };
}

/** 取一次房间快照:落盘故障期间它与 ack 必须讲同一件事。 */
export async function readRoomSnapshot(
  origin: string,
  roomId: string,
  accessToken: string,
): Promise<RoomPersistenceFields & { version: number; snapshot: Record<string, unknown> }> {
  const response = await fetch(`${origin}/api/rooms/${roomId}`, { headers: roomHeaders(accessToken) });
  expect(response.status).toBe(200);
  return await response.json() as RoomPersistenceFields & { version: number; snapshot: Record<string, unknown> };
}
