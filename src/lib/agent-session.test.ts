import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentSession } from "./agent-session";

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentSession", () => {
  it("executes scene tools on a shadow copy", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "地图已缩小" })));
    const session = new AgentSession(project, { mode: "conservative" });
    const outcome = await session.run("地图小一点");
    expect(outcome.kind).toBe("finish");
    expect(session.shadowProject.map.width).toBe(640);
    expect(project.map.width).not.toBe(640);
    expect(session.landingPreview().needsConfirmation).toBe(true);
    const applied = session.transaction().apply(project);
    expect(applied.map.width).toBe(640);
    expect(applied.history).toEqual(project.history);
  });

  it("rejects protected card positions before changing the shadow", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      kind: "tool-call",
      calls: [{ id: "c1", name: "update_cards", arguments: { patch: { positions: {} } } }],
      assistantMessage: { role: "assistant", content: null },
    })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("改卡片位置");
    expect(session.steps[0]?.result.ok).toBe(false);
  });

  it("marks auto layout high risk when manual positions existed", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const positioned = { ...project, cards: { ...project.cards, positions: { p: { x: 10, y: 10 } } } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(positioned, { mode: "smart" });
    await session.run("自动排版");
    expect(session.steps[0]?.risk).toBe("high");
    expect(session.landingPreview().needsConfirmation).toBe(true);
  });
});
