// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { createAiLogger } from "./ai/ai-observability";
import { createRateLimiter } from "./ai/rate-limit";
import { attachServerLifecycle, createAiServer, createReadyAiServer, DEFAULT_PORT, resolvePort } from "./index";
import { createRoomStore } from "./collaboration";

const fsHooks = vi.hoisted(() => ({ createReadStream: null as null | ((filePath: string) => unknown) }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const createReadStream = (filePath: unknown, options?: unknown) => (
    fsHooks.createReadStream
      ? fsHooks.createReadStream(String(filePath))
      : (actual.createReadStream as (path: unknown, options?: unknown) => unknown)(filePath, options)
  );
  return { ...actual, default: { ...actual, createReadStream }, createReadStream };
});

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function rawGet(origin: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
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
function captureProcessFailures(): { failures: unknown[]; restore: () => void } {
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

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * 内存中的 SSE 请求/响应对：真实 socket 无法稳定复现「房间关闭后又收到成员事件」的时序，
 * 这里直接驱动服务器回调，并像 Node 一样把结束后的写入视为致命错误。
 */
function createInMemoryEventStream(path: string) {
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
function createBackpressuredEventStream(path: string, options: { drain?: boolean } = {}) {
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

async function createCollaborationRoom(origin: string, snapshot: unknown, clientId = "client-a") {
  const response = await fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, displayName: clientId, ...(snapshot === undefined ? {} : { snapshot }) }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ room: { id: string; version: number; ready: boolean }; access: { accessToken: string } }>;
}

function roomHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { "X-Cengfan-Room-Token": accessToken, ...headers };
}

async function createEventsTicket(origin: string, roomId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${origin}/api/rooms/${roomId}/events-ticket`, {
    method: "POST",
    headers: roomHeaders(accessToken),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { ticket: string }).ticket;
}

async function joinRoomMember(
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

async function openEventStream(origin: string, roomId: string, accessToken: string, version = 0) {
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

async function rawPost(origin: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
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

function workspaceRequestInit(token = "workspace-test-token"): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

describe("unified application server", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    fsHooks.createReadStream = null;
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

  it.each([
    ["room creation", "/api/rooms", null],
    ["AI explanation", "/api/ai/explain", "not-an-object"],
  ])("rejects a non-object JSON body for %s", async (_name, path, body) => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: path === "/api/ai/explain" ? "AI_VALIDATION_ERROR" : "VALIDATION_ERROR" } });
  });

  it("rejects an array transaction body before attempting to find the room", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "initial" });

    const response = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify([]),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("uses the default port for malformed values and accepts valid ports", () => {
    expect(resolvePort(undefined)).toBe(DEFAULT_PORT);
    expect(resolvePort("0")).toBe(DEFAULT_PORT);
    expect(resolvePort("not-a-port")).toBe(DEFAULT_PORT);
    expect(resolvePort("8790")).toBe(8790);
  });

  it("does not expose the global workspace API unless an explicit token is configured", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/workspace`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "WORKSPACE_API_DISABLED" },
    });
  });

  it("requires the configured workspace token for reads and writes", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-auth-"));
    directories.push(dataDir);
    const server = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(server);
    const origin = await startServer(server);
    const snapshot = {
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: {
        kind: "cengfan-project-package",
        version: 2,
        exportedAt: "2026-07-27T00:00:00.000Z",
        project: { schemaVersion: 2, students: [] },
        assets: [],
        fonts: [],
        customTemplates: [],
        renderSettings: { mode: "low", fixedFps: 12 },
      },
    };

    const unauthorized = await fetch(`${origin}/api/workspace`);
    expect(unauthorized.status).toBe(401);
    const saved = await fetch(`${origin}/api/workspace`, {
      method: "PUT",
      ...workspaceRequestInit(),
      body: JSON.stringify(snapshot),
    });
    expect(saved.status).toBe(204);
    const restored = await fetch(`${origin}/api/workspace`, workspaceRequestInit());
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toEqual(snapshot);
  });

  it("returns JSON 404 for unknown API routes instead of the SPA fallback", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-api-404-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/unknown`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects encoded paths that resolve outside the static directory", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-safe-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawGet(origin, "/%2e%2e/%2e%2e/etc/passwd");

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("validates the agent endpoint request shape", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const response = await fetch(`${origin}/api/ai/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "测试", digest: {} }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AI_VALIDATION_ERROR" } });
  });

  it("uses the local agent fallback when no AI key is configured and preserves request ids", async () => {
    const server = createAiServer({ agentConfig: {
      apiKey: undefined,
      baseUrl: "https://llm.example/v1",
      model: "deepseek-v4-flash",
      timeoutMs: 1000,
      maxTokens: 4000,
    } });
    servers.push(server);
    const origin = await startServer(server);
    const requestId = "review-request-42";
    const response = await fetch(`${origin}/api/ai/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({ userMessage: "地图缩小一点", digest: { map: { scale: 1 } }, messages: [{ role: "user", content: "地图缩小一点" }] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ kind: "tool-call", provider: "local-fallback", requestId });
  });

  it("reports the configured single-turn model separately from its provider", async () => {
    const server = createAiServer({ aiConfig: { apiKey: "single-key", baseUrl: "https://single.example/v1", model: "single-model", timeoutMs: 1000, maxTokens: 4000 } });
    servers.push(server);
    const origin = await startServer(server);
    await expect(fetch(`${origin}/api/health`).then((response) => response.json())).resolves.toMatchObject({
      ai: { singleTurn: { configured: true, model: "single-model", provider: "tokenfree" } },
    });
    const body = await fetch(`${origin}/api/health`).then((response) => response.text());
    expect(body).not.toContain("single-key");
  });

  it("uses independent agent and other-AI rate limiter windows", async () => {
    const server = createAiServer({
      rateLimiters: { agent: createRateLimiter({ limit: 1, windowMs: 60_000 }), otherAi: createRateLimiter({ limit: 1, windowMs: 60_000 }) },
    });
    servers.push(server);
    const origin = await startServer(server);
    const agentBody = { userMessage: "地图缩小一点", digest: { map: { scale: 1 } }, messages: [] };
    expect((await rawPost(origin, "/api/ai/agent", agentBody)).status).toBe(200);
    expect((await rawPost(origin, "/api/ai/agent", agentBody)).status).toBe(429);
    expect((await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 })).status).toBe(200);
    expect((await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 })).status).toBe(429);
  });

  it("returns the standard validation code for invalid agent requests", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const response = await rawPost(origin, "/api/ai/agent", { userMessage: "x", digest: {}, messages: [{ role: "tool", tool_call_id: "missing", content: "{}" }] }, { "x-request-id": "validation-standard" });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ requestId: "validation-standard", error: { code: "AI_VALIDATION_ERROR" } });
  });

  it("rate-limits anonymous room creation independently of AI windows", async () => {
    const server = createAiServer({
      rateLimiters: { rooms: createRateLimiter({ limit: 1, windowMs: 60_000 }) },
    });
    servers.push(server);
    const origin = await startServer(server);
    const body = { clientId: "client-a", displayName: "协作者", snapshot: { title: "room" } };
    expect((await fetch(`${origin}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status).toBe(201);
    const limited = await fetch(`${origin}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: { code: "ROOM_RATE_LIMITED" } });
  });

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

  it("rejects a replayed budget receipt while allowing only one concurrent continuation", async () => {
    const server = createAiServer({ budgetReceiptSecret: "receipt-replay-secret", agentConfig: { apiKey: undefined, baseUrl: "https://llm.example/v1", model: "test-model", timeoutMs: 1000, maxTokens: 4000 } });
    servers.push(server);
    const origin = await startServer(server);
    const first = await rawPost(origin, "/api/ai/agent", { userMessage: "地图缩小一点", taskId: "task-replay", digest: { map: { scale: 1 } }, messages: [] });
    const firstBody = JSON.parse(first.body) as { taskId: string; budgetReceipt: string };
    const continuation = { userMessage: "继续", taskId: firstBody.taskId, budgetReceipt: firstBody.budgetReceipt, digest: {}, messages: [{ role: "user", content: "继续" }] };
    const results = await Promise.all([rawPost(origin, "/api/ai/agent", continuation), rawPost(origin, "/api/ai/agent", continuation)]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 400)).toHaveLength(1);
    expect(results.find((result) => result.status === 400)?.body).toContain("AI_VALIDATION_ERROR");
  });

  it("serves live and ready probes without exposing runtime paths or secrets", async () => {
    const server = createAiServer({ budgetReceiptSecret: "probe-secret" });
    servers.push(server);
    const origin = await startServer(server);
    const live = await rawGet(origin, "/api/live");
    const ready = await rawGet(origin, "/api/ready");
    expect(live).toEqual({ status: 200, body: '{"ok":true}' });
    expect(ready.status).toBe(200);
    expect(ready.body).toContain('"state":"ready"');
    expect(ready.body).not.toContain("probe-secret");
    expect(ready.body).not.toContain("ai-runtime-state.json");
  });

  it("reports process receipt persistence without exposing the receipt secret", async () => {
    const server = createAiServer({ budgetReceiptSecret: "health-secret" });
    servers.push(server);
    const origin = await startServer(server);
    const body = await fetch(`${origin}/api/health`).then((response) => response.text());
    expect(body).toContain('"receiptPersistence":"memory"');
    expect(body).not.toContain("health-secret");
  });

  it("returns AI validation for malformed JSON on AI routes but keeps legacy routes unchanged", async () => {
    const sendInvalid = (path: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const target = new URL(originForTest!);
      const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": 1 } }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      });
      request.on("error", reject);
      request.end("{");
    });
    let originForTest: string | undefined;
    const server = createAiServer();
    servers.push(server);
    originForTest = await startServer(server);
    const ai = await sendInvalid("/api/ai/explain");
    const legacy = await sendInvalid("/api/rooms");
    expect(ai.status).toBe(400);
    expect(JSON.parse(ai.body)).toMatchObject({ error: { code: "AI_VALIDATION_ERROR" } });
    expect(legacy.status).toBe(400);
    expect(JSON.parse(legacy.body)).toMatchObject({ error: { code: "INVALID_JSON" } });
  });

  it("returns and accepts a signed budget receipt for a continued history", async () => {
    const server = createAiServer({ budgetReceiptSecret: "receipt-test-secret" });
    servers.push(server);
    const origin = await startServer(server);
    const first = await rawPost(origin, "/api/ai/agent", { userMessage: "地图缩小一点", taskId: "task-http", digest: { map: { scale: 1 } }, messages: [] });
    expect(first.status).toBe(200);
    const firstBody = JSON.parse(first.body) as { taskId: string; budgetReceipt: string };
    expect(firstBody).toMatchObject({ taskId: "task-http", budgetReceipt: expect.any(String) });
    const assistantMessage = { role: "assistant", content: null, tool_calls: [{ id: "call-http", type: "function", function: { name: "check_health", arguments: "{}" } }] };
    const continued = await rawPost(origin, "/api/ai/agent", {
      userMessage: "地图缩小一点",
      taskId: firstBody.taskId,
      budgetReceipt: firstBody.budgetReceipt,
      digest: { map: { scale: 0.85 } },
      messages: [assistantMessage, { role: "tool", tool_call_id: "call-http", content: JSON.stringify({ ok: true }) }],
    });
    expect(continued.status).toBe(200);
  });

  it("does not reset a signed budget when history is reduced to user messages", async () => {
    const server = createAiServer({ budgetReceiptSecret: "receipt-test-secret", agentConfig: { apiKey: undefined, baseUrl: "https://llm.example/v1", model: "test-model", timeoutMs: 1000, maxTokens: 4000 } });
    servers.push(server);
    const origin = await startServer(server);
    const first = await rawPost(origin, "/api/ai/agent", { userMessage: "地图缩小一点", taskId: "task-reset", digest: { map: { scale: 1 } }, messages: [], budget: { usedTokens: 999, rounds: 4 } });
    const firstBody = JSON.parse(first.body) as { taskId: string; budgetReceipt: string; budget: { usedTokens: number; rounds: number } };
    const resetAttempt = await rawPost(origin, "/api/ai/agent", { userMessage: "继续", taskId: firstBody.taskId, budgetReceipt: firstBody.budgetReceipt, digest: {}, messages: [{ role: "user", content: "继续" }], budget: { usedTokens: 0, rounds: 0 } });
    expect(resetAttempt.status).toBe(200);
    expect(JSON.parse(resetAttempt.body).budget).toEqual(expect.objectContaining({ usedTokens: firstBody.budget.usedTokens, rounds: firstBody.budget.rounds }));
  });

  it("rejects a continuation with a missing or forged budget receipt", async () => {
    const server = createAiServer({ budgetReceiptSecret: "receipt-test-secret" });
    servers.push(server);
    const origin = await startServer(server);
    const body = { userMessage: "继续", taskId: "task-1", digest: {}, messages: [{ role: "assistant", content: "上一轮" }] };
    const response = await rawPost(origin, "/api/ai/agent", body);
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "AI_VALIDATION_ERROR" } });
  });

  it("logs the fallback route when the agent succeeds on the fallback model", async () => {
    const lines: string[] = [];
    const logger = createAiLogger((line) => lines.push(line));
    const server = createAiServer({
      aiLogger: logger,
      agentConfig: {
        primary: {
          apiKey: "primary-key",
          baseUrl: "https://primary.example/v1",
          model: "primary-model",
          timeoutMs: 1000,
          maxTokens: 4000,
          retryMaxAttempts: 1,
        },
        fallback: {
          apiKey: "fallback-key",
          baseUrl: "https://fallback.example/v1",
          model: "fallback-model",
          timeoutMs: 1000,
          maxTokens: 4000,
          retryMaxAttempts: 1,
        },
        maxRounds: 20,
        tokenBudget: 60000,
        retryMaxAttempts: 1,
        retryBaseDelayMs: 0,
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    let upstreamCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      upstreamCalls += 1;
      const url = String(input);
      if (url.startsWith("https://primary.example/")) {
        return { ok: false, status: 503, headers: new Headers(), text: async () => "primary unavailable" } as Response;
      }
      expect(url).toBe("https://fallback.example/v1/chat/completions");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer fallback-key" });
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "",
        json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }),
      } as Response;
    }) as typeof fetch;
    try {
      const response = await rawPost(origin, "/api/ai/agent", { userMessage: "完成", digest: {}, messages: [] });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ kind: "finish", meta: { route: "fallback", model: "fallback-model" } });
      expect(upstreamCalls).toBe(2);
      expect(lines.map((line) => JSON.parse(line))).toContainEqual(expect.objectContaining({
        event: "ai.route.fallback",
        route: "fallback",
        model: "fallback-model",
        fallbackReason: "主模型调用失败",
      }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects JSON bodies above the configured request limit", async () => {
    const server = createAiServer({ maxJsonBodyBytes: 64 });
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(200) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE" }, requestId: expect.any(String) });
  });

  it("includes the request id on AI validation errors", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const response = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": "review-request-1" },
      body: JSON.stringify({ message: "" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ requestId: "review-request-1", error: { code: "AI_VALIDATION_ERROR" } });
  });

  it("logs a structured fallback event for legacy AI routes and preserves its request id", async () => {
    const lines: string[] = [];
    const server = createAiServer({
      aiLogger: createAiLogger((line) => lines.push(line)),
      aiConfig: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        timeoutMs: 1000,
        maxTokens: 4000,
        retryMaxAttempts: 1,
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    try {
      const response = await rawPost(origin, "/api/ai/explain", { message: "为什么这么挤", studentCount: 3 }, { "x-request-id": "legacy-fallback-1" });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as { requestId?: string; provider?: string };
      expect(body).toMatchObject({ requestId: "legacy-fallback-1", provider: "local-fallback" });
      const events = lines.map((line) => JSON.parse(line) as { event: string });
      expect(events).toContainEqual(expect.objectContaining({
        event: "ai.route.fallback",
        requestId: "legacy-fallback-1",
        route: "local",
        provider: "local-fallback",
      }));
      expect(events.findIndex((event) => event.event === "ai.request.completed")).toBeLessThan(events.length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("only enables CORS for explicitly allowed origins", async () => {
    const server = createAiServer({ corsOrigins: ["https://studio.example"] });
    servers.push(server);
    const origin = await startServer(server);

    const allowed = await fetch(`${origin}/api/health`, { headers: { Origin: "https://studio.example" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://studio.example");
    const denied = await fetch(`${origin}/api/health`, { headers: { Origin: "https://evil.example" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves the built web application and the AI API from one origin", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>蹭饭地图工作室</main>");

    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const [page, health, propose] = await Promise.all([
      fetch(`${origin}/`),
      fetch(`${origin}/api/health`),
      fetch(`${origin}/api/ai/propose-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "按城市分组",
          projectSummary: {
            studentCount: 12,
            templateId: "original",
            dataView: "province",
            cardPreset: "standard",
          },
        }),
      }),
    ]);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain("蹭饭地图工作室");
    expect(health.status).toBe(200);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      provider: "local-fallback",
    });
    expect(propose.status).toBe(200);
    const proposal = (await propose.json()) as {
      commands?: unknown[];
    };
    expect(proposal.commands?.length).toBeGreaterThan(0);
  });

  it("serves hashed static assets with long immutable caching, gzip, and security headers", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>蹭饭地图工作室</main>");
    await writeFile(join(staticDir, "index-Bf9xZGZi.js"), "console.log('large static asset');\n".repeat(20));

    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const page = await fetch(`${origin}/`);
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");

    const asset = await fetch(`${origin}/index-Bf9xZGZi.js`, {
      headers: { "Accept-Encoding": "gzip" },
    });

    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("content-encoding")).toBe("gzip");
    expect(asset.headers.get("vary")).toContain("Accept-Encoding");
    expect(asset.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(asset.text()).resolves.toContain("large static asset");
  });

  it("persists the complete workspace across server restarts", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-data-"));
    directories.push(dataDir);
    const snapshot = {
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: {
        kind: "cengfan-project-package",
        version: 2,
        exportedAt: "2026-07-27T00:00:00.000Z",
        project: { schemaVersion: 2, students: [{ id: "s1", name: "重启后仍在" }] },
        assets: [{ id: "a1", src: "data:image/png;base64,AA==" }],
        fonts: [],
        customTemplates: [],
        renderSettings: { mode: "low", fixedFps: 12 },
      },
    };

    const firstServer = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(firstServer);
    const firstOrigin = await startServer(firstServer);
    const saved = await fetch(`${firstOrigin}/api/workspace`, {
      method: "PUT",
      ...workspaceRequestInit(),
      body: JSON.stringify(snapshot),
    });
    expect(saved.status).toBe(204);
    await new Promise<void>((resolve) => firstServer.close(() => resolve()));
    servers.splice(servers.indexOf(firstServer), 1);

    const restartedServer = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(restartedServer);
    const restartedOrigin = await startServer(restartedServer);
    const restored = await fetch(`${restartedOrigin}/api/workspace`, workspaceRequestInit());

    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toEqual(snapshot);
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

  it("requires the workspace token for AI endpoints in locked-down production", async () => {
    const server = createAiServer({
      workspaceApiToken: "workspace-test-token",
      productionConfig: {
        ok: true,
        errors: [],
        config: {
          nodeEnv: "production",
          aiPublicAccess: false,
          trustProxy: false,
          dataDir: ".data",
          aiStateFile: ".data/ai-runtime-state.json",
          shutdownTimeoutMs: 10_000,
        },
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const anonymous = await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 });
    expect(anonymous.status).toBe(401);

    const authenticated = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer workspace-test-token" },
      body: JSON.stringify({ message: "为什么", studentCount: 1 }),
    });
    expect(authenticated.status).toBe(200);
  });

  it("allows anonymous AI requests when AI_PUBLIC_ACCESS is enabled in production", async () => {
    const server = createAiServer({
      workspaceApiToken: "workspace-test-token",
      productionConfig: {
        ok: true,
        errors: [],
        config: {
          nodeEnv: "production",
          aiPublicAccess: true,
          trustProxy: false,
          dataDir: ".data",
          aiStateFile: ".data/ai-runtime-state.json",
          shutdownTimeoutMs: 10_000,
        },
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 });
    expect(response.status).toBe(200);
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

  it("tears the connection down when a static read stream fails after the headers were sent", async () => {
    const monitor = captureProcessFailures();
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-error-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(staticDir, "asset.txt"), "content");
    fsHooks.createReadStream = () => {
      const stream = new Readable({ read() { /* pushed manually */ } });
      setImmediate(() => {
        stream.emit("open");
        stream.push("partial");
        setImmediate(() => stream.emit("error", Object.assign(new Error("read failed"), { code: "EIO" })));
      });
      return stream;
    };
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);
    try {
      await rawGet(origin, "/asset.txt").catch(() => undefined);
      await wait(50);
      expect(monitor.failures).toEqual([]);
      fsHooks.createReadStream = null;
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
    }
  });

  it("answers with JSON when the static file disappears before the stream opens", async () => {
    const monitor = captureProcessFailures();
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-vanish-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(staticDir, "asset.txt"), "content");
    fsHooks.createReadStream = () => {
      const stream = new Readable({ read() { /* pushed manually */ } });
      setImmediate(() => stream.emit("error", Object.assign(new Error("gone"), { code: "ENOENT" })));
      return stream;
    };
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);
    try {
      const response = await rawGet(origin, "/asset.txt");
      expect(response.status).toBe(404);
      expect(JSON.parse(response.body)).toMatchObject({ error: { code: "NOT_FOUND" } });
      expect(monitor.failures).toEqual([]);
    } finally {
      monitor.restore();
    }
  });

  it("keeps rejecting hostile static paths and ignores unsupported range requests", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-hostile-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(staticDir, "index-Bf9xZGZi.js"), "console.log('asset');\n".repeat(20));
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    expect((await rawGet(origin, "/%2e%2e/%2e%2e/etc/passwd")).status).toBe(403);
    expect((await rawGet(origin, "/..%2f..%2fetc/passwd")).status).toBe(403);
    expect((await rawGet(origin, "/%zz")).status).toBe(400);
    expect((await rawGet(origin, "/%00passwd")).status).toBe(400);

    const ranged = await rawGet(origin, "/index-Bf9xZGZi.js", { Range: "bytes=abc-def" });
    expect(ranged.status).toBe(200);
    expect(ranged.body).toContain("console.log('asset');");
  });

  it("answers preflight requests with an empty 204", async () => {
    const server = createAiServer({ corsOrigins: ["https://studio.example"] });
    servers.push(server);
    const origin = await startServer(server);
    const response = await fetch(`${origin}/api/rooms`, { method: "OPTIONS", headers: { Origin: "https://studio.example" } });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe("https://studio.example");
  });

  it("ends live SSE streams, flushes the room store, and frees the port on SIGTERM", async () => {
    const monitor = captureProcessFailures();
    const persisted: unknown[] = [];
    const flushes: string[] = [];
    const server = createAiServer({
      roomHeartbeatIntervalMs: 60_000,
      persistRooms: (snapshot) => { persisted.push(snapshot); },
      // 真实房间存储 + flush 探针：只观测关停是否落了一次快照，不改写快照语义。
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore(storeOptions);
        return { ...store, flush: async () => { flushes.push("rooms"); await store.flush(); } };
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const stream = await openEventStream(origin, created.room.id, created.access.accessToken);
    const applied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "shutdown-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "编辑中" } }),
    });
    expect(applied.status).toBe(200);
    const frames: string[] = [];
    frames.push((await stream.read()) ?? "");
    expect(frames[0]).toContain("event: snapshot");
    expect(server.roomStreamStats!().openStreams).toBe(1);

    const lifecycle = attachServerLifecycle(server, { timeoutMs: 3_000 });
    const startedAt = Date.now();
    await lifecycle.shutdown("SIGTERM");
    const elapsedMs = Date.now() - startedAt;

    try {
      for (let chunk = await stream.read(); chunk !== null; chunk = await stream.read()) frames.push(chunk);
      // 房间会随快照活过重启，所以关停只结束连接，绝不能借用 closed 帧告诉客户端房间没了。
      expect(frames.join("")).not.toContain("event: closed");
      expect(flushes).toEqual(["rooms"]);
      expect(persisted).toHaveLength(1);
      expect(server.roomStreamStats!().openStreams).toBe(0);
      // 远早于 3s 截止时间：关停靠主动排空收敛，而不是靠超时兜底。
      expect(elapsedMs).toBeLessThan(1_000);
      await expect(fetch(`${origin}/api/live`)).rejects.toThrow();
      expect(monitor.failures).toEqual([]);
    } finally {
      monitor.restore();
      await stream.close();
    }
  });

  it("bounds an in-flight request by the shutdown deadline instead of hanging the exit", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const target = new URL(origin);
    // 只发一半请求体：处理函数会一直等剩余字节，连接因此始终处于「在途」状态。
    const hung = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: "/api/rooms",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": 64 },
    });
    hung.on("error", () => undefined);
    let requestClosed = false;
    hung.on("close", () => { requestClosed = true; });
    hung.write("{\"clientId\":");
    await wait(50);

    const lifecycle = attachServerLifecycle(server, { timeoutMs: 300 });
    const startedAt = Date.now();
    await lifecycle.shutdown("SIGTERM");
    const elapsedMs = Date.now() - startedAt;

    try {
      expect(elapsedMs).toBeGreaterThanOrEqual(250);
      expect(elapsedMs).toBeLessThan(3_000);
      // 截止时间到就切断仍未收完的请求，否则一个半截请求能把进程钉在关停里。
      await wait(50);
      expect(requestClosed).toBe(true);
      await expect(fetch(`${origin}/api/live`)).rejects.toThrow();
    } finally {
      hung.destroy();
    }
  });

  it("restores a previously created room from the persisted snapshot on boot", async () => {
    let snapshot: unknown;
    const first = createAiServer({
      persistRooms: (value) => { snapshot = value; },
    });
    servers.push(first);
    const firstOrigin = await startServer(first);
    const created = await createCollaborationRoom(firstOrigin, { title: "重启前" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");
    expect(snapshot).toBeDefined();

    const restored = createAiServer({ roomSnapshot: snapshot });
    servers.push(restored);
    const restoredOrigin = await startServer(restored);
    const response = await fetch(`${restoredOrigin}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: created.room.id, snapshot: { title: "重启前" } });
  });

  it("writes the room snapshot into the data directory and reloads it on the next boot", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-"));
    directories.push(dataDir);
    const first = await createReadyAiServer({ dataDir });
    servers.push(first);
    const firstOrigin = await startServer(first);
    const created = await createCollaborationRoom(firstOrigin, { title: "落盘" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");

    const restarted = await createReadyAiServer({ dataDir });
    servers.push(restarted);
    const restartedOrigin = await startServer(restarted);
    const response = await fetch(`${restartedOrigin}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: created.room.id, snapshot: { title: "落盘" } });
  });

  it("keeps AI endpoints open without a token in development", async () => {
    const server = createAiServer({
      workspaceApiToken: "workspace-test-token",
      productionConfig: {
        ok: true,
        errors: [],
        config: {
          nodeEnv: "development",
          aiPublicAccess: false,
          trustProxy: false,
          dataDir: ".data",
          aiStateFile: ".data/ai-runtime-state.json",
          shutdownTimeoutMs: 10_000,
        },
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 });
    expect(response.status).toBe(200);
  });
});
