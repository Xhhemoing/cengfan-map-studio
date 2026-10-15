import { describe, expect, it } from "vitest";
import {
  deriveStageOverviewCards,
  deriveStageOverviewModel,
  MAX_OVERVIEW_CARDS,
  type StageOverviewInput,
} from "./stage-overview";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";
import type { DataHealthSummary } from "./data-health";
import type { LayoutHealthIssue } from "./layout-health";
import type { ResourceHealthIssue } from "./resource-health";
import { createTextElement } from "./canvas-data";

function makeInput(overrides: Partial<StageOverviewInput> = {}): StageOverviewInput {
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const stageProgress = {
    data: { id: "data", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    map: { id: "map", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    frame: { id: "frame", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    content: { id: "content", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    export: { id: "export", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
  } as StageOverviewInput["stageProgress"];
  return {
    stage: "data",
    project,
    stageProgress,
    dataHealth: { total: 0, visible: 0, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 },
    dataIssues: [],
    layoutIssues: [],
    resourceIssues: [],
    dataViewLabel: "省份卡片",
    exportState: "idle",
    ...overrides,
  };
}

describe("deriveStageOverviewCards", () => {
  it("surfaces the data decisions that matter: missing fields, duplicates, unresolvable locations", () => {
    const health: DataHealthSummary = { total: 3, visible: 3, hidden: 0, international: 0, unresolved: 1, missingRequired: 2, duplicate: 1 };
    const cards = deriveStageOverviewCards(makeInput({ stage: "data", dataHealth: health }));
    const ids = cards.map((c) => c.id);
    expect(ids).toEqual(["data-missing", "data-duplicate", "data-unresolved"]);
    expect(cards.every((c) => c.severity === "warning")).toBe(true);
    expect(cards.every((c) => c.action?.kind === "data-diagnostics")).toBe(true);
  });

  it("reports a healthy roster with a single ok card pointing to the map stage", () => {
    const health: DataHealthSummary = { total: 10, visible: 10, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 };
    const cards = deriveStageOverviewCards(makeInput({ stage: "data", dataHealth: health }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "data-clean", severity: "ok", action: { kind: "stage", stage: "map" } });
    expect(cards[0].question).toContain("下一步：地图");
  });

  it("treats an empty roster as a warning to import, never as healthy", () => {
    // makeInput 默认 dataHealth.total === 0：空名单不应被判为“名单数据健康”。
    const cards = deriveStageOverviewCards(makeInput({ stage: "data" }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "data-empty",
      question: "还没有名单",
      severity: "warning",
      action: { kind: "data-diagnostics" },
    });
    expect(cards.some((c) => c.id === "data-clean")).toBe(false);
  });

  it("flags map-data fit when people cannot be located and surfaces manual province overrides", () => {
    const health: DataHealthSummary = { total: 3, visible: 3, hidden: 0, international: 0, unresolved: 2, missingRequired: 0, duplicate: 0 };
    const manualIssues = [{ studentId: "s1", studentName: "甲", kind: "manual-province", detail: "使用省份覆盖：北京", severity: "info" }] as StageOverviewInput["dataIssues"];
    const cards = deriveStageOverviewCards(makeInput({ stage: "map", dataHealth: health, dataIssues: manualIssues }));
    expect(cards.some((c) => c.id === "map-fit" && c.severity === "warning" && c.action?.kind === "data-diagnostics")).toBe(true);
    expect(cards.some((c) => c.id === "map-manual" && c.status.includes("省份覆盖"))).toBe(true);
    expect(cards.some((c) => c.id === "map-view" && c.status === "省份卡片")).toBe(true);
  });

  it("routes content layout issues to locate-layout actions and offers the element view", () => {
    const layoutIssues: LayoutHealthIssue[] = [
      { id: "li1", kind: "overflow", severity: "warning", detail: "卡片文字超出边界" },
    ];
    const project: StageOverviewInput["project"] = {
      ...createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }),
      textElements: [createTextElement("你好", 0, 0)],
    };
    const cards = deriveStageOverviewCards(makeInput({ stage: "content", layoutIssues, project }));
    const layout = cards.find((c) => c.id === "content-layout");
    expect(layout).toMatchObject({ severity: "warning", action: { kind: "locate-layout", issue: layoutIssues[0] } });
    expect(cards.find((c) => c.id === "content-elements")).toMatchObject({ action: { kind: "elements" } });
  });

  it("aggregates export blockers by kind and reports the last export state", () => {
    const resourceIssues: ResourceHealthIssue[] = [
      { kind: "resource", target: "assets/1.png", detail: "素材文件缺失", severity: "warning" },
    ];
    const layoutIssues: LayoutHealthIssue[] = [
      { id: "li1", kind: "occlusion", severity: "warning", detail: "元素相互遮挡" },
    ];
    const cards = deriveStageOverviewCards(
      makeInput({ stage: "export", layoutIssues, resourceIssues, exportState: "error" }),
    );
    expect(cards.some((c) => c.id === "export-layout" && c.action?.kind === "locate-layout")).toBe(true);
    const resource = cards.find((c) => c.id === "export-resource");
    expect(resource?.action).toMatchObject({ kind: "locate-delivery", issue: { kind: "resource" } });
    const state = cards.find((c) => c.id === "export-state");
    expect(state).toMatchObject({ severity: "warning", action: { kind: "retry-export" } });
  });

  it("identifies a blank template in delivery without reporting the checks complete", () => {
    const emptyProject = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const cards = deriveStageOverviewCards(makeInput({ stage: "export", project: emptyProject }));

    expect(cards.find((card) => card.id === "export-empty")).toMatchObject({ severity: "info", action: { kind: "data-diagnostics" } });
    expect(cards.find((card) => card.id === "export-empty")?.status).toContain("工程包备份");
    expect(cards.some((card) => card.id === "export-clean")).toBe(false);
  });

  it("identifies a fully hidden roster separately and retains the source-data reminder", () => {
    const hiddenProject = createProjectDocument({ students: sampleStudents.map((student) => ({ ...student, visibility: false })), templateId: "original", dataView: "province" });
    const cards = deriveStageOverviewCards(makeInput({ stage: "export", project: hiddenProject }));

    expect(cards.find((card) => card.id === "export-hidden")).toMatchObject({ severity: "info", action: { kind: "data-diagnostics" } });
    expect(cards.find((card) => card.id === "export-hidden")?.status).toContain("12 人全部隐藏");
    expect(cards.find((card) => card.id === "export-hidden")?.status).toContain("工程包仍保留完整名单");
    expect(cards.some((card) => card.id === "export-empty" || card.id === "export-clean")).toBe(false);
  });

  it("does not turn informational data notes into delivery warnings", () => {
    const note: StageOverviewInput["dataIssues"][number] = { studentId: sampleStudents[0]!.id, studentName: "林舟", kind: "manual-province", detail: "使用省份覆盖：北京", severity: "info" };
    const cards = deriveStageOverviewCards(makeInput({ stage: "export", dataIssues: [note] }));

    expect(cards.some((card) => card.id === "export-data")).toBe(false);
    expect(cards.some((card) => card.severity === "warning")).toBe(false);
    expect(cards.find((card) => card.id === "export-clean")?.severity).toBe("ok");
    expect(cards.find((card) => card.id === "export-notes")).toMatchObject({ severity: "info" });
  });

  it("surfaces missing fonts even when resources and the roster have no warnings", () => {
    const font: ResourceHealthIssue = { kind: "font", target: "text:text-title", detail: "标题字体缺失", severity: "error" };
    const cards = deriveStageOverviewCards(makeInput({ stage: "export", fontIssues: [font] }));

    expect(cards.find((card) => card.id === "export-resource")).toMatchObject({ severity: "warning", action: { kind: "locate-delivery", issue: { kind: "resource", issue: font } } });
    expect(cards.find((card) => card.id === "export-resource")?.status).toContain("1 处字体缺失");
    expect(cards.some((card) => card.id === "export-clean")).toBe(false);
  });

  it("keeps the last-format retry available even with an empty roster and several warning types", () => {
    const emptyProject = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const cards = deriveStageOverviewCards(makeInput({
      stage: "export", project: emptyProject, exportState: "error",
      dataIssues: [{ studentId: "s1", studentName: "林舟", kind: "missing-field", detail: "缺少城市", severity: "warning" }],
      layoutIssues: [{ id: "map", kind: "overflow", detail: "地图越界", severity: "warning" }],
      resourceIssues: [{ target: "map", kind: "resource", detail: "地图缺失", severity: "error" }],
    }));

    expect(cards).toHaveLength(MAX_OVERVIEW_CARDS);
    expect(cards.at(-1)).toMatchObject({ id: "export-state", action: { kind: "retry-export" } });
  });

  it("marks a successful older snapshot as stale and retries through the remembered format", () => {
    const cards = deriveStageOverviewCards(makeInput({ stage: "export", exportState: "success", exportIsStale: true }));
    expect(cards.find((card) => card.id === "export-state")).toMatchObject({ status: "当前版本有修改，请重新导出", severity: "info", action: { kind: "retry-export" } });
    const fresh = deriveStageOverviewCards(makeInput({ stage: "export", exportState: "success", exportIsStale: false }));
    expect(fresh.find((card) => card.id === "export-state")).toMatchObject({ status: "上次导出成功", action: undefined });
  });

  it("offers a next-stage card only when the current stage has no blocking warnings", () => {
    // 地图健康 → 下一步：版式；有未定位告警时不给下一步，优先保留告警卡。
    const healthyMap = deriveStageOverviewCards(makeInput({
      stage: "map",
      dataHealth: { total: 3, visible: 3, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 },
    }));
    expect(healthyMap.find((c) => c.id === "map-next")).toMatchObject({ action: { kind: "stage", stage: "frame" } });
    const warningMap = deriveStageOverviewCards(makeInput({
      stage: "map",
      dataHealth: { total: 3, visible: 3, hidden: 0, international: 0, unresolved: 2, missingRequired: 0, duplicate: 0 },
    }));
    expect(warningMap.some((c) => c.id === "map-next")).toBe(false);

    // 版式无溢出 → 下一步：内容。
    const healthyFrame = deriveStageOverviewCards(makeInput({ stage: "frame" }));
    expect(healthyFrame.find((c) => c.id === "frame-next")).toMatchObject({ action: { kind: "stage", stage: "content" } });
    const overflowFrame = deriveStageOverviewCards(makeInput({
      stage: "frame",
      layoutIssues: [{ id: "li1", kind: "overflow", severity: "warning", detail: "卡片文字超出边界" }],
    }));
    expect(overflowFrame.some((c) => c.id === "frame-next")).toBe(false);

    // 内容排版健康 → 下一步：交付。
    const healthyContent = deriveStageOverviewCards(makeInput({ stage: "content" }));
    expect(healthyContent.find((c) => c.id === "content-next")).toMatchObject({ action: { kind: "stage", stage: "export" } });
    const warningContent = deriveStageOverviewCards(makeInput({
      stage: "content",
      layoutIssues: [{ id: "li1", kind: "occlusion", severity: "warning", detail: "元素相互遮挡" }],
    }));
    expect(warningContent.some((c) => c.id === "content-next")).toBe(false);
  });

  it("caps every stage at MAX_OVERVIEW_CARDS cards", () => {
    const health: DataHealthSummary = { total: 20, visible: 10, hidden: 10, international: 3, unresolved: 4, missingRequired: 5, duplicate: 6 };
    const cards = deriveStageOverviewCards(makeInput({ stage: "data", dataHealth: health }));
    expect(cards.length).toBeLessThanOrEqual(MAX_OVERVIEW_CARDS);
  });
});

describe("deriveStageOverviewModel", () => {
  it("attaches the stage progress status and carries the cards", () => {
    const input = makeInput({ stage: "export", exportState: "success" });
    const model = deriveStageOverviewModel({ ...input, stageProgress: { ...input.stageProgress, export: { id: "export", status: "warning", counts: { total: 1, unresolved: 1, international: 0, hidden: 0 } } } });
    expect(model.stage).toBe("export");
    expect(model.progressStatus).toBe("warning");
    expect(model.cards.length).toBeGreaterThan(0);
  });

  it("keeps the model serializable (no functions, no refs)", () => {
    const model = deriveStageOverviewModel(makeInput({ stage: "content" }));
    expect(JSON.stringify(model)).not.toThrow;
    const flat = JSON.stringify(model);
    expect(flat).not.toContain("function");
  });
});
