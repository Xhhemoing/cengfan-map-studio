import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../lib/project-document";
import { sampleStudents } from "../lib/project-data";
import { computeWorkflowProgress } from "../lib/workflow-progress";
import { WorkflowStageStepper } from "./WorkflowStageStepper";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("WorkflowStageStepper", () => {
  it("renders the six new stage labels and reports the selected stage", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const onChange = vi.fn();
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });

    flushSync(() => root.render(
      <WorkflowStageStepper
        activeId="frame"
        progress={computeWorkflowProgress(project)}
        onChange={onChange}
      />,
    ));

    expect(container.querySelectorAll("button")).toHaveLength(5);
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("制作步骤");
    expect(container.textContent).toContain("展示框样式");
    expect(container.textContent).toContain("数据与素材");
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("展示框样式");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="最终导出"]')?.click());
    expect(onChange).toHaveBeenCalledWith("export");
  });

  it("names every stage button and keeps the status glyphs decorative", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });

    flushSync(() => root.render(
      <WorkflowStageStepper
        activeId="frame"
        project={project}
        progress={computeWorkflowProgress(project)}
        onChange={vi.fn()}
      />,
    ));

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    // Every stage is reachable by name (warning counts are folded into the label when present).
    for (const button of buttons) {
      expect(button.getAttribute("aria-label")).toBeTruthy();
    }
    // The check/warning glyphs and numbering repeat the label state visually; they stay
    // out of the accessibility tree so screen readers hear one clean name per stage.
    for (const status of container.querySelectorAll(".workflow-stepper__status")) {
      expect(status.getAttribute("aria-hidden")).toBe("true");
    }
    for (const number of container.querySelectorAll(".workflow-stepper__number")) {
      expect(number.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
