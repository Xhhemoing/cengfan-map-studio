import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryRail, DeliveryWorkspace, type DeliveryWorkspaceProps } from "./DeliveryWorkspace";
import { createProjectDocument } from "../../lib/project-document";
import { cropMarkPathData, resolvePrintBleedGeometry } from "../../lib/print-bleed";
import type { DataIssue } from "../../lib/data-health";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { PrintPreflightResult } from "../../lib/print-preflight";
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

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
    expect(container.textContent).toContain("数据完整性");
    expect(container.textContent).toContain("排版问题");
    expect(container.textContent).toContain("资源缺失");
    expect(container.textContent).toContain("字体问题");
    expect(container.textContent).toContain("印刷检查");
    expect(container.textContent).toContain("1 项");

    const locateButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((button) => button.textContent?.includes("地图"));
    flushSync(() => locateButtons[0]?.click());
    expect(onLocate).toHaveBeenCalled();
  });

  it("shows an export preview and keeps pixel/export settings visible", () => {
    const container = renderWorkspace();

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('section[aria-label="最终预览"]')).not.toBeNull();
    expect(container.querySelector('aside[aria-label="交付检查"]')).not.toBeNull();
    expect(container.querySelector('section[aria-label="导出设置"]')).not.toBeNull();
    expect(container.textContent).toContain("1500 × 1000 px");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2");
    // WCAG 2.5.3 Label in Name：可见文字必须与 aria-label 完全一致。
    expect(container.querySelector('label[for="delivery-png-scale"]')?.textContent).toContain("PNG 导出倍率");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="透明背景"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工程包包含资源"]')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="透明背景"]')?.closest("label")?.classList).toContain("boolean-control");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工程包包含资源"]')?.closest("label")?.classList).toContain("checkbox-row");
    expect(container.querySelector('[role="group"][aria-label="导出操作"]')).not.toBeNull();
  });

  it("shows retry on export error without removing the current configuration", () => {
    const onRetry = vi.fn();
    const container = renderWorkspace({ exportState: "error", exportError: "PNG 导出失败", onRetry });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("PNG 导出失败");
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')?.value).toBe("2");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="重试导出"]')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders each check as a real list with named locate actions and text status", () => {
    const container = renderWorkspace();

    // Semantic list per check section; the buttons carry severity + detail names.
    const lists = container.querySelectorAll("ul.delivery-workspace__issue-list");
    expect(lists).toHaveLength(4);
    expect(container.querySelectorAll("ul.delivery-workspace__issue-list li button").length).toBe(4);
    expect(container.querySelector('button[aria-label="定位警告：缺少城市"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="定位错误：地图资源缺失"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="定位警告：地图超出安全边距"]')).not.toBeNull();

    // Section status is exposed as text, not only via icon color. 印刷检查 has no issues in this fixture.
    const statuses = Array.from(container.querySelectorAll(".delivery-workspace__check header .sr-only")).map((node) => node.textContent);
    expect(statuses).toEqual(["有待处理问题", "有待处理问题", "有待处理问题", "有待处理问题", "检查通过"]);
  });

  it("announces a passing check as text when a section has no issues", () => {
    const container = renderWorkspace({ dataIssues: [], layoutIssues: [], resourceIssues: [], fontIssues: [] });

    const statuses = Array.from(container.querySelectorAll(".delivery-workspace__check header .sr-only")).map((node) => node.textContent);
    expect(statuses).toEqual(["检查通过", "检查通过", "检查通过", "检查通过", "检查通过"]);
    expect(container.querySelector("ul.delivery-workspace__issue-list")).toBeNull();
  });

  it("links the export error to the retry button and action group via aria-describedby", () => {
    const container = renderWorkspace({ exportState: "error", exportError: "PNG 导出失败" });

    const error = container.querySelector('[role="alert"]')!;
    expect(error.id).toBe("delivery-export-error");
    expect(container.querySelector('button[aria-label="重试导出"]')?.getAttribute("aria-describedby")).toBe("delivery-export-error");
    expect(container.querySelector('[role="group"][aria-label="导出操作"]')?.getAttribute("aria-describedby")).toBe("delivery-export-error");

    // Without an error the reference is removed so nothing points at a missing id.
    const idle = renderWorkspace();
    expect(idle.querySelector('[role="group"][aria-label="导出操作"]')?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("names every export action and announces exporting progress politely", () => {
    const container = renderWorkspace({ exportState: "exporting" });

    expect(container.querySelector('button[aria-label="导出 PNG"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="导出 SVG"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="导出工程包"]')).not.toBeNull();
    const actionButtons = container.querySelectorAll<HTMLButtonElement>('[aria-label="导出操作"] button');
    expect(Array.from(actionButtons).every((button) => button.disabled)).toBe(true);

    const status = container.querySelector('[data-export-status]')!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("正在导出，请稍候");

    const success = renderWorkspace({ exportState: "success" });
    expect(success.querySelector('[data-export-status]')?.textContent).toBe("导出完成");
  });

  it("shows trim and media pixel sizes when print bleed is set", () => {
    const bled = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    bled.canvas.printBleedMm = 3;
    const container = renderWorkspace({ project: bled, pngScale: 2 });

    expect(container.textContent).toContain("成品尺寸（裁切后）");
    expect(container.textContent).toContain("导出尺寸（含 3mm 出血与裁切标记）");
    expect(container.textContent).toContain("已设置 3mm 印刷出血");
    expect(container.textContent).not.toContain("最终像素尺寸");
  });

  it("keeps the preview heading at trim size and notes the larger export when bleed is set", () => {
    const bled = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    bled.canvas.printBleedMm = 3;
    const container = renderWorkspace({ project: bled });

    const preview = container.querySelector('section[aria-label="最终预览"]')!;
    expect(preview.querySelector(".delivery-workspace__preview-heading")?.textContent).toContain("成品尺寸 1500 × 1000 px");
    expect(preview.textContent).toContain("导出将向外扩出 3mm 出血");
    // 舞台画布保持成品框，不随出血放大。
    expect(preview.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 1500 1000");

    // 出血为 0 时预览标题保持原样，也没有出血说明。
    const plain = renderWorkspace();
    const plainPreview = plain.querySelector('section[aria-label="最终预览"]')!;
    expect(plainPreview.querySelector(".delivery-workspace__preview-heading")?.textContent).not.toContain("成品尺寸");
    expect(plainPreview.querySelector(".delivery-workspace__preview-note")).toBeNull();
  });

  it("draws a decorative bleed ring and crop marks around the trim when bleed is set", () => {
    const bled = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    bled.canvas.printBleedMm = 3;
    const container = renderWorkspace({ project: bled });
    const preview = container.querySelector('section[aria-label="最终预览"]')!;

    // 示意层与导出共用同一份出血几何（媒体框 viewBox + 裁切标记路径）。
    const geometry = resolvePrintBleedGeometry({ x: 0, y: 0, width: 1500, height: 1000 }, { printBleedMm: 3 });
    const stage = preview.querySelector('[data-print-bleed-stage]')!;
    expect(stage).not.toBeNull();
    const overlay = stage.querySelector<SVGSVGElement>('svg[data-print-bleed-overlay]')!;
    expect(overlay.getAttribute("viewBox"))
      .toBe(`${geometry.media.x} ${geometry.media.y} ${geometry.media.width} ${geometry.media.height}`);
    expect(overlay.querySelector('[data-print-crop-marks-preview]')?.getAttribute("d")).toBe(cropMarkPathData(geometry));

    // 叠加层纯装饰、指针穿透；海报画布仍是 preview 里第一个 svg，viewBox 保持成品框。
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.style.pointerEvents).toBe("none");
    const svgs = preview.querySelectorAll("svg");
    expect(svgs[0].classList).toContain("poster");
    expect(svgs[0].getAttribute("viewBox")).toBe("0 0 1500 1000");

    // 出血为 0 时没有任何示意层。
    const plain = renderWorkspace();
    const plainPreview = plain.querySelector('section[aria-label="最终预览"]')!;
    expect(plainPreview.querySelector('[data-print-bleed-stage]')).toBeNull();
    expect(plainPreview.querySelector('[data-print-bleed-overlay]')).toBeNull();
  });

  it("keeps keyboard focus on the poster: the bleed chrome adds no tab stops and stays static", () => {
    const bled = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    bled.canvas.printBleedMm = 3;
    const container = renderWorkspace({ project: bled });
    const preview = container.querySelector('section[aria-label="最终预览"]')!;
    const stage = preview.querySelector('[data-print-bleed-stage]')!;
    const overlay = stage.querySelector<SVGSVGElement>('svg[data-print-bleed-overlay]')!;

    // 叠加层不可聚焦（focusable=false 兼容旧引擎、无 tabindex），舞台里也没有任何新增的可交互元素。
    expect(overlay.getAttribute("focusable")).toBe("false");
    expect(overlay.hasAttribute("tabindex")).toBe(false);
    expect(stage.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);

    // 预览滚动框里被命名的图像仍是成品画布本身，且不在任何 aria-hidden 子树内；装饰层对读屏隐藏。
    const poster = preview.querySelector<SVGSVGElement>("svg.poster")!;
    expect(poster.getAttribute("role")).toBe("img");
    expect(poster.getAttribute("aria-label")).toBeTruthy();
    expect(poster.closest('[aria-hidden="true"]')).toBeNull();
    expect(overlay.getAttribute("aria-hidden")).toBe("true");

    // 印前示意是静态几何：无 SMIL 动画、无内联过渡/动画，reduced-motion 下渲染结果不变。
    expect(overlay.querySelector("animate, animateTransform, animateMotion, set")).toBeNull();
    expect(overlay.getAttribute("style") ?? "").not.toMatch(/transition|animation/);
  });

  it("shrinks the bleed stage on narrow screens so the trim stays fully visible", () => {
    const bled = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    bled.canvas.printBleedMm = 3;
    const container = renderWorkspace({ project: bled });
    const geometry = resolvePrintBleedGeometry({ x: 0, y: 0, width: 1500, height: 1000 }, { printBleedMm: 3 });
    const stage = container.querySelector<HTMLElement>('[data-print-bleed-stage]')!;

    // 舞台上限是媒体框宽度、下限可缩到 0：窄屏时整体缩小，而不是溢出后被裁掉或只能横向滚动。
    const styleText = stage.querySelector("style")?.textContent ?? "";
    expect(styleText).toContain(
      `.delivery-workspace__bleed-stage { position: relative; width: min(100%, ${geometry.media.width}px); min-width: 0; }`,
    );

    // 叠加 SVG 的固有宽度会把画布网格的 auto 轨道撑到媒体宽，min(100%, …) 永远收不小；
    // 舞台注入的样式把轨道钉成 minmax(0, 1fr)，让 min() 真正生效。
    expect(styleText).toContain(
      ".delivery-workspace__canvas:has(> .delivery-workspace__bleed-stage) { grid-template-columns: minmax(0, 1fr); }",
    );

    // 出血为 0 时既没有舞台也没有任何注入样式，预览保持原样。
    const plain = renderWorkspace();
    expect(plain.querySelector('section[aria-label="最终预览"] style')).toBeNull();
  });

  it("locates object-in-bleed print issues with severity in the accessible name", () => {
    const onLocate = vi.fn();
    const printIssues: LayoutHealthIssue[] = [
      { id: "text-1", kind: "object-in-bleed", severity: "warning", detail: "text-1 落在出血区（裁切线之外），裁切后可能被切掉" },
    ];
    const container = renderWorkspace({ onLocate, printIssues });

    const section = container.querySelector('section[aria-label="印刷检查"]')!;
    const button = section.querySelector<HTMLButtonElement>('button[aria-label="定位警告：text-1 落在出血区（裁切线之外），裁切后可能被切掉"]');
    expect(button).not.toBeNull();
    flushSync(() => button?.click());
    expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({
      kind: "layout",
      issue: expect.objectContaining({ id: "text-1", kind: "object-in-bleed" }),
    }));
  });

  it("keeps export-resolution issues as real buttons marked aria-disabled with a signpost instead of locating", () => {
    const onLocate = vi.fn();
    const printPreflight: PrintPreflightResult = {
      issues: [{
        kind: "export-resolution",
        target: "export",
        detail: "PNG 1× 导出约 96dpi，低于 300dpi 印刷线；送印建议导出 SVG，由印前软件按纸张尺寸放大",
        severity: "warning",
      }],
      exportDpi: 96,
      requiredDpi: 96,
      targetDpi: 300,
      bleedMm: 3,
      measuredRasters: 0,
      unmeasured: [],
      ready: false,
    };
    const container = renderWorkspace({ onLocate, printPreflight });

    const section = container.querySelector('section[aria-label="印刷检查"]')!;
    const button = Array.from(section.querySelectorAll<HTMLButtonElement>("li button"))
      .find((candidate) => candidate.textContent?.includes("96dpi"))!;
    // 仍是可聚焦的真按钮：不是无解释的 disabled，可访问名里保留严重级别并指路到导出设置。
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("警告：PNG 1× 导出约 96dpi，低于 300dpi 印刷线；送印建议导出 SVG，由印前软件按纸张尺寸放大，见导出设置");
    expect(button.textContent).toContain("见导出设置");
    flushSync(() => button.click());
    expect(onLocate).not.toHaveBeenCalled();
  });

  it("lists print preflight issues under 印刷检查 without repeating missing fonts", () => {
    const onLocate = vi.fn();
    const printPreflight: PrintPreflightResult = {
      issues: [
        {
          kind: "transparent-bleed",
          target: "background",
          detail: "透明背景与出血冲突",
          severity: "warning",
        },
        {
          kind: "missing-font",
          target: "text:title",
          detail: "标题字体缺失，导出会回退",
          severity: "error",
        },
      ],
      exportDpi: 192,
      requiredDpi: 192,
      targetDpi: 300,
      bleedMm: 3,
      measuredRasters: 0,
      unmeasured: ["asset:remote"],
      ready: false,
    };
    const container = renderWorkspace({ onLocate, printPreflight });

    expect(container.querySelector('button[aria-label="定位警告：透明背景与出血冲突"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="定位错误：标题字体缺失，导出会回退"]')).toBeNull();
    expect(container.textContent).toContain("无法读取原图像素尺寸");
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="定位警告：透明背景与出血冲突"]')?.click());
    expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({
      kind: "print",
      issue: expect.objectContaining({ kind: "transparent-bleed", target: "background" }),
    }));
  });
});
