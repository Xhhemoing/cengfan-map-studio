// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS } from "./tool-registry";
import { buildCapabilityCatalog, validatePlannedArguments } from "./capability-catalog";
import { validateTaskPlan, readySteps, readSuccessfulReceipts, isCleanHealthReceipt, type TaskPlan } from "./task-plan";
import { localHistorySummary } from "./local-agent-evidence";
import type { ChatMessage } from "./agent-types";

const plan = (): TaskPlan => ({ version: 1, unsupported: [], steps: [
  { id: "view", title: "城市分组", tool: "set_data_view", arguments: { view: "city" }, dependsOn: [] },
  { id: "cards", title: "紧凑卡片", tool: "update_cards", arguments: { preset: "compact" }, dependsOn: ["view"] },
] });
const call = { id: "c1", name: "update_cards", arguments: { preset: "compact" } };
const assistant: ChatMessage = { role: "assistant", tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] };
const result = (content: string, id = "c1"): ChatMessage => ({ role: "tool", tool_call_id: id, content });

describe("capability catalog and bounded task plans", () => {
  it("derives capabilities from the executable registry and does not promise export", () => {
    expect(buildCapabilityCatalog().tools.map((tool) => tool.name)).toEqual(AGENT_TOOLS.filter((tool) => tool.function.name !== "finish").map((tool) => tool.function.name));
    expect(buildCapabilityCatalog().unsupported).toContain("export_file");
  });
  it("accepts explicit dependencies and exposes only ready steps", () => {
    expect(validateTaskPlan(plan()).ok).toBe(true);
    expect(readySteps(plan(), new Set()).map((step) => step.id)).toEqual(["view"]);
    expect(readySteps(plan(), new Set(["view"])).map((step) => step.id)).toEqual(["cards"]);
  });
  it("rejects cycles, missing dependencies, duplicate IDs and ambiguous writes", () => {
    for (const mutate of [
      (p: TaskPlan) => { p.steps[0]!.dependsOn = ["cards"]; },
      (p: TaskPlan) => { p.steps[1]!.dependsOn = ["absent"]; },
      (p: TaskPlan) => { p.steps[1]!.id = "view"; },
      (p: TaskPlan) => { p.steps[1]!.dependsOn = []; },
    ]) { const p = plan(); mutate(p); expect(validateTaskPlan(p).ok).toBe(false); }
  });
  it("rejects unknown tools, protected fields, bad values and prototype paths", () => {
    for (const [name, args] of [
      ["export_file", {}], ["update_cards", { positions: {} }], ["update_map", { patch: null }],
      ["set_data_view", { view: "imaginary" }], ["inspect_project", { path: "__proto__.x" }],
      ["update_map", JSON.parse('{"__proto__":{"x":1}}')],
      ["manage_students", { action: "update_fact", studentId: "synthetic", fields: { city: "" } }],
      ["update_text", { patch: { content: "example" } }], ["finish", { summary: "done" }],
    ] as Array<[string, unknown]>) expect(validatePlannedArguments(name, args)).not.toBeNull();
  });
  it("bounds plans and permits explicit unsupported-only handoff", () => {
    const p = plan(); p.steps = Array.from({ length: 13 }, (_, i) => ({ ...p.steps[0]!, id: `s${i}` }));
    expect(validateTaskPlan(p).ok).toBe(false);
    expect(validateTaskPlan({ version: 1, steps: [], unsupported: ["导出请在交付界面手动执行"] }).ok).toBe(true);
    expect(validateTaskPlan({ version: 1, steps: [], unsupported: [] }).ok).toBe(false);
  });
});

describe("receipt evidence", () => {
  it("accepts exactly matched successful receipts", () => {
    expect(readSuccessfulReceipts([assistant, result('{"ok":true}')], [call])).toEqual([{ ok: true }]);
  });
  it("refuses missing, failed, malformed, duplicate and unrelated receipts", () => {
    for (const messages of [[assistant], [assistant, result('{"ok":false}')], [assistant, result('not json')], [assistant, result('{"ok":true}'), result('{"ok":true}')], [assistant, result('{"ok":true}', "other")]]) expect(readSuccessfulReceipts(messages, [call])).toBeNull();
    expect(readSuccessfulReceipts([assistant, result('{"ok":true}')], [{ ...call, arguments: { preset: "standard" } }])).toBeNull();
  });
  it("distinguishes successful health execution from a clean canvas", () => {
    expect(isCleanHealthReceipt({ ok: true, issues: [] })).toBe(true);
    expect(isCleanHealthReceipt({ ok: true, issues: [], issueCount: 2 })).toBe(false);
    expect(isCleanHealthReceipt({ ok: true, issues: [{ type: "overlap" }] })).toBe(false);
    expect(isCleanHealthReceipt({ ok: true })).toBe(false);
  });
  it("never calls a failed or read-only local history a completed edit", () => {
    expect(localHistorySummary([])).toBeNull();
    expect(localHistorySummary([result('{"ok":true}')])).toContain("未确认任何修改成功");
    expect(localHistorySummary([assistant, result('{"ok":false}')])).toContain("不能确认完成");
    expect(localHistorySummary([assistant, result('{"ok":true}')])).toContain("不代表复杂需求全部完成");
  });
});
