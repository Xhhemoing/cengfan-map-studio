import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeWorkflowProgress } from "../lib/workflow-progress";
import { createProjectDocument } from "../lib/project-document";
import { sampleStudents } from "../lib/project-data";
import { WorkflowStepper } from "./WorkflowStepper";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("WorkflowStepper", () => {
  it("renders six compact steps and reports the selected workspace", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onChange = vi.fn();
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    flushSync(() => rootRender(container, <WorkflowStepper activeId="layout" progress={computeWorkflowProgress(project)} onChange={onChange} />));
    roots.push({ root: getRoot(container), container });

    expect(container.querySelectorAll("button")).toHaveLength(6);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("版式");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="素材"]')?.click());
    expect(onChange).toHaveBeenCalledWith("assets");
  });
});

function rootRender(container: HTMLDivElement, element: ReactNode): void {
  getRoot(container).render(element);
}

const rootMap = new WeakMap<HTMLDivElement, Root>();
function getRoot(container: HTMLDivElement): Root {
  let root = rootMap.get(container);
  if (!root) {
    root = createRoot(container);
    rootMap.set(container, root);
  }
  return root;
}
