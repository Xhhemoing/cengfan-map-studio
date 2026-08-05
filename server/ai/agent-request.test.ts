// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseAgentRequest, validateAgentToolBatch } from "./agent-request";

describe("parseAgentRequest", () => {
  const valid = { userMessage: "改地图", digest: { map: { scale: 1 } }, messages: [{ role: "user", content: "改地图" }] };

  it("rejects oversized user messages before they enter the conversation", () => {
    expect(parseAgentRequest({ ...valid, userMessage: "x".repeat(32 * 1024 + 1) }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, userMessage: `data:text/plain,${"x".repeat(300)}` }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, userMessage: `data:text/plain;base64,${"x".repeat(32 * 1024)}` }).ok).toBe(false);
  });

  it("rejects oversized and malformed conversations", () => {
    expect(parseAgentRequest({ ...valid, messages: Array.from({ length: 81 }, () => ({ role: "user", content: "x" })) }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "user", content: "x".repeat(32 * 1024 + 1) }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "nope", content: "x" }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "tool", content: "x" }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "assistant", content: null, tool_calls: [{ id: "", type: "function", function: { name: "unknown", arguments: "{}" } }] }] }).ok).toBe(false);
  });

  it("removes client system messages and rejects long data URLs", () => {
    const parsed = parseAgentRequest({ ...valid, messages: [{ role: "system", content: "unsafe" }, ...valid.messages], digest: { image: `data:image/png;base64,${"a".repeat(300)}` } });
    expect(parsed.ok).toBe(false);
    const clean = parseAgentRequest({ ...valid, messages: [{ role: "system", content: "unsafe" }, ...valid.messages] });
    expect(clean.ok).toBe(true);
    if (clean.ok) expect(clean.value.messages.every((message) => message.role !== "system")).toBe(true);
  });

  it("injects exactly one current user message when history does not end with the same request", () => {
    const empty = parseAgentRequest({ ...valid, messages: [] });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value.messages).toEqual([{ role: "user", content: "改地图" }]);

    const different = parseAgentRequest({ ...valid, messages: [{ role: "user", content: "旧需求" }] });
    expect(different.ok).toBe(true);
    if (different.ok) expect(different.value.messages.at(-1)).toEqual({ role: "user", content: "改地图" });

    const same = parseAgentRequest(valid);
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.value.messages).toEqual([{ role: "user", content: "改地图" }]);
  });

  it("requires tool results to consume a preceding assistant tool call", () => {
    const assistant = { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "check_health", arguments: "{}" } }] };
    expect(parseAgentRequest({ ...valid, messages: [assistant, { role: "tool", tool_call_id: "call-1", content: "{}" }] }).ok).toBe(true);
    expect(parseAgentRequest({ ...valid, messages: [assistant, { role: "tool", tool_call_id: "missing", content: "{}" }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [assistant, { role: "tool", tool_call_id: "call-1", content: "{}" }, { role: "tool", tool_call_id: "call-1", content: "{}" }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [assistant] }).ok).toBe(false);
  });

  it("enforces unique tool ids and assistant tool groups before the next user turn", () => {
    const assistant = { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "check_health", arguments: "{}" } }] };
    const tool = { role: "tool", tool_call_id: "call-1", content: "{}" };
    expect(parseAgentRequest({ ...valid, messages: [assistant, { role: "user", content: "插入" }, tool] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ ...assistant, tool_calls: [assistant.tool_calls[0], { ...assistant.tool_calls[0], id: "call-1" }] }, tool, tool] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [assistant, tool, { role: "assistant", content: "下一轮" }] }).ok).toBe(true);
  });

  it("strictly validates role content and tool argument limits", () => {
    expect(parseAgentRequest({ ...valid, messages: [{ role: "user", content: null }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "assistant", content: 1 }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "system", content: 1 }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "check_health", arguments: "x".repeat(16 * 1024 + 1) } }] }] }).ok).toBe(false);
    expect(parseAgentRequest({ ...valid, messages: [{ role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "check_health", arguments: "[]" } }] }] }).ok).toBe(false);
    const longDataArguments = JSON.stringify({ image: `data:image/png;base64,${"a".repeat(300)}` });
    expect(parseAgentRequest({
      ...valid,
      messages: [{ role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", arguments: longDataArguments, function: { name: "check_health", arguments: longDataArguments } }] }],
    }).ok).toBe(false);
  });

  it("rejects empty, non-string, null, and overlong update_fact values", () => {
    for (const value of ["", "   ", 1, {}, null, "a".repeat(201)]) {
      expect(parseAgentRequest({
        ...valid,
        messages: [{ role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "manage_students", arguments: JSON.stringify({ action: "update_fact", fields: { city: value } }) } }] }, { role: "tool", tool_call_id: "call-1", content: "{}" }],
      }).ok).toBe(false);
    }
  });

  it("rejects update_fact fields outside the fact whitelist", () => {
    expect(parseAgentRequest({
      ...valid,
      messages: [{ role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "manage_students", arguments: JSON.stringify({ action: "update_fact", fields: { province: "广东" } }) } }] }],
    }).ok).toBe(false);
  });

  it("normalizes budget values", () => {
    const parsed = parseAgentRequest({ ...valid, budget: { usedTokens: -1, maxTokens: 999999, rounds: 2.8, maxRounds: 99 } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.budget).toEqual({ usedTokens: 0, maxTokens: 60000, rounds: 2, maxRounds: 20 });
  });

  it("enforces server runtime budgets over client-supplied limits", () => {
    const parsed = parseAgentRequest(
      { ...valid, budget: { usedTokens: 999, maxTokens: 999999, rounds: 4, maxRounds: 99 } },
      { maxTokens: 1200, maxRounds: 5 },
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.budget).toEqual({ usedTokens: 999, maxTokens: 1200, rounds: 4, maxRounds: 5 });
  });
});

describe("validateAgentToolBatch", () => {
  const call = (name: string, args: Record<string, unknown> = {}, id = name) => ({ id, name, arguments: args });

  it("rejects unknown tools and mixed finish calls", () => {
    expect(validateAgentToolBatch([call("unknown")]).ok).toBe(false);
    expect(validateAgentToolBatch([call("finish"), call("check_health")]).ok).toBe(false);
  });

  it("rejects conflicting writes while allowing independent updates and reads", () => {
    expect(validateAgentToolBatch([call("update_map", { patch: { scale: 1 } }), call("update_map", { patch: { width: 2 } })]).ok).toBe(false);
    expect(validateAgentToolBatch([call("update_text", { id: "a", patch: { x: 1 } }), call("update_text", { id: "b", patch: { x: 1 } })]).ok).toBe(true);
    expect(validateAgentToolBatch([call("inspect_project"), call("find_assets")]).ok).toBe(true);
    expect(validateAgentToolBatch([call("auto_layout"), call("update_cards", { patch: { gap: 2 } })]).ok).toBe(false);
  });
});
