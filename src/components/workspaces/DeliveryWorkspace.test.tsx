import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryWorkspace } from "./DeliveryWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import type { DataIssue } from "../../lib/data-health";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { ResourceHealthIssue } from "../../lib/resource-health";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
const dataIssues: DataIssue[] = [{ studentId: "s1", studentName: "林舟", kind: "missing-field", detail: "缺少城市", severity: "warning" }];
const layoutIssues: LayoutHealthIssue[] = [{ id: "map", kind: "overflow", severity: "warning", detail: "地图超出安全边距" }];
const resourceIssues: ResourceHealthIssue[] = [{ kind: "resource", target: "map", detail: "地图资源缺失", severity: "error" }];
const fontIssues: ResourceHealthIssue[] = [{ kind: "font", target: "text:title", detail: "标题字体缺失", severity: "error" }];

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof DeliveryWorkspace>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <DeliveryWorkspace
      project={project}
      dataIssues={dataIssues}
      layoutIssues={layoutIssues}
      resourceIssues={resourceIssues}
      fontIssues={fontIssues}
      pngScale={2}
      transparentExport
      includeResources
      exportState="idle"
      onPngScaleChange={vi.fn()}
      onTransparentExportChange={vi.fn()}
      onIncludeResourcesChange={vi.fn()}
      onLocate={vi.fn()}
      onExportPng={vi.fn()}
      onExportSvg={vi.fn()}
      onExportProjectPackage={vi.fn()}
      onRetry={vi.fn()}
      onBack={vi.fn()}
      {...overrides}
    />,
  ));
  return container;
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("DeliveryWorkspace", () => {
  it("renders the four checks with counts and locates each issue", () => {
    const onLocate = vi.fn();
    const container = renderWorkspace({ onLocate });

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.textContent).toContain("数据完整性");
    expect(container.textContent).toContain("排版问题");
    expect(container.textContent).toContain("资源缺失");
    expect(container.textContent).toContain("字体问题");
    expect(container.textContent).toContain("1 项");

    const locateButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((button) => button.textContent?.includes("地图"));
    flushSync(() => locateButtons[0]?.click());
    expect(onLocate).toHaveBeenCalled();
  });

  it("shows an export preview and keeps pixel/export settings visible", () => {
    const container = renderWorkspace();

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("1500 × 1000 px");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="透明背景"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工程包包含资源"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="透明背景"]')?.closest("label")?.classList).toContain("boolean-control");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工程包包含资源"]')?.closest("label")?.classList).toContain("checkbox-row");
  });

  it("shows retry on export error without removing the current configuration", () => {
    const onRetry = vi.fn();
    const container = renderWorkspace({ exportState: "error", exportError: "PNG 导出失败", onRetry });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("PNG 导出失败");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="重试导出"]')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
