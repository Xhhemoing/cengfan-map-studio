import type { ComponentProps } from "react";
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

type PanelProps = Omit<ComponentProps<typeof DataQualityPanel>, "issues" | "onSelectStudent">;

function render(issues: DataIssue[], onSelectStudent: (id: string) => void, props: PanelProps = {}): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <DataQualityPanel issues={issues} onSelectStudent={onSelectStudent} {...props} />,
  ));
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
    expect(container.querySelector("[data-clear-issue-filter]")).toBeNull();
  });

  it("never claims a clean roster when an empty list is only an empty filter", () => {
    const onClearFilter = vi.fn();
    const container = render([], vi.fn(), { filterLabel: "重复记录", onClearFilter, totalIssues: 4 });

    expect(container.textContent).not.toContain("数据状态良好");
    expect(container.textContent).toContain("没有「重复记录」记录");
    expect(container.textContent).toContain("还有 4 项其他状态");
    flushSync(() => container.querySelector<HTMLButtonElement>("[data-clear-issue-filter]")!.click());
    expect(onClearFilter).toHaveBeenCalled();
  });

  it("names the active filter and how much of the roster it hides", () => {
    const container = render([
      {
        studentId: "student-1",
        studentName: "林舟",
        kind: "duplicate",
        detail: "姓名、院校、城市和去向类型与其他记录一致",
        severity: "warning",
      },
    ], vi.fn(), { filterLabel: "重复记录", onClearFilter: vi.fn(), totalIssues: 3 });

    expect(container.textContent).toContain("已筛选「重复记录」· 1 项，另有 2 项未显示");
  });

  it("omits the clear action when the caller has no filter to clear", () => {
    const container = render([], vi.fn(), { filterLabel: "定位问题", totalIssues: 0 });

    expect(container.textContent).not.toContain("数据状态良好");
    expect(container.querySelector("[data-clear-issue-filter]")).toBeNull();
  });
});
