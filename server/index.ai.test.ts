// @vitest-environment node
// AI 路由在统一服务器上的校验、限流、预算回执与降级日志。
import { describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import { createAiLogger } from "./ai/ai-observability";
import { createRateLimiter } from "./ai/rate-limit";
import { createAiServer } from "./index";
import { rawPost, startServer, installServerFixture } from "./index-test-fixtures";

const { servers } = installServerFixture();

describe("unified application server — AI routes", () => {
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
});
