import { describe, expect, it } from "vitest";
import { interpretLocalIntent } from "./agent-local-intent";
import { createProjectDocument } from "./project-document";
import { executeAgentTool } from "./agent-tool-executor";

// Fixed Chinese task set for the deterministic fallback. This is not a model-quality benchmark.
const accepted: Array<[string, string, Record<string, unknown>]> = [
  ["地图缩小一点", "update_map", { scale: .85 }],
  ["请把地图缩小一点", "update_map", { scale: .85 }],
  ["地图小一点", "update_map", { scale: .85 }],
  ["帮我地图小些", "update_map", { scale: .85 }],
  ["地图放大一点", "update_map", { scale: 1.15 }],
  ["请将地图大一点", "update_map", { scale: 1.15 }],
  ["把地图缩小", "update_map", { scale: .85 }],
  ["将地图放大", "update_map", { scale: 1.15 }],
  ["地图再缩小一些", "update_map", { scale: .85 }],
  ["map小一点", "update_map", { scale: .85 }],
  ["按城市分组", "set_data_view", { view: "city" }],
  ["请按省份分组", "set_data_view", { view: "province" }],
  ["改为院校分组", "set_data_view", { view: "university" }],
  ["切换到大学分组", "set_data_view", { view: "university" }],
  ["按省份视图", "set_data_view", { view: "province" }],
  ["卡片紧凑一点", "update_cards", { compactLayout: true }],
  ["展示框紧凑些", "update_cards", { compactLayout: true }],
  ["请把名单变得紧凑一点", "update_cards", { compactLayout: true }],
  ["紧凑", "update_cards", { compactLayout: true }],
  ["展示框更紧凑", "update_cards", { compactLayout: true }],
  ["检查布局", "check_health", {}],
  ["检查一下排版问题", "check_health", {}],
  ["诊断排版", "check_health", {}],
  ["查看展示框模板", "list_card_styles", {}],
  ["列出卡片样式", "list_card_styles", {}],
];
const constrained = [
  "不要按城市分组，保留省份分组", "地图不要缩小", "地图放大但别动卡片", "不许修改姓名", "不改分组，卡片紧凑一点",
  "保留名字字号，让展示框紧凑", "保持地图位置，缩小地图", "仅调整北京框", "只修改选中的框", "这个框缩小一点",
  "左边太挤，整理一下", "右边的框按城市分组", "上海附近的框紧凑些", "除了江苏，其他卡片重新排", "按刚才的风格再做一次",
];
const unsupported = [
  "帮我做得更漂亮", "按城市分组并把地图缩小", "地图缩小到0.7", "所有框做成浅蓝色", "删掉重复学生",
  "把张同学改去上海", "使用不存在的模板", "城市交通很便利", "这份名单看起来紧凑吗", "把大学名字改得更短",
];

describe("50 fixed Chinese local tasks", () => {
  it.each(accepted)("executes supported complete instruction: %s", (prompt, name, expected) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.scale = 1;
    const plan = interpretLocalIntent(prompt, { map: { scale: 1 } });
    expect(plan.kind).toBe("actions");
    if (plan.kind !== "actions") return;
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]?.name).toBe(name);
    expect(plan.calls[0]?.arguments).toMatchObject(name.startsWith("update_") ? { patch: expected } : expected);
    const outcome = executeAgentTool(project, { ...plan.calls[0]!, id: "eval" }, {});
    expect(outcome.payload.ok).toBe(true);
    if (name === "update_map") expect(outcome.project.map.scale).toBe(expected.scale);
    if (name === "set_data_view") expect(outcome.project.dataView).toBe(expected.view);
    if (name === "update_cards") {
      expect(outcome.project.cards.compactLayout).toBe(true);
      expect(outcome.project.cards.fontSize).toBe(project.cards.fontSize);
    }
    if (["check_health", "list_card_styles"].includes(name)) expect(outcome.project).toBe(project);
    expect(outcome.project.students).toEqual(project.students);
  });
  it.each(constrained)("does not guess constraints or references: %s", prompt => {
    const result = interpretLocalIntent(prompt, { map: { scale: 1 } });
    expect(result.kind).toBe("needs-input");
    expect(result).not.toHaveProperty("calls");
  });
  it.each(unsupported)("does not partially execute an unsupported request: %s", prompt => {
    const result = interpretLocalIntent(prompt, { map: { scale: 1 } });
    expect(result.kind).toBe("unsupported");
    expect(result).not.toHaveProperty("calls");
  });
});
