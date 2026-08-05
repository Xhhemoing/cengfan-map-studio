import { describe, expect, it } from "vitest";
import { resolveAgentConfig } from "./agent-routing";

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
});
