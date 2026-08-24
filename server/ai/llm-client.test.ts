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
  const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => ({
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
    const content = '好的，这是结果：{"candidates":[],"unparsed":[]} 希望对你有帮助。';
    expect(extractJsonObject(content)).toEqual({ candidates: [], unparsed: [] });
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

    const result = await backend.parseData({ text: "林舟 北京大学 北京市\n只有名字", source: "paste" });
    expect(result.provider).toBe("local-fallback");
    expect(result.candidates).toHaveLength(1);
    expect(result.unparsed).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createAiBackend with LLM", () => {
  it("uses the LLM result for parse-data and only sends the locally unparsed lines", async () => {
    const fetchMock = mockChatCompletion(
      JSON.stringify({
        candidates: [{ lineIndex: 1, name: "周晴", university: "哈佛大学", city: "波士顿" }],
        unparsed: [],
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
      { name: "周晴", university: "哈佛大学", city: "波士顿", sourceLine: 2, rawLine: "只有名字" },
    ]);
    expect(result.unparsed).toEqual([]);

    const prompt = JSON.stringify(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)));
    expect(prompt).toContain("只有名字");
    expect(prompt).not.toContain("北京大学");
  });

  it("keeps a locally unresolved line unparsed when the LLM also fails on it", async () => {
    mockChatCompletion(JSON.stringify({ candidates: [], unparsed: [{ lineIndex: 1, reason: "缺少院校信息" }] }));
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.parseData({ text: "林舟 北京大学 北京市\n只有名字", source: "paste" });

    expect(result.unparsed).toEqual([{ sourceLine: 2, rawLine: "只有名字", reason: "缺少院校信息" }]);
    expect(result.candidates).toHaveLength(1);
  });

  it("skips the network entirely when local rules parse every line", async () => {
    const fetchMock = mockChatCompletion("{}");
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.parseData({ text: "林舟 北京大学 北京市\n周晴 浙江大学 杭州市", source: "paste" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.candidates).toHaveLength(2);
    expect(result.unparsed).toEqual([]);
  });

  it("falls back to local rules when the LLM output is unusable", async () => {
    mockChatCompletion("抱歉，我没法完成这个任务。");
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.parseData({ text: "林舟 北京大学 北京市\n只有名字", source: "paste" });

    expect(result.provider).toBe("local-fallback");
    expect(result.candidates).toHaveLength(1);
    expect(result.unparsed).toHaveLength(1);
  });

  it("falls back to local rules when the API returns an error", async () => {
    mockChatCompletion("", 429);
    const backend = createAiBackend(TEST_CONFIG);
    const result = await backend.parseData({ text: "林舟 北京大学 北京市\n只有名字", source: "paste" });

    expect(result.provider).toBe("local-fallback");
    expect(result.candidates).toHaveLength(1);
    expect(result.unparsed).toHaveLength(1);
  });

  it("propagates cancellation instead of returning a local single-turn fallback", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }));
    const backend = createAiBackend(TEST_CONFIG);
    await expect(
      backend.parseData({ text: "林舟 北京大学 北京市\n只有名字", source: "paste" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "AI_ABORTED" });
  });
});
