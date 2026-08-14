import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";
import { computeWorkflowProgress } from "./workflow-progress";
import {
  WORKFLOW_STAGES,
  deriveWorkflowStageProgress,
  LEGACY_PANEL_TO_WORKFLOW_STAGE,
  LEGACY_WORKFLOW_STEP_TO_STAGE,
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  legacyPanelToWorkflowStage,
  legacyWorkflowStepToStage,
  type WorkflowStageId,
} from "./workflow-stages";

describe("workflow stages", () => {
  it("defines the five public production stages in order", () => {
    expect(WORKFLOW_STAGES.map((stage) => stage.id)).toEqual([
      "data",
      "map",
      "frame",
      "content",
      "export",
    ]);
    expect(WORKFLOW_STAGES.map((stage) => stage.label)).toEqual([
      "数据与素材",
      "地图样式",
      "展示框样式",
      "内容与排版",
      "最终导出",
    ]);
  });

  it("maps legacy panels and workflow steps to the corresponding public stage", () => {
    const expectedPanels: Record<string, WorkflowStageId> = {
      roster: "data",
      map: "map",
      layout: "frame",
      content: "content",
      assets: "content",
      deliver: "export",
    };
    const expectedSteps: Record<string, WorkflowStageId> = {
      roster: "data",
      presentation: "map",
      layout: "frame",
      local: "content",
      export: "export",
    };

    expect(LEGACY_PANEL_TO_WORKFLOW_STAGE).toEqual(expectedPanels);
    expect(LEGACY_WORKFLOW_STEP_TO_STAGE).toEqual(expectedSteps);
    expect(WORKFLOW_STAGE_TO_LEGACY_PANEL).toEqual({
      data: "roster",
      map: "map",
      frame: "layout",
      content: "content",
      export: "deliver",
    });
    for (const [legacyId, stageId] of Object.entries(expectedPanels)) {
      expect(legacyPanelToWorkflowStage(legacyId)).toBe(stageId);
    }
    for (const [legacyId, stageId] of Object.entries(expectedSteps)) {
      expect(legacyWorkflowStepToStage(legacyId)).toBe(stageId);
    }
    expect(legacyPanelToWorkflowStage("layout")).toBe("frame");
    expect(legacyWorkflowStepToStage("layout")).toBe("frame");
    expect(legacyPanelToWorkflowStage("unknown")).toBe("data");
  });

  it("adapts legacy progress to five-stage status without changing its source API", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const progress = computeWorkflowProgress(project);
    const stages = deriveWorkflowStageProgress(project, progress);

    expect(Object.keys(stages)).toEqual(["data", "map", "frame", "content", "export"]);
    expect(stages.data).toMatchObject({ id: "data", status: progress.roster.status });
    expect(stages.map).toMatchObject({ id: "map", status: progress.presentation.status });
    expect(stages.frame).toMatchObject({ id: "frame", status: progress.layout.status });
    expect(stages.content).toMatchObject({ id: "content", status: progress.local.status });
    expect(stages.export).toMatchObject({ id: "export", status: progress.exportStep.status });
  });
});
