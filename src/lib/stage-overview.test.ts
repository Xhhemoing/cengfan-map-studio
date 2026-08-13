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
    template: { id: "template", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    data: { id: "data", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    map: { id: "map", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    frame: { id: "frame", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    content: { id: "content", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
    export: { id: "export", status: "empty", counts: { total: 0, unresolved: 0, international: 0, hidden: 0 } },
  } as StageOverviewInput["stageProgress"];
  return {
    stage: "template",
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
  it("warns to pick a template when none is chosen, and reports it once chosen", () => {
    const blankProject = { ...makeInput().project, templateId: "" } as unknown as StageOverviewInput["project"];
    const empty = deriveStageOverviewCards(makeInput({ stage: "template", project: blankProject }));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ severity: "warning", question: "选择视觉模板" });

    const withTemplate = deriveStageOverviewCards(
      makeInput({
        stage: "template",
        project: createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }),
      }),
    );
    expect(withTemplate[0]).toMatchObject({ severity: "ok" });
  });

  it("surfaces the data decisions that matter: missing fields, duplicates, unresolvable locations", () => {
    const health: DataHealthSummary = { total: 3, visible: 3, hidden: 0, international: 0, unresolved: 1, missingRequired: 2, duplicate: 1 };
    const cards = deriveStageOverviewCards(makeInput({ stage: "data", dataHealth: health }));
    const ids = cards.map((c) => c.id);
    expect(ids).toEqual(["data-missing", "data-duplicate", "data-unresolved"]);
    expect(cards.every((c) => c.severity === "warning")).toBe(true);
    expect(cards.every((c) => c.action?.kind === "data-diagnostics")).toBe(true);
  });

  it("reports a healthy roster with a single ok card", () => {
    const health: DataHealthSummary = { total: 10, visible: 10, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 };
    const cards = deriveStageOverviewCards(makeInput({ stage: "data", dataHealth: health }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "data-clean", severity: "ok" });
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
    expect(state).toMatchObject({ severity: "warning", action: { kind: "export-png" } });
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
