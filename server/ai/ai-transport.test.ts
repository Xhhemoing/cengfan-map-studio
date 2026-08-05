// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestChatCompletion } from "./ai-transport";

const config = {
  apiKey: "secret",
  baseUrl: "https://llm.example/v1",
  model: "test-model",
  timeoutMs: 1000,
  maxAttempts: 2,
  retryBaseDelayMs: 0,
};

function completion(message: Record<string, unknown> = { role: "assistant", content: "ok" }, usage?: Record<string, number>) {
  return { choices: [{ message }], usage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestChatCompletion", () => {
  it("sends the OpenAI-compatible body and normalizes usage metadata", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ model: "test-model", messages: [{ role: "user", content: "hi" }], max_tokens: 4000 });
      return new Response(JSON.stringify(completion(undefined, { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 })), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestChatCompletion({ config, requestId: "req-1", route: "primary", body: { messages: [{ role: "user", content: "hi" }], max_tokens: 4000 }, parse: (payload) => (payload as { choices: unknown[] }).choices[0] });
    expect(result.meta).toMatchObject({ requestId: "req-1", model: "test-model", route: "primary", attempts: 1, usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } });
  });

  it("retries transient upstream failures and does not retry client failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await requestChatCompletion({ config, requestId: "req-2", route: "primary", body: {}, parse: () => "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset().mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(requestChatCompletion({ config, requestId: "req-3", route: "primary", body: {}, parse: () => "ok" })).rejects.toMatchObject({ code: "AI_UPSTREAM_REJECTED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    await expect(requestChatCompletion({ config, requestId: "req-4", route: "primary", body: {}, parse: () => "ok" })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("turns an aborted signal into AI_ABORTED", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    }));
    await expect(requestChatCompletion({ config, requestId: "req-5", route: "primary", body: {}, parse: () => "ok", signal: controller.signal })).rejects.toMatchObject({ code: "AI_ABORTED" });
  });
});
