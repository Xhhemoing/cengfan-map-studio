import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { executeAgentTool } from "./agent-tool-executor";
import { resolveProjectScene } from "./resolved-scene";
import { resolveCardSettings, getCardScopeKey } from "./card-settings-scope";
import type { AgentTaskBrief } from "./agent-task-brief";
import { validateAgentCall } from "./agent-tool-contract";

function fixture() {
  return createProjectDocument({ templateId: "original", dataView: "city", students: [
    { id: "a", name: "示例甲", university: "示例大学", city: "广州", province: "广东", visibility: true },
    { id: "b", name: "示例乙", university: "示例学院", city: "深圳", province: "广东", visibility: true },
  ] });
}
const call = (name: string, args: Record<string, unknown> = {}) => ({ id: "tool", name, arguments: args });
const brief = (patch: Partial<AgentTaskBrief>): AgentTaskBrief => ({ goal: "custom", scope: "project", selection: null, preserve: [], ...patch });

describe("AI scene contract and scoped execution", () => {
  it("reads real writable values, reports missing paths, and never exposes prototype data", () => {
    const project = fixture();
    expect(executeAgentTool(project, call("inspect_project", { path: "cards.background" }), {}).payload).toMatchObject({ ok: true, value: project.cards.background, valueType: "string" });
    for (const path of ["cards.unknown", "cards.__proto__", "students.0.name"]) expect(executeAgentTool(project, call("inspect_project", { path }), {}).payload).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
  });
  it("returns actual normalization and meaningful no-op feedback", () => {
    const project = fixture();
    const outcome = executeAgentTool(project, call("update_cards", { patch: { fontSize: 600 } }), {});
    expect(outcome.project.cards.fontSize).toBe(48);
    expect(outcome.payload.diff).toEqual(expect.arrayContaining([expect.objectContaining({ path: "cards.fontSize", requested: 600, after: 48, normalized: true })]));
    const noop = executeAgentTool(project, call("update_cards", { patch: { fontSize: project.cards.fontSize } }), {});
    expect(noop.project).toBe(project);
    expect(noop.payload.noop).toBe(true);
  });
  it("rejects wrong types and nested unsupported properties without mutation", () => {
    const project = fixture();
    for (const patch of [{ fontSize: "20" }, { visibleFields: "name" }, { fieldTypography: { name: { unexpected: 9 } } }, { positions: {} }]) {
      const result = executeAgentTool(project, call("update_cards", { patch }), {});
      expect(result.project).toBe(project);
      expect(result.payload.ok).toBe(false);
    }
  });
  it("merges individual typography fields instead of erasing existing overrides", () => {
    const project = fixture();
    project.cards.fieldTypography = { name: { color: "#123456", fontSize: 12 }, university: { color: "#654321" } };
    const outcome = executeAgentTool(project, call("update_cards", { patch: { fieldTypography: { name: { fontSize: 18 } } } }), {});
    expect(outcome.project.cards.fieldTypography).toEqual({ name: { color: "#123456", fontSize: 18 }, university: { color: "#654321" } });
  });
  it("uses actual city IDs and geometry rather than synthetic province boxes", () => {
    const project = fixture();
    const scene = resolveProjectScene(project);
    const inspected = executeAgentTool(project, call("inspect_scene"), {}).payload;
    expect((inspected.cards as Array<{id: string}>).map(card => card.id)).toEqual(scene.cards.map(card => card.group.key));
    expect(inspected.cards).toHaveLength(2);
    expect(executeAgentTool(project, call("check_health"), {}).payload.issues).toEqual(scene.diagnostics);
  });
  it("applies only the selected card style and preserves its neighbor's style", () => {
    const project = fixture();
    const [id, other] = resolveProjectScene(project).cards.map(card => card.group.key);
    const result = executeAgentTool(project, call("update_cards", { patch: { background: "#abcdef" } }), { taskBrief: brief({ scope: "selection", selection: { type: "cards", ids: [id!] } }) });
    expect(result.payload.ok).toBe(true);
    expect(resolveCardSettings(result.project.cards, id!).background).toBe("#abcdef");
    expect(resolveCardSettings(result.project.cards, other!).background).toBe(project.cards.background);
    expect(result.project.cards.grouping).toBe("city");
  });
  it("never silently broadens a missing scope or writes global properties through local styles", () => {
    const project = fixture();
    const id = resolveProjectScene(project).cards[0]!.group.key;
    for (const args of [{ scopeIds: ["missing"], patch: { background: "#abcdef" } }, { scopeIds: [id], patch: { gap: 22 } }]) {
      const result = executeAgentTool(project, call("update_cards", args), {});
      expect(result.payload.ok).toBe(false);
      expect(result.project).toBe(project);
    }
    expect(executeAgentTool(project, call("update_cards", { patch: { fontSize: 18 } }), { taskBrief: brief({ scope: "selection" }) }).payload.code).toBe("SCOPE_REQUIRED");
  });
  it("honors explicit preserve constraints before executing tools", () => {
    const project = fixture();
    for (const [tool, args, preserve] of [
      ["manage_students", { action: "hide", studentId: "a" }, "data"],
      ["update_map", { patch: { scale: .8 } }, "map"],
      ["auto_layout", {}, "positions"],
      ["apply_card_style", { templateId: "ticket" }, "style"],
    ] as const) {
      const result = executeAgentTool(project, call(tool, args), { taskBrief: brief({ preserve: [preserve] }) });
      expect(result.payload.code).toBe("CONSTRAINT_CONFLICT");
      expect(result.project).toBe(project);
    }
  });
  it("applies visual templates without changing grouping or locked coordinates", () => {
    const project = fixture();
    const id = resolveProjectScene(project).cards[0]!.group.key;
    project.cards.positions = { [id]: { x: 35, y: 250 } };
    project.cards.positionPolicies = { [getCardScopeKey(project.cards, id)]: "locked" };
    const result = executeAgentTool(project, call("apply_card_style", { templateId: "glass-stat" }), {});
    expect(result.payload.ok).toBe(true);
    expect(result.project.cards.grouping).toBe("city");
    expect(result.project.cards.positions).toEqual(project.cards.positions);
    expect(result.project.cards.positionPolicies).toEqual(project.cards.positionPolicies);
  });
  it("refuses ambiguous student names instead of editing the first match", () => {
    const project = fixture();
    project.students = project.students.map(student => ({ ...student, name: "同名示例" }));
    const result = executeAgentTool(project, call("manage_students", { action: "hide", name: "同名示例" }), {});
    expect(result.payload.code).toBe("AMBIGUOUS_TARGET");
    expect(result.project).toBe(project);
  });
  it("rejects unknown tool names before replay can execute them", () => {
    expect(validateAgentCall(call("invented_tool"))).toMatchObject({ ok: false, code: "TOOL_ARGUMENTS_INVALID" });
  });
});
