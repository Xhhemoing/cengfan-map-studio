// @vitest-environment node
import { EventEmitter } from "node:events";
import type http from "node:http";
import { describe, expect, it } from "vitest";
import { createAgentLoopBackend, type AgentLoopBackend, type AgentRuntimeConfig } from "./ai/agent-routing";
import { createAiLogger } from "./ai/ai-observability";
import { budgetReceiptDigest, createBudgetReceiptLedger, createBudgetReceiptSigner } from "./ai/budget-receipt";
import { createAiBackend, type AiBackend } from "./ai/llm-client";
import { createAiRoutes, type AiRoutesDeps } from "./ai-routes";

/**
 * 这些用例盯的是接缝本身，而不是 AI 语义：AI 语义的端到端 pin 仍然在
 * server/index.test.ts 里走同一套 HTTP。这里只回答「index.ts 把什么交给了
 * ai-routes.ts，ai-routes.ts 又把什么交还回去」——deps struct 少一项、
 * 未命中时忘了交回控制权、请求体上限漏算、abort/上游失败的状态码分叉，
 * 都会在这里先响。
 */

type SentResponse = { status: number; body: unknown };
/** 服务端只用到 once/removeListener/writableEnded/destroyed 这几处。 */
type FakeResponse = http.ServerResponse & { writableEnded: boolean; destroyed: boolean };

const fakeRequest = (method: string) =>
  Object.assign(new EventEmitter(), { method }) as unknown as http.IncomingMessage;

const fakeResponse = () =>
  Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false }) as unknown as FakeResponse;

const AGENT_RUNTIME: AgentRuntimeConfig = {
  primary: undefined, fallback: undefined, maxRounds: 20, tokenBudget: 60_000, retryMaxAttempts: 2, retryBaseDelayMs: 0,
};

/** parseAgentRequest 能通过的最小请求体。 */
const agentBody = (extra: Record<string, unknown> = {}) => ({
  userMessage: "把地图放大一点",
  digest: {},
  messages: [],
  ...extra,
});

/** 只实现被测那条路由的 AI 后端；其余两条调到就是用例写错了。 */
const stubAi = (overrides: Partial<AiBackend>): AiBackend => {
  const unused = () => Promise.reject(new Error("本用例不该调到这条路由"));
  return { provider: "stub", isConfigured: true, parseData: unused, proposeEdits: unused, explain: unused, ...overrides };
};

const stubAgent = (runTurn: AgentLoopBackend["runTurn"]): AgentLoopBackend => ({ provider: "stub", isConfigured: true, runTurn });

const explainResult = { provider: "stub", mode: "explain" as const, explanation: "ok", commands: [] };

function createHarness(overrides: Partial<AiRoutesDeps> = {}) {
  const sent: SentResponse[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const readJsonCaps: number[] = [];
  const signer = createBudgetReceiptSigner("seam-test-secret");

  const routes = createAiRoutes({
    ai: createAiBackend({ apiKey: "", baseUrl: "https://example.invalid/v1", model: "m", timeoutMs: 1000, maxTokens: 100 }),
    agent: createAgentLoopBackend(AGENT_RUNTIME),
    agentRuntime: AGENT_RUNTIME,
    budgetReceipts: signer,
    budgetReceiptLedger: createBudgetReceiptLedger(signer),
    aiLogger: createAiLogger((line) => { logs.push(JSON.parse(line) as Record<string, unknown>); }),
    readJson: (_request, maxBytes) => { readJsonCaps.push(maxBytes); return Promise.resolve(pendingBody); },
    maxJsonBodyBytes: 8 * 1024 * 1024,
    isRecord: (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value),
    ...overrides,
  });

  let pendingBody: unknown = {};
  const request = fakeRequest("POST");
  const response = fakeResponse();

  return {
    sent, logs, readJsonCaps, request, response,
    handle: (method: string, pathname: string, body: unknown = {}): Promise<boolean> => {
      pendingBody = body;
      (request as { method?: string }).method = method;
      return routes.handle({
        request, response, pathname, requestId: "req-seam-1",
        sendAi: (status, sentBody) => { sent.push({ status, body: sentBody }); },
      });
    },
  };
}

describe("createAiRoutes routing seam", () => {
  it("claims every AI route it owns", async () => {
    const harness = createHarness();
    const owned = ["/api/ai/agent", "/api/ai/parse-data", "/api/ai/propose-edits", "/api/ai/explain"];

    for (const pathname of owned) {
      expect(await harness.handle("POST", pathname), pathname).toBe(true);
    }
    expect(harness.sent).toHaveLength(owned.length);
  });

  it("hands unknown AI paths back to index.ts so they still 404", async () => {
    // 限流与生产 token 门禁在 index.ts 里对整个 /api/ai/ 前缀生效，包括这些未命中的
    // 路径。handle 一旦把它们吞掉，未知 AI 路径就会静默变成 200/500 而不是 404。
    const harness = createHarness();

    expect(await harness.handle("POST", "/api/ai/unknown")).toBe(false);
    expect(await harness.handle("POST", "/api/ai/")).toBe(false);
    expect(harness.sent).toEqual([]);
    expect(harness.readJsonCaps).toEqual([]);
  });

  it("hands wrong-method and non-AI requests back to index.ts", async () => {
    const harness = createHarness();

    expect(await harness.handle("GET", "/api/ai/agent")).toBe(false);
    expect(await harness.handle("PUT", "/api/ai/explain")).toBe(false);
    expect(await harness.handle("GET", "/api/health")).toBe(false);
    expect(await harness.handle("POST", "/api/rooms")).toBe(false);
    expect(harness.sent).toEqual([]);
  });

  it("never touches SSE or room paths", async () => {
    const harness = createHarness();

    expect(await harness.handle("GET", "/api/rooms/ABC123/events")).toBe(false);
    expect(await harness.handle("POST", "/api/rooms/ABC123/events-ticket")).toBe(false);
    expect(harness.sent).toEqual([]);
  });
});

describe("createAiRoutes dependency wiring", () => {
  it("caps every AI body at min(maxJsonBodyBytes, 512 KiB)", async () => {
    const generous = createHarness({ maxJsonBodyBytes: 8 * 1024 * 1024 });
    for (const pathname of ["/api/ai/agent", "/api/ai/parse-data", "/api/ai/propose-edits", "/api/ai/explain"]) {
      await generous.handle("POST", pathname);
    }
    expect(generous.readJsonCaps).toEqual([512 * 1024, 512 * 1024, 512 * 1024, 512 * 1024]);

    const tight = createHarness({ maxJsonBodyBytes: 1024 });
    await tight.handle("POST", "/api/ai/explain");
    expect(tight.readJsonCaps).toEqual([1024]);
  });

  it("lets read-body failures escape to the shared 413/400 handler", async () => {
    // 搬迁前的行为：readJson 的体积/JSON 错误一路抛到 createAiServer 的统一 catch，
    // 由它按 aiPath 归一成 413/400。ai-routes.ts 不得就地吞掉。
    const harness = createHarness({ readJson: () => Promise.reject(new Error("请求体过大")) });

    await expect(harness.handle("POST", "/api/ai/agent")).rejects.toThrow("请求体过大");
    expect(harness.sent).toEqual([]);
  });

  it("answers only through the injected sendAi", async () => {
    const harness = createHarness();
    await harness.handle("POST", "/api/ai/explain", { message: "" });

    expect(harness.sent).toEqual([{
      status: 400,
      body: { error: { code: "AI_VALIDATION_ERROR", message: "message 不能为空" } },
    }]);
  });

  it("routes agent budget limits through the injected agentRuntime", async () => {
    const calls: Array<{ maxTokens: number; maxRounds: number }> = [];
    const harness = createHarness({
      agentRuntime: { ...AGENT_RUNTIME, tokenBudget: 1234, maxRounds: 3 },
      agent: stubAgent((loopRequest) => {
        calls.push({ maxTokens: loopRequest.budget!.maxTokens, maxRounds: loopRequest.budget!.maxRounds });
        return Promise.resolve({ kind: "finish", summary: "done" });
      }),
    });

    await harness.handle("POST", "/api/ai/agent", agentBody());

    expect(calls).toEqual([{ maxTokens: 1234, maxRounds: 3 }]);
    expect(harness.sent[0]!.status).toBe(200);
  });

  it("logs every AI event against the injected requestId", async () => {
    const harness = createHarness();
    await harness.handle("POST", "/api/ai/explain", { message: "解释一下" });

    expect(harness.sent[0]!.status).toBe(200);
    expect(harness.logs.map((entry) => entry.event)).toEqual([
      "ai.request.started",
      "ai.route.fallback",
      "ai.request.completed",
    ]);
    expect(new Set(harness.logs.map((entry) => entry.requestId))).toEqual(new Set(["req-seam-1"]));
  });
});

describe("createAiRoutes validation shapes", () => {
  it("rejects a malformed agent request with the aiCode-carrying 400", async () => {
    const harness = createHarness();
    await harness.handle("POST", "/api/ai/agent", { userMessage: "" });

    expect(harness.sent).toEqual([{
      status: 400,
      body: {
        error: {
          code: "AI_VALIDATION_ERROR",
          message: "userMessage、digest 和 messages 格式无效",
          aiCode: "AI_VALIDATION_ERROR",
        },
      },
    }]);
  });

  it("rejects an unreplayable agent history before spending a claim", async () => {
    // 带 assistant/tool 历史却没有回执 → 400，且不落任何账本条目。
    const signer = createBudgetReceiptSigner("seam-test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const harness = createHarness({ budgetReceipts: signer, budgetReceiptLedger: ledger });

    await harness.handle("POST", "/api/ai/agent", agentBody({
      messages: [{ role: "assistant", content: "上一轮" }],
    }));

    expect(harness.sent).toEqual([{
      status: 400,
      body: { error: { code: "AI_VALIDATION_ERROR", message: "会话预算回执无效、已过期或已被使用" } },
    }]);
    expect(ledger.size).toBe(0);
  });

  it("rejects parse-data and propose-edits with the schema message at 400", async () => {
    const harness = createHarness();

    await harness.handle("POST", "/api/ai/parse-data", { text: "", source: "paste" });
    await harness.handle("POST", "/api/ai/propose-edits", { message: "改一下" });

    expect(harness.sent).toEqual([
      { status: 400, body: { error: { code: "AI_VALIDATION_ERROR", message: "text 不能为空" } } },
      { status: 400, body: { error: { code: "AI_VALIDATION_ERROR", message: "projectSummary 不能为空" } } },
    ]);
  });
});

describe("createAiRoutes upstream failure mapping", () => {
  const failing = (code?: string): AiBackend => {
    const boom = () => Promise.reject(Object.assign(new Error("upstream down"), code ? { code } : {}));
    return { provider: "stub", isConfigured: true, parseData: boom, proposeEdits: boom, explain: boom };
  };

  it("maps AI_ABORTED to 499 and everything else to 502", async () => {
    const aborted = createHarness({ ai: failing("AI_ABORTED") });
    await aborted.handle("POST", "/api/ai/explain", { message: "解释" });
    expect(aborted.sent).toEqual([{
      status: 499,
      body: { error: { code: "AI_ABORTED", message: "AI 调用已取消" } },
    }]);

    const down = createHarness({ ai: failing("AI_TIMEOUT") });
    await down.handle("POST", "/api/ai/parse-data", { text: "张三", source: "paste" });
    expect(down.sent).toEqual([{
      status: 502,
      body: { error: { code: "AI_TIMEOUT", message: "AI 服务暂时不可用" } },
    }]);
  });

  it("falls back to AI_UPSTREAM_UNAVAILABLE when the error carries no code", async () => {
    const harness = createHarness({ ai: failing() });
    await harness.handle("POST", "/api/ai/propose-edits", {
      message: "改一下",
      projectSummary: { studentCount: 1 },
    });

    expect(harness.sent).toEqual([{
      status: 502,
      body: { error: { code: "AI_UPSTREAM_UNAVAILABLE", message: "AI 服务暂时不可用" } },
    }]);
  });

  it("stays silent when the socket is already destroyed", async () => {
    // 对端已经走了就不该再往一个死连接上写；日志仍要记下这次失败。
    const harness = createHarness({ ai: failing("AI_ABORTED") });
    harness.response.destroyed = true;

    await harness.handle("POST", "/api/ai/explain", { message: "解释" });

    expect(harness.sent).toEqual([]);
    expect(harness.logs.map((entry) => entry.event)).toEqual(["ai.request.started", "ai.agent.cancelled"]);
  });

  it("maps an agent-loop rejection the same way and rolls the claim back", async () => {
    const signer = createBudgetReceiptSigner("seam-test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const harness = createHarness({
      budgetReceipts: signer,
      budgetReceiptLedger: ledger,
      agent: stubAgent(() => Promise.reject(Object.assign(new Error("boom"), { code: "AI_UPSTREAM_REJECTED" }))),
    });

    await harness.handle("POST", "/api/ai/agent", agentBody());

    expect(harness.sent).toEqual([{
      status: 502,
      body: { error: { code: "AI_UPSTREAM_REJECTED", message: "AI 服务暂时不可用" } },
    }]);
    expect(ledger.size).toBe(0);
  });
});

describe("createAiRoutes abort wiring", () => {
  it("aborts the upstream call when the request aborts, and unhooks both listeners", async () => {
    let observed: AbortSignal | undefined;
    const harness = createHarness({
      ai: stubAi({
        explain: (_message, _count, context) => {
          observed = context?.signal;
          harness.request.emit("aborted");
          return Promise.resolve(explainResult);
        },
      }),
    });

    await harness.handle("POST", "/api/ai/explain", { message: "解释" });

    expect(observed?.aborted).toBe(true);
    // finally 里的 removeListener 必须跑掉，否则长连接上会堆出监听器泄漏。
    expect(harness.request.listenerCount("aborted")).toBe(0);
    expect(harness.response.listenerCount("close")).toBe(0);
  });

  it("does not abort on response close once the response has ended", async () => {
    let observed: AbortSignal | undefined;
    const harness = createHarness({
      ai: stubAi({
        explain: (_message, _count, context) => {
          observed = context?.signal;
          harness.response.writableEnded = true;
          harness.response.emit("close");
          return Promise.resolve(explainResult);
        },
      }),
    });

    await harness.handle("POST", "/api/ai/explain", { message: "解释" });

    expect(observed?.aborted).toBe(false);
  });
});

describe("createAiRoutes budget receipt handover", () => {
  it("issues a verifiable receipt and only commits it once the response finishes", async () => {
    const signer = createBudgetReceiptSigner("seam-test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const harness = createHarness({
      budgetReceipts: signer,
      budgetReceiptLedger: ledger,
      agent: stubAgent(() => Promise.resolve({ kind: "finish", summary: "done", budget: { usedTokens: 12, maxTokens: 60_000, rounds: 1, maxRounds: 20 } })),
    });

    await harness.handle("POST", "/api/ai/agent", agentBody({ taskId: "task-seam" }));

    const body = harness.sent[0]!.body as { taskId: string; budgetReceipt: string; budget: unknown; provider: string };
    expect(harness.sent[0]!.status).toBe(200);
    expect(body.taskId).toBe("task-seam");
    expect(body.provider).toBe("stub");
    expect(body.budget).toEqual({ usedTokens: 12, maxTokens: 60_000, rounds: 1, maxRounds: 20 });
    expect(signer.verify(body.budgetReceipt, "task-seam")).toMatchObject({ usedTokens: 12, rounds: 1, sequence: 1 });

    // 提交挂在 response 的 finish 上。reserveInitial 一开始就占了位，所以「还没提交」
    // 看的不是 hasTask，而是账本里仍是那个空占位（sequence 0、无回执摘要）。
    expect(ledger.snapshot()).toMatchObject([{ taskId: "task-seam", sequence: 0, receiptDigest: "" }]);
    harness.response.emit("finish");
    expect(ledger.snapshot()).toMatchObject([{
      taskId: "task-seam",
      sequence: 1,
      receiptDigest: budgetReceiptDigest(body.budgetReceipt),
      usedTokens: 12,
      rounds: 1,
    }]);
  });

  it("rolls the claim back when the socket closes before finish", async () => {
    const signer = createBudgetReceiptSigner("seam-test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const harness = createHarness({
      budgetReceipts: signer,
      budgetReceiptLedger: ledger,
      agent: stubAgent(() => Promise.resolve({ kind: "finish", summary: "done" })),
    });

    await harness.handle("POST", "/api/ai/agent", agentBody({ taskId: "task-dropped" }));
    harness.response.emit("close");

    expect(ledger.hasTask("task-dropped")).toBe(false);
    expect(ledger.size).toBe(0);
  });

  it("mints a task id when the client sends none", async () => {
    const harness = createHarness({
      agent: stubAgent(() => Promise.resolve({ kind: "finish", summary: "done" })),
    });

    await harness.handle("POST", "/api/ai/agent", agentBody());

    const body = harness.sent[0]!.body as { taskId: string };
    expect(body.taskId).toMatch(/^task-[0-9a-z]+-[0-9a-z]{10}$/);
  });
});
