// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAiBackend,
  extractJsonObject,
  PROVIDER_NAME,
  type AiConfig,
} from "./llm-client";

const TEST_CONFIG: AiConfig = {
  apiKey: "test-key",
  baseUrl: "https://llm.example/v1",
  model: "claude-sonnet-5",
  timeoutMs: 5_000,
  maxTokens: 2000,
};

function mockChatCompletion(content: string, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => "mock body",
    json: async () => ({
      choices: [{ message: { role: "assistant", content } }],
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("extractJsonObject", () => {
  it("extracts a plain JSON object", () => {
    expect(extractJsonObject('{"ok":true,"value":1}')).toEqual({ ok: true, value: 1 });
  });

  it("extracts JSON wrapped in markdown fences", () => {
    expect(extractJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("extracts JSON embedded in prose", () => {
    const content = '好的，这是结果：{"mode":"explain","explanation":"回答"} 希望对你有帮助。';
    expect(extractJsonObject(content)).toEqual({ mode: "explain", explanation: "回答" });
  });

  it("throws when no JSON object is present", () => {
    expect(() => extractJsonObject("抱歉，我无法生成 JSON。")).toThrow();
  });

  it("throws on incomplete JSON", () => {
    expect(() => extractJsonObject('{"ok":true')).toThrow();
  });
});

describe("resolveAiConfig", () => {
  it("clamps non-finite timeout and token configuration", async () => {
    const { resolveAiConfig } = await import("./llm-client");
    expect(resolveAiConfig({ AI_TIMEOUT_MS: "NaN", AI_MAX_TOKENS: "Infinity" })).toMatchObject({ timeoutMs: 60000, maxTokens: 4000 });
  });
});

describe("createAiBackend without API key", () => {
  it("falls back to local rules without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const backend = createAiBackend({ ...TEST_CONFIG, apiKey: undefined });

    expect(backend.isConfigured).toBe(false);
    expect(backend.provider).toBe("local-fallback");

    const proposal = await backend.proposeEdits({
      message: "按城市分组",
      projectSummary: { studentCount: 12, templateId: "original", dataView: "province", cardPreset: "standard" },
    });
    expect(proposal.provider).toBe("local-fallback");
    expect(proposal.commands.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createAiBackend with LLM", () => {
  it("uses the LLM result for parse-data and reports the tokenfree provider", async () => {
    mockChatCompletion(
      JSON.stringify({
        candidates: [
          { lineIndex: 1, name: "林舟", university: "北京大学", city: "北京市" },
        ],
        unparsed: [{ lineIndex: 2, reason: "缺少院校信息" }],
      }),
    );
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.parseData({
      text: "林舟 北京大学 北京市\n只有名字",
      source: "paste",
    });

    expect(result.provider).toBe(PROVIDER_NAME);
    expect(result.candidates).toEqual([
      { name: "林舟", university: "北京大学", city: "北京市", sourceLine: 1, rawLine: "林舟 北京大学 北京市" },
    ]);
    expect(result.unparsed).toEqual([{ sourceLine: 2, rawLine: "只有名字", reason: "缺少院校信息" }]);
  });

  it("validates LLM commands and drops invalid ones", async () => {
    mockChatCompletion(
      JSON.stringify({
        mode: "proposal",
        explanation: "已生成建议",
        commands: [
          {
            id: "cmd-city-a1b2c3",
            type: "setDataView",
            label: "切换为城市分组",
            risk: "medium",
            before: "province",
            after: "city",
            reason: "用户要求",
          },
          { type: "setDataView", after: "city" },
        ],
      }),
    );
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.proposeEdits({
      message: "按城市分组",
      projectSummary: { studentCount: 12, templateId: "original", dataView: "province", cardPreset: "standard" },
    });

    expect(result.provider).toBe(PROVIDER_NAME);
    expect(result.mode).toBe("proposal");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]?.type).toBe("setDataView");
  });

  it("falls back to local rules when the LLM output is unusable", async () => {
    mockChatCompletion("抱歉，我没法完成这个任务。");
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.proposeEdits({
      message: "改成紧凑卡片",
      projectSummary: { studentCount: 12, templateId: "original", dataView: "province", cardPreset: "standard" },
    });

    expect(result.provider).toBe("local-fallback");
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("falls back to local rules when the API returns an error", async () => {
    mockChatCompletion("", 429);
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.explain("为什么这么挤", 30);

    expect(result.provider).toBe("local-fallback");
    expect(result.mode).toBe("explain");
    expect(result.explanation).toContain("30");
  });

  it("uses the LLM explanation when the API succeeds", async () => {
    mockChatCompletion(JSON.stringify({ explanation: "因为人数多，建议使用紧凑卡片。" }));
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.explain("为什么这么挤", 30);

    expect(result.provider).toBe(PROVIDER_NAME);
    expect(result.explanation).toBe("因为人数多，建议使用紧凑卡片。");
    expect(result.commands).toEqual([]);
  });

  it("propagates cancellation instead of returning a local single-turn fallback", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }));
    const backend = createAiBackend(TEST_CONFIG);
    await expect(backend.explain("为什么这么挤", 30, { signal: controller.signal })).rejects.toMatchObject({ code: "AI_ABORTED" });
  });
});
