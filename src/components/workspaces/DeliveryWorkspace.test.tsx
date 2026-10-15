import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryRail, DeliveryWorkspace, type DeliveryWorkspaceProps } from "./DeliveryWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";
import { serializePosterSvg } from "../../lib/export-poster";
import type { DataIssue } from "../../lib/data-health";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { ResourceHealthIssue } from "../../lib/resource-health";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
const dataIssues: DataIssue[] = [{ studentId: "s1", studentName: "林舟", kind: "missing-field", detail: "缺少城市", severity: "warning" }];
const layoutIssues: LayoutHealthIssue[] = [{ id: "map", kind: "overflow", severity: "warning", detail: "地图超出安全边距" }];
const resourceIssues: ResourceHealthIssue[] = [{ kind: "resource", target: "map", detail: "地图资源缺失", severity: "error" }];
const fontIssues: ResourceHealthIssue[] = [{ kind: "font", target: "text:title", detail: "标题字体缺失", severity: "error" }];

function renderWorkspace(overrides: Partial<DeliveryWorkspaceProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const shared = {
    project,
    dataIssues,
    layoutIssues,
    resourceIssues,
    fontIssues,
    pngScale: 2,
    transparentExport: true,
    includeResources: true,
    exportState: "idle" as const,
    onPngScaleChange: vi.fn(),
    onTransparentExportChange: vi.fn(),
    onIncludeResourcesChange: vi.fn(),
    onLocate: vi.fn(),
    onExportPng: vi.fn(),
    onExportSvg: vi.fn(),
    onExportProjectPackage: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(
    <>
      <DeliveryWorkspace {...shared} />
      <DeliveryRail {...shared} />
    </>,
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

    expect(container.querySelector('main[aria-label="交付"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
    expect(container.textContent).toContain("数据完整性");
    expect(container.textContent).toContain("排版问题");
    expect(container.textContent).toContain("资源缺失");
    expect(container.textContent).toContain("字体问题");
    expect(container.textContent).toContain("1 项");

    const locateButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((button) => button.textContent?.includes("地图"));
    flushSync(() => locateButtons[0]?.click());
    expect(onLocate).toHaveBeenCalled();
    // 仍有待处理问题时不显示正向摘要。
    expect(container.querySelector(".delivery-workspace__all-clear")).toBeNull();
  });

  it("summarizes the roster coverage when every check passes", () => {
    const container = renderWorkspace({
      project: createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }),
      dataIssues: [],
      layoutIssues: [],
      resourceIssues: [],
      fontIssues: [],
    });

    const summary = container.querySelector('[role="status"].delivery-workspace__all-clear');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("检查全部通过");
    expect(summary?.textContent).toMatch(/\d+ 人/);
    expect(summary?.textContent).toMatch(/\d+ 个省市/);
  });

  it("shows an export preview and keeps pixel/export settings visible", () => {
    const container = renderWorkspace();

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('section[aria-label="最终预览"]')).not.toBeNull();
    expect(container.querySelector('aside[aria-label="交付检查"]')).not.toBeNull();
    expect(container.querySelector('section[aria-label="导出设置"]')).not.toBeNull();
    expect(container.textContent).toContain("1500 × 1000 px");
    expect(container.querySelector("[data-export-print-size]")?.textContent).toContain("约合印刷：50.8 × 33.9 cm @ 150dpi");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="透明背景"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工程包包含资源"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="透明背景"]')?.closest("label")?.classList).toContain("boolean-control");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工程包包含资源"]')?.closest("label")?.classList).toContain("checkbox-row");
    expect(container.querySelector('[role="group"][aria-label="导出操作"]')).not.toBeNull();
  });

  it("shows the exported file name and a re-export button after a successful export", () => {
    const onRetry = vi.fn();
    const container = renderWorkspace({ exportState: "success", lastExportFileName: "我的毕业去向图-2x.png", onRetry });

    const result = container.querySelector('[role="status"]');
    expect(result?.classList).toContain("delivery-workspace__result");
    expect(result?.textContent).toContain("已导出 我的毕业去向图-2x.png");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const retry = result?.querySelector<HTMLButtonElement>('button[aria-label="再次导出"]');
    expect(retry?.disabled).toBe(false);
    flushSync(() => retry?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables the export actions while an export is running", () => {
    const actions = renderWorkspace({ exportState: "exporting" }).querySelector('[role="group"][aria-label="导出操作"]');
    expect(actions?.getAttribute("aria-busy")).toBe("true");
    const buttons = Array.from(actions?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    expect(buttons).toHaveLength(3);
    expect(buttons.filter((button) => button.disabled)).toHaveLength(3);

    const idle = renderWorkspace().querySelector('[role="group"][aria-label="导出操作"]');
    expect(idle?.getAttribute("aria-busy")).toBe("false");
    expect(Array.from(idle?.querySelectorAll<HTMLButtonElement>("button") ?? []).filter((button) => button.disabled)).toHaveLength(0);
  });

  it("keeps the success bar readable when the file name is unknown and hides it otherwise", () => {
    const withoutName = renderWorkspace({ exportState: "success" });
    const bar = withoutName.querySelector('[role="status"]');
    expect(bar?.textContent).toContain("已导出");
    expect(withoutName.querySelector('button[aria-label="再次导出"]')).not.toBeNull();

    expect(renderWorkspace({ exportState: "idle" }).querySelector(".delivery-workspace__result")).toBeNull();
    expect(renderWorkspace({ exportState: "exporting" }).querySelector(".delivery-workspace__result")).toBeNull();
    expect(renderWorkspace({ exportState: "error", exportError: "PNG 导出失败" }).querySelector('[role="status"]')).toBeNull();
  });

  it("shows retry on export error without removing the current configuration", () => {
    const onRetry = vi.fn();
    const container = renderWorkspace({ exportState: "error", exportError: "PNG 导出失败", onRetry });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("PNG 导出失败");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="重试导出"]')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("never shows a file name in the error bar", () => {
    const container = renderWorkspace({
      exportState: "error",
      exportError: "PNG 导出失败",
      lastExportFileName: "我的毕业去向图-2x.png",
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain("我的毕业去向图-2x.png");
    expect(container.textContent).not.toContain("我的毕业去向图-2x.png");
  });
  it("counts hidden source records and distinguishes download from disk save", () => {
    const privateProject = createProjectDocument({ students: [{ ...sampleStudents[0]!, visibility: false }], templateId: "original", dataView: "province" });
    const container = renderWorkspace({ project: privateProject, includeResources: false, exportState: "success" });
    expect(container.querySelector('[role="note"]')?.textContent).toContain("1 条，其中隐藏 1 条");
    expect(container.textContent).toContain("应用不能确认是否已写入磁盘");
  });

  it("identifies an empty template without declaring the roster complete and keeps exports available", () => {
    const onEditRoster = vi.fn();
    const onExportPng = vi.fn();
    const onExportSvg = vi.fn();
    const onExportProjectPackage = vi.fn();
    const container = renderWorkspace({ dataIssues: [], layoutIssues: [], resourceIssues: [], fontIssues: [], onEditRoster, onExportPng, onExportSvg, onExportProjectPackage });

    expect(container.querySelector('[data-roster-state="empty"]')?.textContent).toContain("当前是空白模板");
    expect(container.textContent).toContain("导出空白模板或工程包备份");
    expect(container.querySelector(".delivery-workspace__all-clear")).toBeNull();
    expect(container.querySelector('section[aria-label="数据完整性"] [aria-label="检查通过"]')).toBeNull();
    const edit = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "完善名单")!;
    flushSync(() => edit.click());
    expect(onEditRoster).toHaveBeenCalledOnce();
    const exportButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="导出操作"] button'));
    expect(exportButtons.every((button) => !button.disabled)).toBe(true);
    exportButtons.forEach((button) => flushSync(() => button.click()));
    expect(onExportPng).toHaveBeenCalledOnce();
    expect(onExportSvg).toHaveBeenCalledOnce();
    expect(onExportProjectPackage).toHaveBeenCalledOnce();
  });

  it("distinguishes a fully hidden roster from an empty template and explains source retention", () => {
    const hiddenProject = createProjectDocument({ students: sampleStudents.map((student) => ({ ...student, visibility: false })), templateId: "original", dataView: "province" });
    const onEditRoster = vi.fn();
    const container = renderWorkspace({ project: hiddenProject, dataIssues: [], layoutIssues: [], resourceIssues: [], fontIssues: [], onEditRoster });

    expect(container.querySelector('[data-roster-state="hidden"]')?.textContent).toContain("当前海报不显示学生");
    expect(container.textContent).toContain("完整名单有 12 人，目前全部隐藏");
    expect(container.textContent).toContain("工程包仍保存完整名单");
    expect(container.querySelector('[data-roster-state="empty"]')).toBeNull();
    expect(container.querySelector(".delivery-workspace__all-clear")).toBeNull();
    const edit = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "检查名单可见性")!;
    flushSync(() => edit.click());
    expect(onEditRoster).toHaveBeenCalledOnce();
  });

  it("separates informational roster notes from problems while keeping their locate action", () => {
    const onLocate = vi.fn();
    const info: DataIssue = { studentId: sampleStudents[0]!.id, studentName: "林舟", kind: "manual-province", detail: "使用省份覆盖：北京", severity: "info" };
    const container = renderWorkspace({ project: createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }), dataIssues: [info], layoutIssues: [], resourceIssues: [], fontIssues: [], onLocate });

    const dataCheck = container.querySelector('section[aria-label="数据完整性"]')!;
    const notes = container.querySelector('section[aria-label="数据说明"]')!;
    expect(dataCheck.textContent).toContain("0 项");
    expect(dataCheck.querySelector("button")).toBeNull();
    expect(notes.textContent).toContain("1 项说明");
    expect(notes.querySelector('[aria-label="有待处理问题"]')).toBeNull();
    expect(container.querySelector(".delivery-workspace__all-clear")?.textContent).toContain("没有待处理问题");
    expect(notes.textContent).toContain("林舟");
    flushSync(() => notes.querySelector<HTMLButtonElement>("button")!.click());
    expect(onLocate).toHaveBeenCalledExactlyOnceWith({ kind: "data", issue: info });
  });

  it("counts only warnings as pending when data warnings and informational notes coexist", () => {
    const warning = dataIssues[0]!;
    const note: DataIssue = { studentId: "s2", studentName: "陈宁", kind: "hidden", detail: "记录已隐藏，不会出现在海报中", severity: "info" };
    const container = renderWorkspace({ dataIssues: [warning, note] });

    expect(container.querySelector('section[aria-label="数据完整性"]')?.textContent).toContain("1 项待处理");
    expect(container.querySelector('section[aria-label="数据完整性"]')?.textContent).not.toContain("陈宁");
    expect(container.querySelector('section[aria-label="数据说明"]')?.textContent).toContain("陈宁");
    expect(container.querySelector(".delivery-workspace__all-clear")).toBeNull();
  });

  it("names each student so identical validation messages remain distinguishable", () => {
    const onLocate = vi.fn();
    const second: DataIssue = { ...dataIssues[0]!, studentId: "s2", studentName: "陈宁" };
    const container = renderWorkspace({ dataIssues: [dataIssues[0]!, second], onLocate });
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('section[aria-label="数据完整性"] button'));

    expect(buttons[0]!.textContent).toContain("林舟缺少城市");
    expect(buttons[1]!.textContent).toContain("陈宁缺少城市");
    expect(buttons[0]!.getAttribute("aria-label")).toContain("林舟：缺少城市");
    flushSync(() => buttons[1]!.click());
    expect(onLocate).toHaveBeenCalledExactlyOnceWith({ kind: "data", issue: second });
  });

  it("shows both named objects in overlap issues and the affected font owner", () => {
    const namedProject = { ...project, textElements: [{ ...project.textElements[0]!, id: "text-ceremony", content: "山高水长", role: "title" as const }] };
    const overlap: LayoutHealthIssue = { id: "map:text-ceremony", kind: "occlusion", severity: "warning", detail: "元素相互遮挡" };
    const font: ResourceHealthIssue = { kind: "font", target: "text:text-ceremony", detail: "字体缺失", severity: "error" };
    const onLocate = vi.fn();
    const container = renderWorkspace({ project: namedProject, layoutIssues: [overlap], fontIssues: [font], onLocate });

    const layoutButton = container.querySelector<HTMLButtonElement>('section[aria-label="排版问题"] button')!;
    const fontButton = container.querySelector<HTMLButtonElement>('section[aria-label="字体问题"] button')!;
    expect(layoutButton.textContent).toContain("地图 / 标题：山高水长");
    expect(layoutButton.textContent).toContain("元素相互遮挡");
    expect(fontButton.textContent).toContain("标题：山高水长");
    flushSync(() => layoutButton.click());
    expect(onLocate).toHaveBeenLastCalledWith({ kind: "layout", issue: overlap });
    flushSync(() => fontButton.click());
    expect(onLocate).toHaveBeenLastCalledWith({ kind: "resource", issue: font });
  });

  it("preserves the previous file while clearly marking it as an older project version", () => {
    const onRetry = vi.fn();
    const container = renderWorkspace({ exportState: "success", exportIsStale: true, lastExportFileName: "毕业去向.svg", onRetry });
    const result = container.querySelector('.delivery-workspace__result[data-export-stale="true"]')!;

    expect(result.textContent).toContain("当前版本有修改，请重新导出");
    expect(result.textContent).toContain("上次已导出 毕业去向.svg");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    flushSync(() => result.querySelector<HTMLButtonElement>('button[aria-label="再次导出"]')!.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("explains the three export formats and connects each button to its purpose", () => {
    const container = renderWorkspace();
    const help = container.querySelector('details[aria-label="导出格式说明"]')!;
    expect(help.textContent).toContain("图片分享和打印");
    expect(help.textContent).toContain("图片素材仍有分辨率限制");
    expect(help.textContent).toContain("备份与继续编辑");
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="导出操作"] button'));
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      const description = document.getElementById(button.getAttribute("aria-describedby")!);
      expect(description?.closest("details")).toBe(help);
      expect(description?.textContent?.length).toBeGreaterThan(0);
    }
  });

  it("starts with a complete preview and changes only the viewing mode at original size", () => {
    const container = renderWorkspace();
    const canvas = container.querySelector<HTMLDivElement>(".delivery-workspace__canvas")!;
    const svg = canvas.querySelector<SVGSVGElement>("svg")!;
    const exportedBefore = serializePosterSvg(svg);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="预览缩放"] button'));

    expect(canvas.dataset.previewMode).toBe("fit");
    expect(canvas.getAttribute("aria-label")).toBe("完整海报预览");
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("false");
    flushSync(() => buttons[1]!.click());
    expect(canvas.dataset.previewMode).toBe("actual");
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute("aria-label")).toBe("原始尺寸海报");
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(serializePosterSvg(svg)).toBe(exportedBefore);
    flushSync(() => buttons[0]!.click());
    expect(canvas.dataset.previewMode).toBe("fit");
    expect(canvas.hasAttribute("tabindex")).toBe(false);
    expect(serializePosterSvg(svg)).toBe(exportedBefore);
  });

  it("keeps intrinsic portrait and landscape SVG dimensions independent of preview zoom", () => {
    for (const [width, height] of [[1500, 1000], [600, 900]]) {
      const sizedProject = { ...project, canvas: { ...project.canvas, width: width!, height: height! } };
      const container = renderWorkspace({ project: sizedProject });
      const svg = container.querySelector<SVGSVGElement>(".delivery-workspace__canvas svg")!;
      const actualButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="预览缩放"] button')).find((button) => button.textContent === "原始尺寸")!;
      flushSync(() => actualButton.click());

      expect(svg.getAttribute("width")).toBe(String(width));
      expect(svg.getAttribute("height")).toBe(String(height));
      expect(svg.getAttribute("viewBox")).toBe(`0 0 ${width} ${height}`);
      expect(container.querySelector("[data-export-print-size]")).not.toBeNull();
    }
  });

  it("keeps successful checks compact and places file actions before detailed settings", () => {
    const container = renderWorkspace({ project: createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }), dataIssues: [], layoutIssues: [], resourceIssues: [], fontIssues: [] });
    const checks = Array.from(container.querySelectorAll('[data-check-state="passed"]'));

    expect(checks).toHaveLength(4);
    expect(checks.every((check) => check.querySelector("details") === null)).toBe(true);
    expect(checks.every((check) => check.querySelector("button") === null)).toBe(true);
    expect(container.querySelector(".delivery-workspace__issue-list")).toBeNull();
    const actions = container.querySelector('section[aria-label="文件导出"]')!;
    const settings = container.querySelector('section[aria-label="导出设置"]')!;
    expect(actions.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("expands warning objects by default and keeps informational details collapsible without changing locate targets", () => {
    const onLocate = vi.fn();
    const note: DataIssue = { studentId: "s2", studentName: "陈宁", kind: "hidden", detail: "记录已隐藏，不会出现在海报中", severity: "info" };
    const container = renderWorkspace({ dataIssues: [dataIssues[0]!, note], onLocate });
    const warning = container.querySelector<HTMLDetailsElement>('section[aria-label="数据完整性"] details')!;
    const information = container.querySelector<HTMLDetailsElement>('section[aria-label="数据说明"] details')!;

    expect(warning.open).toBe(true);
    expect(information.open).toBe(false);
    flushSync(() => warning.querySelector<HTMLElement>("summary")!.click());
    expect(warning.open).toBe(false);
    expect(onLocate).not.toHaveBeenCalled();
    flushSync(() => information.querySelector<HTMLElement>("summary")!.click());
    expect(information.open).toBe(true);
    flushSync(() => information.querySelector<HTMLButtonElement>("button")!.click());
    expect(onLocate).toHaveBeenCalledExactlyOnceWith({ kind: "data", issue: note });
  });

  it("keeps the full checkbox label and scale selector wired to the existing export options", () => {
    const onPngScaleChange = vi.fn();
    const onTransparentExportChange = vi.fn();
    const onIncludeResourcesChange = vi.fn();
    const container = renderWorkspace({ onPngScaleChange, onTransparentExportChange, onIncludeResourcesChange });
    const scale = container.querySelector<HTMLSelectElement>('[aria-label="PNG 导出倍率"]')!;
    const scaleLabel = container.querySelector<HTMLLabelElement>(`label[for="${scale.id}"]`)!;
    expect(scaleLabel.control).toBe(scale);
    flushSync(() => {
      scale.value = "3";
      scale.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPngScaleChange).toHaveBeenCalledExactlyOnceWith(3);
    const transparent = container.querySelector<HTMLInputElement>('[aria-label="透明背景"]')!;
    const resources = container.querySelector<HTMLInputElement>('[aria-label="工程包包含资源"]')!;
    flushSync(() => transparent.closest<HTMLLabelElement>("label")!.click());
    flushSync(() => resources.closest<HTMLLabelElement>("label")!.click());
    expect(onTransparentExportChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onIncludeResourcesChange).toHaveBeenCalledExactlyOnceWith(false);
  });

});
