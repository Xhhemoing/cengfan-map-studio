// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { createAiLogger } from "./ai/ai-observability";
import { createRateLimiter } from "./ai/rate-limit";
import { createAiServer, DEFAULT_PORT, resolvePort } from "./index";

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function rawGet(origin: string, path: string): Promise<{ status: number; body: string }> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "GET" }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
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

function adminRequestInit(): RequestInit {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return {};
  const username = process.env.ADMIN_USERNAME || "admin";
  const authorization = Buffer.from(`${username}:${password}`).toString("base64");
  return { headers: { Authorization: `Basic ${authorization}` } };
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
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
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

  it("records visits with request details and exposes aggregate analytics", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-visits-"));
    directories.push(dataDir);
    const server = createAiServer({ dataDir, trustProxy: true });
    servers.push(server);
    const origin = await startServer(server);

    const page = await fetch(`${origin}/dashboard?tab=map`, {
      headers: {
        "X-Forwarded-For": "203.0.113.42",
        Referer: "https://example.com/source",
        "User-Agent": "Test Browser",
      },
    });
    expect(page.status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const analytics = await fetch(`${origin}/api/admin/visits`, adminRequestInit());
    expect(analytics.status).toBe(200);
    const body = await analytics.json() as { total: number; uniqueIps: number; visits: Array<Record<string, unknown>> };
    expect(body.total).toBe(1);
    expect(body.uniqueIps).toBe(1);
    expect(body.visits[0]).toMatchObject({ ip: "203.0.113.42", method: "GET", path: "/dashboard", status: 404, referer: "https://example.com/source", userAgent: "Test Browser" });
  });

  it("ignores spoofed forwarded IP headers unless the proxy is trusted", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-visits-untrusted-"));
    directories.push(dataDir);
    const server = createAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);

    await fetch(`${origin}/dashboard`, { headers: { "X-Forwarded-For": "203.0.113.42" } });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const analytics = await fetch(`${origin}/api/admin/visits`, adminRequestInit());
    const body = await analytics.json() as { visits: Array<{ ip: string }> };
    expect(body.visits[0]?.ip).not.toBe("203.0.113.42");
  });

  it("reads legacy visit records without losing their history", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-legacy-visits-"));
    directories.push(dataDir);
    await writeFile(join(dataDir, "visits.json"), JSON.stringify([{ id: "old", occurredAt: "2026-01-01T00:00:00.000Z", path: "/" }]));
    const server = createAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);
    const analytics = await fetch(`${origin}/api/admin/visits`, adminRequestInit());
    await expect(analytics.json()).resolves.toMatchObject({ total: 1, uniqueIps: 1 });
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
