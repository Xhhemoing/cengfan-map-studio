import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegacyEditorChrome } from "./LegacyEditorChrome";
import type { StageSlotsContext } from "./stage-slots";
import type { StudioChrome } from "../../hooks/use-studio-chrome";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import { createProjectDocument } from "../../lib/project-document";
import type { WorkflowProgress } from "../../lib/workflow-progress";

// 画布 / 检查器 / 侧栏面板 / 步骤条等重子组件与顶栏播报无关，桩掉以聚焦被测行为。
vi.mock("../canvas/PosterCanvas", () => ({ PosterCanvas: () => <svg data-canvas-stub /> }));
vi.mock("../inspector/InspectorPanel", () => ({ InspectorPanel: () => <div data-inspector-stub /> }));
vi.mock("./LegacySidebarPanels", () => ({ LegacySidebarPanels: () => <div data-sidebar-panels-stub /> }));
vi.mock("./LegacyProjectExportDialog", () => ({ LegacyProjectExportDialog: () => null }));
vi.mock("../WorkflowStageStepper", () => ({ WorkflowStageStepper: () => <nav data-stage-stepper-stub /> }));
vi.mock("../WorkflowStepper", () => ({ WorkflowStepper: () => <nav data-workflow-stepper-stub /> }));

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildCtx(overrides: Partial<StageSlotsContext> = {}): StageSlotsContext {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const partial: Partial<StageSlotsContext> = {
    project,
    renderProject: project,
    selection: { type: "canvas" },
    selectedStudentId: null,
    userFonts: [],
    posterRef: { current: null },
    posterExport: { exportingPng: false, exportPng: vi.fn() } as unknown as StageSlotsContext["posterExport"],
    canUndo: true,
    canRedo: true,
    undoLabel: "撤销：更新地图",
    redoLabel: "重做：更新地图",
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSelect: vi.fn(),
    onPatchScene: vi.fn(),
    ...overrides,
  };
  return partial as StageSlotsContext;
}

const chromeStub = {
  themeMode: "light",
  resolvedTheme: "light",
  skin: "atelier",
  setThemeMode: vi.fn(),
  setSkin: vi.fn(),
  panelLayout: { sidebarWidth: 260, inspectorWidth: 260 },
  sidebarBounds: { min: 200, max: 360 },
  inspectorBounds: { min: 200, max: 360 },
  workspaceStyle: {},
  resizingPanel: null,
  setResizingPanel: vi.fn(),
  updatePanelWidth: vi.fn(),
} as unknown as StudioChrome;

function chromeElement(ctx: StageSlotsContext) {
  return (
    <LegacyEditorChrome
      ctx={ctx}
      chrome={chromeStub}
      activeStage="content"
      activePanel="assets"
      workflowProgress={{} as WorkflowProgress}
      summary={[]}
      syncState={{ status: "saved" } as LocalWorkspaceOverwriteState}
      statusMessage=""
      customTemplates={[]}
      showGrid={false}
      gridSize={40}
      renderIntervalMs={0}
      assistantRail={<div>助手</div>}
      projectActions={null}
      commitProject={vi.fn()}
      onStatusMessage={vi.fn()}
      onActivePanelChange={vi.fn()}
      onStageChange={vi.fn()}
      onSetActiveStage={vi.fn()}
      onSetActiveWorkflowStep={vi.fn()}
      onOpenGlobalData={vi.fn()}
      onOpenGlobalSettings={vi.fn()}
      onApplySystemTemplate={vi.fn()}
      onApplyCustomTemplate={vi.fn()}
      onSaveTemplate={vi.fn()}
      onSaveLocal={vi.fn()}
      onBackToWorkbench={vi.fn()}
    />
  );
}

function renderChrome(ctxOverrides: Partial<StageSlotsContext> = {}) {
  const ctx = buildCtx(ctxOverrides);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(chromeElement(ctx)));
  const rerender = (nextOverrides: Partial<StageSlotsContext>) => {
    const next = buildCtx(nextOverrides);
    flushSync(() => root.render(chromeElement(next)));
    return next;
  };
  return { container, ctx, rerender };
}

function click(element: Element | null): void {
  if (!element) throw new Error("element missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("LegacyEditorChrome history announcements", () => {
  it("announces undo/redo through a persistent polite live region in the topbar", () => {
    const { container, ctx } = renderChrome();

    // The region exists before any interaction (live regions must be in the
    // DOM ahead of the change to announce reliably), screen-reader-only and
    // initially empty. It sits outside the 历史与缩放 group so the narrow-screen
    // CSS that hides the whole group cannot silence the announcement.
    const region = container.querySelector('.topbar-actions [data-topbar-history-announcement]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.classList.contains("sr-only")).toBe(true);
    expect(region?.textContent).toBe("");
    expect(region?.closest('[role="group"]')).toBeNull();

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="撤销：更新地图"]');
    click(undo);
    expect(ctx.onUndo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");

    // Undoing a second, identically labelled step still mutates the DOM text
    // (an invisible suffix toggles), so aria-live re-announces it.
    const firstAnnouncement = region?.textContent;
    click(undo);
    expect(ctx.onUndo).toHaveBeenCalledTimes(2);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");
    expect(region?.textContent).not.toBe(firstAnnouncement);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="重做：更新地图"]'));
    expect(ctx.onRedo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已重做：更新地图");
    // Same node throughout: announcements never rely on a remount.
    expect(region?.isConnected).toBe(true);
  });

  it("announces the pre-click label and keeps it when history labels move on afterwards", () => {
    const { container, rerender } = renderChrome();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="撤销：更新地图"]'));
    const region = container.querySelector('[data-topbar-history-announcement]');
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");

    // After the undo the parent re-renders with the next history top; the
    // announcement still reports the step that was actually undone.
    const next = rerender({ undoLabel: "撤销：移动卡片", redoLabel: "重做：更新地图" });
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="撤销：移动卡片"]'));
    expect(next.onUndo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：移动卡片");
  });
});

describe("LegacyEditorChrome decorative topbar icons", () => {
  it("hides icons inside labelled topbar buttons from AT", () => {
    const { container } = renderChrome();

    // Buttons already expose an accessible name (aria-label or visible text);
    // their Lucide icons must be aria-hidden so AT does not double-speak them.
    const labelled = [
      'button[aria-label="撤销：更新地图"]',
      'button[aria-label="重做：更新地图"]',
      'button[aria-label="打开属性面板"]',
    ];
    for (const selector of labelled) {
      const icon = container.querySelector(`.topbar-actions ${selector} svg`);
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }

    // The export button is named by its visible text, not aria-label.
    const exportButton = [...container.querySelectorAll<HTMLButtonElement>(".topbar-actions .primary-button")]
      .find((button) => button.textContent?.includes("导出 PNG"));
    expect(exportButton).not.toBeUndefined();
    expect(exportButton?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
