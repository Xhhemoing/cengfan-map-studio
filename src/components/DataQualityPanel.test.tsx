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

function render(issues: DataIssue[], onSelectStudent: (id: string) => void, embedded = false): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<DataQualityPanel issues={issues} onSelectStudent={onSelectStudent} embedded={embedded} />));
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
    expect(container.querySelector('section[aria-label="数据质量"]')).not.toBeNull();
    expect(container.querySelector(".panel-heading")?.textContent).toContain("数据质量");
    expect(container.querySelector(".panel-heading")?.textContent).toContain("0 项提醒 · 0 项说明");
  });

  it("keeps issue details and location actions when embedded without a repeated heading", () => {
    const onSelectStudent = vi.fn();
    const container = render([
      { studentId: "student-1", studentName: "林舟", kind: "hidden", detail: "记录已隐藏", severity: "info" },
    ], onSelectStudent, true);

    expect(container.querySelector(".panel-heading")).toBeNull();
    expect(container.querySelector('section[aria-label="数据质量"]')).toBeNull();
    expect(container.querySelector('[aria-label="名单质量项目"]')?.textContent).toContain("隐藏记录 · 记录已隐藏");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="定位林舟"]')!.click());
    expect(onSelectStudent).toHaveBeenCalledWith("student-1");
  });
});
