import { describe, expect, it } from "vitest";
import {
  resolveDeliveryIssueNavigation,
  resolveLayoutIssueSelection,
  resolveWorkflowPanelNavigation,
  resolveWorkflowStageNavigation,
  styleLayerSelection,
} from "./editor-navigation";
import { STYLE_LAYER_TARGETS } from "./catalog-usage";
import { createProjectDocument, type ProjectDocument } from "./project-document";

function documentFixture(): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

describe("styleLayerSelection", () => {
  it("maps every layer entry to its own selection kind", () => {
    const selections = STYLE_LAYER_TARGETS.map((target) => styleLayerSelection(target));

    expect(selections).toEqual([
      { type: "canvas" },
      { type: "text", id: "text-title" },
      { type: "text", id: "text-subtitle" },
      { type: "map" },
      { type: "cards" },
      { type: "guests" },
    ]);
  });
});

describe("resolveLayoutIssueSelection", () => {
  it("picks the map out of a composite overlap id", () => {
    expect(resolveLayoutIssueSelection(documentFixture(), { id: "overlap:map:guests" })).toEqual({ type: "map" });
  });

  it("selects an existing text element named in the issue", () => {
    const project = documentFixture();
    const textId = project.textElements[0]!.id;

    expect(resolveLayoutIssueSelection(project, { id: `overflow:${textId}` })).toEqual({ type: "text", id: textId });
  });

  it("selects the cards layer for a manually positioned display frame", () => {
    const project = documentFixture();
    const withCard: ProjectDocument = {
      ...project,
      cards: { ...project.cards, positions: { "card-a": { x: 1, y: 2 } } },
    };

    expect(resolveLayoutIssueSelection(withCard, { id: "overlap:card-a:guests" })).toEqual({ type: "cards" });
  });

  it("returns null rather than jumping to an element the project does not have", () => {
    expect(resolveLayoutIssueSelection(documentFixture(), { id: "overlap:ghost-1:ghost-2" })).toBeNull();
  });
});

describe("resolveDeliveryIssueNavigation", () => {
  it("sends a roster problem to the data stage and highlights the row without touching the canvas selection", () => {
    const navigation = resolveDeliveryIssueNavigation(documentFixture(), {
      kind: "data",
      issue: { studentId: "s1", studentName: "小明", kind: "missing-field", detail: "缺少城市", severity: "warning" },
    });

    expect(navigation).toEqual({ selection: null, stage: "data", panel: "roster", studentId: "s1" });
  });

  it("sends a layout problem to the content stage with the located element selected", () => {
    const navigation = resolveDeliveryIssueNavigation(documentFixture(), {
      kind: "layout",
      issue: { id: "overlap:map:guests", kind: "occlusion", severity: "warning", detail: "重叠" },
    });

    expect(navigation).toEqual({ selection: { type: "map" }, stage: "content", panel: "content" });
  });

  it("still moves to the content stage when a layout issue names no live element", () => {
    const navigation = resolveDeliveryIssueNavigation(documentFixture(), {
      kind: "layout",
      issue: { id: "overlap:ghost", kind: "occlusion", severity: "warning", detail: "重叠" },
    });

    expect(navigation).toEqual({ selection: null, stage: "content", panel: "content" });
  });

  it("routes a province resource problem to the map stage with that province selected", () => {
    const navigation = resolveDeliveryIssueNavigation(documentFixture(), {
      kind: "resource",
      issue: { kind: "resource", target: "province:浙江省", detail: "贴图缺失", severity: "warning" },
    });

    expect(navigation).toEqual({ selection: { type: "province", province: "浙江省" }, stage: "map", panel: "map" });
  });

  it("routes a display-frame resource problem to the frame stage's legacy panel", () => {
    const navigation = resolveDeliveryIssueNavigation(documentFixture(), {
      kind: "resource",
      issue: { kind: "resource", target: "display-frame:card-a", detail: "缺字体", severity: "warning" },
    });

    expect(navigation).toEqual({ selection: { type: "cards" }, stage: "frame", panel: "layout" });
  });

  it("stays put when the resource target cannot be located", () => {
    const navigation = resolveDeliveryIssueNavigation(documentFixture(), {
      kind: "resource",
      issue: { kind: "resource", target: "unknown-target", detail: "?", severity: "warning" },
    });

    expect(navigation).toBeNull();
  });
});

describe("workflow navigation", () => {
  it("maps each stage to its legacy panel and progress step", () => {
    expect(resolveWorkflowStageNavigation("map")).toEqual({ panel: "map", step: "presentation" });
    expect(resolveWorkflowStageNavigation("frame")).toEqual({ panel: "layout", step: "layout" });
    expect(resolveWorkflowStageNavigation("content")).toEqual({ panel: "content", step: "local" });
    expect(resolveWorkflowStageNavigation("export")).toEqual({ panel: "deliver", step: "export" });
  });

  it("maps each legacy panel back to its stage and progress step", () => {
    expect(resolveWorkflowPanelNavigation("roster")).toEqual({ stage: "data", step: "local" });
    expect(resolveWorkflowPanelNavigation("map")).toEqual({ stage: "map", step: "presentation" });
    expect(resolveWorkflowPanelNavigation("layout")).toEqual({ stage: "frame", step: "layout" });
    expect(resolveWorkflowPanelNavigation("assets")).toEqual({ stage: "content", step: "local" });
    expect(resolveWorkflowPanelNavigation("deliver")).toEqual({ stage: "export", step: "export" });
  });
});
