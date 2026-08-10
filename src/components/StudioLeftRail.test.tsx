import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLeftRail } from "./StudioLeftRail";
import { createProjectDocument } from "../lib/project-document";
import { sampleStudents } from "../lib/project-data";
import { computeWorkflowProgress } from "../lib/workflow-progress";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderLeftRail() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onChangeStage = vi.fn();
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  flushSync(() => root.render(
    <StudioLeftRail
      activeStage="map"
      project={project}
      progress={computeWorkflowProgress(project)}
      onChangeStage={onChangeStage}
    />,
  ));
  return { container, root, onChangeStage };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("StudioLeftRail", () => {
  it("renders a single labelled left rail containing only the six-stage navigation", () => {
    const { container } = renderLeftRail();

    const rails = container.querySelectorAll('[aria-label="编辑器左侧栏"]');
    expect(rails).toHaveLength(1);
    const rail = rails[0]!;
    expect(rail.querySelectorAll(".workflow-stage-stepper button")).toHaveLength(6);

    const nav = rail.querySelector(".studio-left-rail__nav");
    expect(nav).not.toBeNull();
    // The assistant / advanced-function content no longer lives in the rail.
    expect(rail.querySelector(".studio-left-rail__content")).toBeNull();
    expect(rail.querySelectorAll(".workflow-stage-stepper").length).toBe(1);
  });

  it("forwards stage navigation clicks to onChangeStage", () => {
    const { container, onChangeStage } = renderLeftRail();

    flushSync(() => container.querySelector<HTMLButtonElement>('.workflow-stage-stepper button[aria-label="数据与素材"]')?.click());

    expect(onChangeStage).toHaveBeenCalledWith("data");
  });
});
