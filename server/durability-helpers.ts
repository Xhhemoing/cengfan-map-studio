// 仅供 durability 旅程测试使用的共享装置：这些函数要跑真实 HTTP + 真实落盘，
// 从 durability.integration.test.ts 原样搬出，供多条旅程共用（不含任何断言改写）。
import { expect } from "vitest";
import { readFile } from "node:fs/promises";
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
