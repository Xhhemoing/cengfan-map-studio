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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WorkflowStageStepper", () => {
  it("renders the five stage labels and reports the selected stage", () => {
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
    expect(container.textContent).toContain("版式");
    expect(container.textContent).toContain("名单");
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("版式");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="交付"]')?.click());
    expect(onChange).toHaveBeenCalledWith("export");
  });

  it("reveals the active step inside the padded scrollport after resize and stage changes", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    let scheduled: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduled = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.className = "topbar-workflow";
    container.style.paddingLeft = "10px";
    container.style.paddingRight = "10px";
    document.body.append(container);
    let width = 604;
    Object.defineProperties(container, {
      clientWidth: { get: () => width },
      scrollWidth: { value: 624 },
    });
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      container.scrollLeft = options.left ?? 0;
    });
    Object.defineProperty(container, "scrollTo", { value: scrollTo });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === container) return new DOMRect(0, 56, width, 48);
      const index = [...container.querySelectorAll("button")].indexOf(this as HTMLButtonElement);
      return new DOMRect(10 + index * 122 - container.scrollLeft, 60, 116, 40);
    });
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const progress = computeWorkflowProgress(project);
    flushSync(() => root.render(<WorkflowStageStepper activeId="content" progress={progress} onChange={vi.fn()} />));
    expect(scrollTo).not.toHaveBeenCalled();

    width = 320;
    window.dispatchEvent(new Event("resize"));
    expect(scheduled).toBeTypeOf("function");
    expect(scrollTo).not.toHaveBeenCalled();
    scheduled!(0);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 182, behavior: "instant" });
    expect(container.querySelector('[aria-current="step"]')!.getBoundingClientRect().right).toBe(310);

    flushSync(() => root.render(<WorkflowStageStepper activeId="data" progress={progress} onChange={vi.fn()} />));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "instant" });
    expect(container.scrollLeft).toBe(0);
  });
});
