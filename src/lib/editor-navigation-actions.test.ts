import { describe, expect, it } from "vitest";
import type { ActivePanel } from "./app-constants";
import {
  createEditorNavigationActions,
  type EditorNavigationActionDeps,
  type EditorSettingsSection,
} from "./editor-navigation-actions";
import { applyTransaction, createProjectDocument, type ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";
import type { WorkflowStageId } from "./workflow-stages";
import type { WorkflowStepId } from "./workflow-progress";

interface Recorded {
  selections: SceneSelection[];
  studentIds: Array<string | null>;
  stages: WorkflowStageId[];
  panels: ActivePanel[];
  steps: WorkflowStepId[];
  sections: Array<EditorSettingsSection | null>;
  remembered: WorkflowStageId[];
  menuToggles: number;
  collaborationOpen: boolean[];
  exports: number;
}

function harness(overrides: Partial<EditorNavigationActionDeps> = {}): {
  actions: ReturnType<typeof createEditorNavigationActions>;
  log: Recorded;
} {
  const log: Recorded = {
    selections: [],
    studentIds: [],
    stages: [],
    panels: [],
    steps: [],
    sections: [],
    remembered: [],
    menuToggles: 0,
    collaborationOpen: [],
    exports: 0,
  };
  const actions = createEditorNavigationActions({
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    activeStage: "content",
    rememberStage: (stage) => log.remembered.push(stage),
    setSelection: (selection) => log.selections.push(selection),
    setSelectedStudentId: (id) => log.studentIds.push(id),
    setActiveStage: (stage) => log.stages.push(stage),
    setActivePanel: (panel) => log.panels.push(panel),
    setActiveWorkflowStep: (step) => log.steps.push(step),
    setSettingsSection: (section) => log.sections.push(section),
    toggleProjectMenu: () => { log.menuToggles += 1; },
    setCollaborationOpen: (open) => log.collaborationOpen.push(open),
    exportPng: () => { log.exports += 1; },
    ...overrides,
  });
  return { actions, log };
}

describe("selection navigation", () => {
  it("maps a style layer target onto its selection", () => {
    const { actions, log } = harness();

    actions.selectStyleLayer({ type: "text", id: "text-title", label: "标题" });

    expect(log.selections).toEqual([{ type: "text", id: "text-title" }]);
  });

  it("stays put when a layout issue names nothing that exists", () => {
    const { actions, log } = harness();

    actions.locateLayoutIssue({ id: "overlap:ghost:phantom" });

    expect(log.selections).toEqual([]);
  });

  it("jumps to the element a layout issue names", () => {
    const { actions, log } = harness();

    actions.locateLayoutIssue({ id: "overlap:map:text-title" });

    expect(log.selections).toEqual([{ type: "map" }]);
  });

  it("sends a roster issue to the data stage with the student highlighted", () => {
    const { actions, log } = harness();

    actions.locateDeliveryIssue({
      kind: "data",
      issue: { studentId: "s-1", studentName: "小林", kind: "unresolved-location", detail: "城市未匹配", severity: "warning" },
    });

    expect(log.studentIds).toEqual(["s-1"]);
    expect(log.stages).toEqual(["data"]);
    expect(log.panels).toEqual(["roster"]);
    expect(log.selections).toEqual([]);
  });

  it("opens the assets panel for a province picked in the legacy content editor", () => {
    const legacy = harness({ activeStage: "content" });
    legacy.actions.selectLegacyScene({ type: "province", province: "浙江" });
    expect(legacy.log.panels).toEqual(["assets"]);

    const mapStage = harness({ activeStage: "map" });
    mapStage.actions.selectLegacyScene({ type: "province", province: "浙江" });
    expect(mapStage.log.panels).toEqual([]);
    expect(mapStage.log.selections).toEqual([{ type: "province", province: "浙江" }]);
  });
});

describe("stage and panel navigation", () => {
  it("remembers the stage it left before dropping into the data side entrance", () => {
    const { actions, log } = harness({ activeStage: "map" });

    actions.openGlobalData();

    expect(log.remembered).toEqual(["map"]);
    expect(log.sections).toEqual([null]);
    expect(log.panels).toEqual(["roster"]);
    expect(log.steps).toEqual(["roster"]);
    expect(log.stages).toEqual(["data"]);
  });

  it("does not overwrite the remembered stage while already on data", () => {
    const { actions, log } = harness({ activeStage: "data" });

    actions.openGlobalData();

    expect(log.remembered).toEqual([]);
  });

  it("closes the settings screen on every stage change", () => {
    const { actions, log } = harness();

    actions.changeWorkflowStage("export");

    expect(log.sections).toEqual([null]);
    expect(log.stages).toEqual(["export"]);
    expect(log.panels).toEqual(["deliver"]);
    expect(log.steps).toEqual(["export"]);
  });

  it("routes the data stage through the global data entrance", () => {
    const { actions, log } = harness({ activeStage: "map" });

    actions.changeWorkflowStage("data");

    expect(log.stages).toEqual(["data", "data"]);
    expect(log.panels).toEqual(["roster"]);
    expect(log.remembered).toEqual(["map"]);
  });

  it("routes the roster panel through the same entrance and keeps other panels direct", () => {
    const roster = harness();
    roster.actions.changeWorkflowPanel("roster");
    expect(roster.log.panels).toEqual(["roster"]);
    expect(roster.log.stages).toEqual(["data", "data"]);

    const assets = harness();
    assets.actions.changeWorkflowPanel("assets");
    expect(assets.log.panels).toEqual(["assets"]);
    expect(assets.log.steps).toEqual(["local"]);
  });
});

describe("settings entrances", () => {
  it("opens each settings section from its own entrance in the legacy editor", () => {
    const studio = harness({ legacyEditorEnabled: true });
    studio.actions.openStudioSettings();
    expect(studio.log.steps).toEqual(["layout"]);
    expect(studio.log.sections).toEqual(["canvas"]);

    const diagnostics = harness({ legacyEditorEnabled: true });
    diagnostics.actions.openDataDiagnostics();
    expect(diagnostics.log.sections).toEqual(["cards"]);

    const render = harness({ legacyEditorEnabled: true });
    render.actions.openRenderSettings();
    expect(render.log.sections).toEqual(["advanced"]);
  });

  it("sends the same entrances to their owning stage on the public path", () => {
    const studio = harness();
    studio.actions.openStudioSettings();
    expect(studio.log.stages).toEqual(["frame"]);
    expect(studio.log.sections).toEqual([null]);

    const diagnostics = harness({ activeStage: "map" });
    diagnostics.actions.openDataDiagnostics();
    expect(diagnostics.log.stages).toEqual(["data"]);
    expect(diagnostics.log.panels).toEqual(["roster"]);
    expect(diagnostics.log.sections).toEqual([null]);

    const render = harness();
    render.actions.openRenderSettings();
    expect(render.log.stages).toEqual(["content"]);
    expect(render.log.sections).toEqual([null]);
  });

  it("unfolds the topbar project menu before opening the collaboration panel inside it", () => {
    const { actions, log } = harness();

    actions.openCollaborationSettings();

    expect(log.menuToggles).toBe(1);
    expect(log.collaborationOpen).toEqual([true]);
  });
});

describe("stage overview actions", () => {
  function projectWithText(): ProjectDocument {
    return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  }

  it("routes every overview action to its own destination", () => {
    const diagnostics = harness({ legacyEditorEnabled: true });
    diagnostics.actions.runStageOverviewAction({ kind: "data-diagnostics" });
    expect(diagnostics.log.sections).toEqual(["cards"]);

    const publicDiagnostics = harness();
    publicDiagnostics.actions.runStageOverviewAction({ kind: "data-diagnostics" });
    expect(publicDiagnostics.log.stages).toEqual(["data"]);

    const stage = harness();
    stage.actions.runStageOverviewAction({ kind: "stage", stage: "frame" });
    expect(stage.log.stages).toEqual(["frame"]);

    const png = harness();
    png.actions.runStageOverviewAction({ kind: "export-png" });
    expect(png.log.exports).toBe(1);
  });

  it("locates a layout issue named by the overview card", () => {
    const project = applyTransaction(projectWithText(), {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => current,
    });
    const { actions, log } = harness({ project });

    actions.runStageOverviewAction({
      kind: "locate-layout",
      issue: { id: "overlap:cards:text-title", kind: "occlusion", severity: "warning", detail: "重叠" },
    });

    expect(log.selections).toEqual([{ type: "cards" }]);
  });

  it("ignores the elements action the editor has no destination for", () => {
    const { actions, log } = harness();

    actions.runStageOverviewAction({ kind: "elements" });

    expect(log).toMatchObject({ selections: [], stages: [], panels: [], sections: [], exports: 0 });
  });
});
