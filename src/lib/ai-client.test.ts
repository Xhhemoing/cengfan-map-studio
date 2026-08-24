import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRetryAfterSeconds, rateLimitedMessage, requestAiParseData } from "./ai-client";

/** parse-data 的 429 假响应；headers 缺省用来模拟不带 Retry-After 的服务端。 */
function rateLimitedResponse(headers?: Headers) {
  return {
    ok: false,
    status: 429,
    headers,
    json: async () => ({ error: { code: "AI_RATE_LIMITED", message: "请求过于频繁，请稍后重试。" } }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseRetryAfterSeconds", () => {
  it("reads the integer seconds the server sends", () => {
    expect(parseRetryAfterSeconds({ headers: new Headers({ "Retry-After": "12" }) })).toBe(12);
    expect(parseRetryAfterSeconds({ headers: new Headers({ "Retry-After": " 3 " }) })).toBe(3);
  });

  it.each([
    ["缺响应头", undefined],
    ["空值", ""],
    ["零秒", "0"],
    ["小数", "1.5"],
    ["负数", "-5"],
    ["HTTP 日期", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["超过一天", String(24 * 60 * 60 + 1)],
  ])("treats %s as absent", (_label, raw) => {
    const headers = raw === undefined ? undefined : new Headers({ "Retry-After": raw });
    expect(parseRetryAfterSeconds({ headers })).toBeNull();
  });
});

describe("rateLimitedMessage", () => {
  it("names the wait when Retry-After is usable and keeps the vague sentence otherwise", () => {
    expect(rateLimitedMessage({ headers: new Headers({ "Retry-After": "12" }) })).toBe("请求过于频繁，请 12 秒后再试。");
    expect(rateLimitedMessage({})).toBe("请求过于频繁，请稍后重试。");
  });
});

describe("requestAiParseData", () => {
  it("surfaces the Retry-After wait in the thrown rate-limit error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rateLimitedResponse(new Headers({ "Retry-After": "12" }))));
    await expect(requestAiParseData({ text: "张三 北京大学" })).rejects.toThrow("请求过于频繁，请 12 秒后再试。");
  });

  it("keeps the vague rate-limit sentence when the response carries no Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rateLimitedResponse()));
    await expect(requestAiParseData({ text: "张三 北京大学" })).rejects.toThrow("请求过于频繁，请稍后重试。");
  });
});
