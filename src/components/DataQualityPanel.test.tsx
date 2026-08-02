import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataQualityPanel } from "./DataQualityPanel";
import type { DataIssue } from "../lib/data-health";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(issues: DataIssue[], onSelectStudent: (id: string) => void): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<DataQualityPanel issues={issues} onSelectStudent={onSelectStudent} />));
  return container;
}

describe("DataQualityPanel", () => {
  it("renders an issue and locates its student", () => {
    const onSelectStudent = vi.fn();
    const container = render([
      {
        studentId: "student-1",
        studentName: "林舟",
        kind: "unresolved-location",
        detail: "无法定位城市：不存在",
        severity: "warning",
      },
    ], onSelectStudent);

    expect(container.textContent).toContain("林舟");
    const locate = container.querySelector<HTMLButtonElement>('button[aria-label="定位林舟"]')!;
    flushSync(() => locate.click());
    expect(onSelectStudent).toHaveBeenCalledWith("student-1");
  });

  it("shows a clean state when there are no issues", () => {
    const container = render([], vi.fn());
    expect(container.textContent).toContain("数据状态良好");
  });
});
