// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAiLogger } from "./ai-observability";

describe("AI structured logger", () => {
  it("writes allowlisted metadata without prompt, credentials, or tool content", () => {
    const lines: string[] = [];
    const logger = createAiLogger((line) => lines.push(line));
    logger.log("ai.request.completed", {
      requestId: "req-1",
      model: "test-model",
      prompt: "student name secret",
      messages: [{ role: "user", content: "private" }],
      authorization: "Bearer sk-secret",
      toolContent: "private tool result",
      usage: { totalTokens: 3 },
      latencyMs: 20,
    });
    expect(lines).toHaveLength(1);
    const output = JSON.parse(lines[0]!);
    expect(output).toMatchObject({ event: "ai.request.completed", requestId: "req-1", model: "test-model", latencyMs: 20 });
    expect(JSON.stringify(output)).not.toContain("private");
    expect(JSON.stringify(output)).not.toContain("sk-secret");
  });
});
