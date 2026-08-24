import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentLoopBackend } from "./agent-routing";
import { normalizeAgentRuntimeConfig, resolveAgentConfig, resolveAgentRuntimeConfig } from "./agent-routing";

describe("resolveAgentConfig", () => {
  it("defaults to deepseek-v4-flash at the official endpoint", () => {
    const config = resolveAgentConfig({ AI_API_KEY: "key" });
    expect(config.model).toBe("deepseek-v4-flash");
    expect(config.baseUrl).toBe("https://api.deepseek.com");
    expect(config.maxTokens).toBeGreaterThanOrEqual(4_000);
  });

  it("treats the old sonnet default as legacy and selects deepseek", () => {
    const config = resolveAgentConfig({ AI_API_KEY: "key", AI_MODEL: "claude-sonnet-5" });
    expect(config.model).toBe("deepseek-v4-flash");
  });

  it("uses gpt-5.6-luna when explicitly selected", () => {
    const config = resolveAgentConfig({
      AI_API_KEY: "key",
      AI_BASE_URL: "https://tokenfreevip.cc.cd/v1",
      AI_MODEL: "gpt-5.6-luna",
    });
    expect(config.model).toBe("gpt-5.6-luna");
    expect(config.baseUrl).toBe("https://tokenfreevip.cc.cd/v1");
  });

  it("reads a separate fallback credential when configured", () => {
    const config = resolveAgentConfig({ AI_API_KEY: "primary", AI_FALLBACK_API_KEY: "fallback" });
    expect(config.fallbackApiKey).toBe("fallback");
  });

  it("uses primary overrides and the configured fallback model", () => {
    const config = resolveAgentRuntimeConfig({
      AI_API_KEY: "legacy",
      AI_MODEL: "legacy-model",
      AI_BASE_URL: "https://legacy.example/v1",
      AI_PRIMARY_API_KEY: "primary",
      AI_PRIMARY_MODEL: "primary-model",
      AI_PRIMARY_BASE_URL: "https://primary.example/v1",
      AI_FALLBACK_API_KEY: "fallback",
      AI_FALLBACK_MODEL: "fallback-model",
      AI_FALLBACK_BASE_URL: "https://fallback.example/v1",
    });
    expect(config.primary).toMatchObject({ apiKey: "primary", model: "primary-model", baseUrl: "https://primary.example/v1" });
    expect(config.fallback).toMatchObject({ apiKey: "fallback", model: "fallback-model", baseUrl: "https://fallback.example/v1" });
  });

  it("clamps NaN and infinite runtime values including retry delay", () => {
    const config = resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_AGENT_MAX_ROUNDS: "NaN", AI_AGENT_TOKEN_BUDGET: "Infinity", AI_RETRY_MAX_ATTEMPTS: "NaN", AI_RETRY_BASE_DELAY_MS: "Infinity" });
    expect(config.maxRounds).toBe(20);
    expect(config.tokenBudget).toBe(60000);
    expect(config.retryMaxAttempts).toBe(2);
    expect(config.retryBaseDelayMs).toBe(250);
    expect(resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_RETRY_BASE_DELAY_MS: "99999" }).retryBaseDelayMs).toBe(2000);
  });

  it("clamps invalid limits and disables an identical fallback", () => {
    const config = resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_AGENT_MAX_ROUNDS: "99", AI_RETRY_MAX_ATTEMPTS: "0", AI_AGENT_TOKEN_BUDGET: "-2", AI_FALLBACK_API_KEY: "key", AI_FALLBACK_MODEL: "deepseek-v4-flash", AI_FALLBACK_BASE_URL: "https://api.deepseek.com" });
    expect(config.maxRounds).toBe(20);
    expect(config.retryMaxAttempts).toBe(1);
    expect(config.tokenBudget).toBe(60000);
    expect(config.fallback).toBeUndefined();

    expect(resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_AGENT_TOKEN_BUDGET: "999999" }).tokenBudget).toBe(60000);
  });

  it("adds route and provider metadata to early budget and brake finishes", async () => {
    const runtime = resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_AGENT_MAX_ROUNDS: "2" });
    const backend = createAgentLoopBackend(runtime);
    const budget = await backend.runTurn({ userMessage: "x", digest: {}, messages: [], budget: { usedTokens: 60000, maxTokens: 60000, rounds: 0, maxRounds: 2 } });
    expect(budget).toMatchObject({ kind: "finish", meta: { route: "local", provider: "local-fallback" } });
    const readOnly = await backend.runTurn({ userMessage: "x", digest: {}, messages: [
      { role: "assistant", content: null, tool_calls: [{ id: "r1", type: "function", function: { name: "inspect_project", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "r1", content: "{}" },
      { role: "assistant", content: null, tool_calls: [{ id: "r2", type: "function", function: { name: "inspect_project", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "r2", content: "{}" },
      { role: "assistant", content: null, tool_calls: [{ id: "r3", type: "function", function: { name: "inspect_project", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "r3", content: "{}" },
    ] });
    expect(readOnly).toMatchObject({ kind: "finish", meta: { route: "primary", provider: "api.deepseek.com", model: "deepseek-v4-flash" } });
  });

  it("normalizes directly injected provider NaN and infinite values", () => {
    const runtime = normalizeAgentRuntimeConfig({
      primary: { apiKey: "key", baseUrl: "https://llm.example/v1", model: "model", timeoutMs: Number.NaN, maxTokens: Number.POSITIVE_INFINITY },
      fallback: { apiKey: "fallback", baseUrl: "https://fallback.example/v1", model: "fallback", timeoutMs: Number.POSITIVE_INFINITY, maxTokens: Number.NaN },
      maxRounds: Number.NaN,
      tokenBudget: Number.POSITIVE_INFINITY,
      retryMaxAttempts: Number.NaN,
      retryBaseDelayMs: Number.POSITIVE_INFINITY,
    });
    expect(runtime.primary).toMatchObject({ timeoutMs: 60000, maxTokens: 4000 });
    expect(runtime.fallback).toMatchObject({ timeoutMs: 60000, maxTokens: 4000 });
    expect(runtime.retryBaseDelayMs).toBe(250);
  });

  it("enforces runtime budgets over a client budget", async () => {
    const runtime = resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_AGENT_MAX_ROUNDS: "2", AI_AGENT_TOKEN_BUDGET: "1200" });
    const backend = createAgentLoopBackend(runtime);
    const outcome = await backend.runTurn({ userMessage: "x", digest: {}, messages: [], budget: { usedTokens: 1200, maxTokens: 60000, rounds: 0, maxRounds: 20 } });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("预算");
  });

  it("does not fallback or use local rules after an external abort", async () => {
    const controller = new AbortController();
    const primary = resolveAgentRuntimeConfig({ AI_API_KEY: "primary", AI_FALLBACK_API_KEY: "fallback", AI_PRIMARY_BASE_URL: "https://primary.example/v1", AI_FALLBACK_BASE_URL: "https://fallback.example/v1" });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }));
    const backend = createAgentLoopBackend(primary);
    await expect(backend.runTurn({ userMessage: "地图缩小", digest: { map: { scale: 1 } }, messages: [], signal: controller.signal })).rejects.toMatchObject({ code: "AI_ABORTED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not fallback locally when an already-aborted request has no remote config", async () => {
    const controller = new AbortController();
    controller.abort();
    const backend = createAgentLoopBackend(resolveAgentRuntimeConfig({}));
    await expect(backend.runTurn({ userMessage: "地图缩小", digest: { map: { scale: 1 } }, messages: [], signal: controller.signal })).rejects.toMatchObject({ code: "AI_ABORTED" });
  });

  it("carries lastPromptTokens into the turn so a resumed task is charged only for new tokens", async () => {
    const runtime = resolveAgentRuntimeConfig({ AI_API_KEY: "key" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "完成" } }],
      usage: { prompt_tokens: 4_500, completion_tokens: 100, total_tokens: 4_600 },
    }), { status: 200 })));
    const backend = createAgentLoopBackend(runtime);
    const outcome = await backend.runTurn({
      userMessage: "继续",
      digest: {},
      messages: [],
      budget: { usedTokens: 5_000, maxTokens: 60_000, rounds: 1, maxRounds: 20, lastPromptTokens: 4_000 },
    });
    expect(outcome).toMatchObject({ kind: "finish", budget: { usedTokens: 5_600, lastPromptTokens: 4_500 } });
  });

  it("answers a high-confidence read-only stat question locally without calling the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const backend = createAgentLoopBackend(resolveAgentRuntimeConfig({ AI_API_KEY: "key" }));
    const outcome = await backend.runTurn({
      userMessage: "广东有几人",
      digest: { students: { total: 5, hidden: 0, duplicateGroups: 0, duplicateStudentCount: 0, topProvinces: [{ province: "广东省", count: 3 }] } },
      messages: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "finish", meta: { route: "local", provider: "local-fallback", fallbackReason: "preroute:province-count" } });
    if (outcome.kind === "finish") expect(outcome.summary).toContain("3 名同学");
  });

  it("sends a write request such as 把城市字号调大 to the model instead of prerouting it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "已调整" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const backend = createAgentLoopBackend(resolveAgentRuntimeConfig({ AI_API_KEY: "key" }));
    const outcome = await backend.runTurn({
      userMessage: "把城市字号调大",
      digest: { students: { total: 5, hidden: 0, duplicateGroups: 0, duplicateStudentCount: 0, topProvinces: [] } },
      messages: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ kind: "finish", meta: { route: "primary" } });
  });

  it("never emits tool calls from the preroute so a misread can only be a wrong number", async () => {
    const backend = createAgentLoopBackend(resolveAgentRuntimeConfig({}));
    const digest = { students: { total: 4, hidden: 1, duplicateGroups: 2, duplicateStudentCount: 4, topProvinces: [{ province: "浙江省", count: 3 }] } };
    for (const userMessage of ["多少人", "有没有重复", "哪个省最多", "隐藏了多少人"]) {
      const outcome = await backend.runTurn({ userMessage, digest, messages: [] });
      expect(outcome.kind).toBe("finish");
      expect(outcome).not.toHaveProperty("calls");
    }
  });

  it("leaves the budget untouched when the preroute answers", async () => {
    const backend = createAgentLoopBackend(resolveAgentRuntimeConfig({ AI_API_KEY: "key" }));
    const outcome = await backend.runTurn({
      userMessage: "有没有重复",
      digest: { students: { total: 9, hidden: 0, duplicateGroups: 0, duplicateStudentCount: 0, topProvinces: [] } },
      messages: [],
      budget: { usedTokens: 1_200, maxTokens: 60_000, rounds: 2, maxRounds: 20 },
    });
    expect(outcome).toMatchObject({ kind: "finish", budget: { usedTokens: 1_200, rounds: 2 } });
  });

  it("does not start a remote turn when the runtime budget cannot cover one agent call", async () => {
    const runtime = resolveAgentRuntimeConfig({ AI_API_KEY: "key", AI_AGENT_TOKEN_BUDGET: "3000" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const backend = createAgentLoopBackend(runtime);
    const outcome = await backend.runTurn({ userMessage: "x", digest: {}, messages: [], budget: { usedTokens: 0, maxTokens: 60000, rounds: 0, maxRounds: 20 } });
    expect(outcome.kind).toBe("finish");
    expect(fetchMock).not.toHaveBeenCalled();
    if (outcome.kind === "finish") expect(outcome.summary).toContain("预算");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
