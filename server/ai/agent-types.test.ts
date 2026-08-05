// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithTools, type AiConfig } from "./llm-client";
import type { ChatMessage, ToolDefinition } from "./agent-types";

const CONFIG: AiConfig = {
  apiKey: "test-key",
  baseUrl: "https://llm.example/v1",
  model: "deepseek-v4-flash",
  timeoutMs: 5_000,
  maxTokens: 4_000,
};

const TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "update_map",
    description: "修改地图",
    parameters: {
      type: "object",
      properties: { width: { type: "number" } },
    },
  },
};

function mockCompletion(message: ChatMessage) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message }] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chatWithTools", () => {
  it("sends tools and preserves tool calls and reasoning content", async () => {
    const fetchMock = mockCompletion({
      role: "assistant",
      content: null,
      reasoning_content: "先读取现状",
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: { name: "update_map", arguments: '{"width":640}' },
      }],
    });

    const message = await chatWithTools(
      CONFIG,
      [{ role: "user", content: "缩小地图" }],
      [TOOL],
    );
    const request = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit;
    const body = JSON.parse(String(request?.body));

    expect(body.tools).toEqual([TOOL]);
    expect(body.tool_choice).toBe("auto");
    expect(body.max_tokens).toBe(4_000);
    expect(message.tool_calls?.[0]?.function.name).toBe("update_map");
    expect(message.tool_calls?.[0]?.function.arguments).toBe('{"width":640}');
    expect(message.reasoning_content).toBe("先读取现状");
  });

  it("raises an error when the API responds unsuccessfully", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    })));

    await expect(chatWithTools(CONFIG, [], [TOOL])).rejects.toThrow(/502/);
  });

  it("raises an error without an API key", async () => {
    await expect(chatWithTools({ ...CONFIG, apiKey: undefined }, [], [TOOL])).rejects.toThrow(/API Key/);
  });
});
