import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentSession, compactAgentToolResult, truncateUtf8 } from "./agent-session";
import { response } from "./agent-session-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession tool results", () => {
  it("compacts large tool results before sending them back to the server", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");
    const request = JSON.parse(String((fetchMock.mock.calls[1] as unknown[])[1] && ((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body));
    const toolMessage = request.messages.find((message: { role: string }) => message.role === "tool");
    expect(JSON.stringify(toolMessage).length).toBeLessThanOrEqual(16 * 1024);
    expect(toolMessage.content).not.toContain("placements");
  });

  it("always returns valid JSON within the UTF-8 tool-result budget", () => {
    const compacted = compactAgentToolResult("generic", JSON.stringify({ text: "界".repeat(20000) }));
    expect(() => JSON.parse(compacted)).not.toThrow();
    expect(new TextEncoder().encode(compacted).byteLength).toBeLessThanOrEqual(16 * 1024);
    const invalid = compactAgentToolResult("generic", "not json");
    expect(() => JSON.parse(invalid)).not.toThrow();
    expect(new TextEncoder().encode(invalid).byteLength).toBeLessThanOrEqual(16 * 1024);
  });

  it("rejects empty, non-string, null, and overlong client-side update_fact values", async () => {
    for (const value of ["", "   ", 1, {}, null, "a".repeat(201)]) {
      const project = createProjectDocument({ students: [{ id: "s1", name: "张三", university: "大学", city: "广州", province: "广东", visibility: true }], templateId: "original", dataView: "province" });
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: value } } }], assistantMessage: { role: "assistant", content: null } }))
        .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
      const session = new AgentSession(project, { mode: "conservative" });
      await session.run("修改事实");
      expect(session.shadowProject.students[0]?.city).toBe("广州");
      expect(session.steps[0]?.result.content).toContain("TOOL_ARGUMENTS_INVALID");
    }
  });

  it("rejects client-side update_fact fields and does not mutate the shadow", async () => {
    const project = createProjectDocument({ students: [{ id: "s1", name: "张三", university: "大学", city: "广州", province: "广东", visibility: true }], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { province: "北京" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("修改事实");
    expect(session.shadowProject.students[0]?.province).toBe("广东");
    expect(session.steps[0]?.result.content).toContain("TOOL_ARGUMENTS_INVALID");
  });

  it("truncates on UTF-8 sequence boundaries without emitting replacement characters", () => {
    const value = "界🎓测a試𝒜".repeat(400);
    const encoder = new TextEncoder();
    for (let maxBytes = 0; maxBytes <= 96; maxBytes += 1) {
      const truncated = truncateUtf8(value, maxBytes);
      expect(encoder.encode(truncated).byteLength).toBeLessThanOrEqual(maxBytes);
      expect(value.startsWith(truncated)).toBe(true);
      expect(truncated).not.toContain("\uFFFD");
    }
    expect(truncateUtf8("界", 8)).toBe("界");
    expect(truncateUtf8(value, encoder.encode(value).byteLength)).toBe(value);
  });

  it("keeps fuzzed CJK and emoji tool results valid UTF-8 JSON within the 16KiB budget", () => {
    let seed = 20_260_824;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const alphabet = ["界", "测", "试", "a", "🎓", "👩‍🎓", "𝒜", "é", "「", "\n", "\"", "\\", "\u0007"];
    const encoder = new TextEncoder();
    const strictDecoder = new TextDecoder("utf-8", { fatal: true });
    for (let round = 0; round < 40; round += 1) {
      const length = 3_000 + Math.floor(random() * 9_000);
      let text = "";
      for (let index = 0; index < length; index += 1) text += alphabet[Math.floor(random() * alphabet.length)];
      const compacted = compactAgentToolResult("generic", JSON.stringify({ ok: true, text }));
      const bytes = encoder.encode(compacted);

      expect(bytes.byteLength).toBeLessThanOrEqual(16 * 1024);
      expect(() => strictDecoder.decode(bytes)).not.toThrow();
      const parsed = JSON.parse(compacted) as { code?: string; preview?: string };
      if (parsed.code === "TOOL_RESULT_TRUNCATED") {
        expect(parsed.preview).not.toContain("\uFFFD");
        expect(bytes.byteLength).toBeGreaterThan(16 * 1024 - 32);
      }
    }
  });
});
