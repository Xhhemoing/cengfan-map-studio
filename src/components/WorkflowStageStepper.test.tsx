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
});
