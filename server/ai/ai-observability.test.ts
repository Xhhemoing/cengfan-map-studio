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

  it("keeps agent task, round, tool name and budget fields", () => {
    const lines: string[] = [];
    const logger = createAiLogger((line) => lines.push(line));
    logger.log("ai.agent.finished", {
      requestId: "req-2",
      taskId: "task-42",
      roundIndex: 3,
      budgetUsedTokens: 5_600,
      toolNames: ["query_students", "check_health"],
      toolArguments: { name: "张三" },
    });
    const output = JSON.parse(lines[0]!);
    expect(output).toMatchObject({ taskId: "task-42", roundIndex: 3, budgetUsedTokens: 5_600, toolNames: ["query_students", "check_health"] });
    expect(JSON.stringify(output)).not.toContain("张三");
  });

  it.each([
    "room.created",
    "room.joined",
    "room.kicked",
    "room.closed",
    "room.conflict",
    "room.rate_limited",
    "room.ticket_rejected",
  ])("records %s with only the room id, role and error code", (event) => {
    const lines: string[] = [];
    const logger = createAiLogger((line) => lines.push(line));
    logger.log(event, {
      roomId: "ABC123",
      role: "owner",
      errorCode: "VERSION_CONFLICT",
      clientId: "client-a",
      displayName: "林舟",
      accessToken: "room-secret",
      snapshot: { students: [{ name: "林舟", destination: "北京大学" }] },
    });
    expect(lines).toHaveLength(1);
    const output = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(Object.keys(output).sort()).toEqual(["errorCode", "event", "occurredAt", "role", "roomId"]);
    expect(output).toMatchObject({ event, roomId: "ABC123", role: "owner", errorCode: "VERSION_CONFLICT" });
    expect(lines[0]).not.toContain("林舟");
    expect(lines[0]).not.toContain("room-secret");
  });

  // 房间事件的字段即使被误传成对象也不能整包序列化进日志。
  it("drops non-scalar room fields instead of serialising a snapshot", () => {
    const lines: string[] = [];
    const logger = createAiLogger((line) => lines.push(line));
    logger.log("room.closed", {
      roomId: { id: "ABC123", snapshot: { students: ["林舟"] } },
      role: ["owner"],
    });
    const output = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(Object.keys(output).sort()).toEqual(["event", "occurredAt"]);
    expect(lines[0]).not.toContain("林舟");
  });

  it("keeps AI-only fields out of room events and ignores unknown events", () => {
    const lines: string[] = [];
    const logger = createAiLogger((line) => lines.push(line));
    logger.log("room.rate_limited", { roomId: "ABC123", errorCode: "ROOM_RATE_LIMITED", promptBytes: 42, usage: { totalTokens: 7 } });
    logger.log("room.snapshot", { roomId: "ABC123" });
    expect(lines).toHaveLength(1);
    const output = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(Object.keys(output).sort()).toEqual(["errorCode", "event", "occurredAt", "roomId"]);
  });
});
