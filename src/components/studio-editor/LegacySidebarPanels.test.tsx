import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegacySidebarPanels } from "./LegacySidebarPanels";
import type { StageSlotsContext } from "./stage-slots";
import type { ActivePanel } from "../../lib/app-constants";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import { createProjectDocument } from "../../lib/project-document";

// 名单 / 素材 / 地图检查器等重子组件与被测的模板、交付按钮无关，桩掉以聚焦被测行为。
vi.mock("../DataWorkspace", () => ({ DataWorkspace: () => <div data-data-workspace-stub /> }));
vi.mock("../AssetPanel", () => ({ AssetPanel: () => <div data-asset-panel-stub /> }));
vi.mock("../inspector/MapInspector", () => ({ MapInspector: () => <div data-map-inspector-stub /> }));

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildCtx(): StageSlotsContext {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const partial: Partial<StageSlotsContext> = {
    project,
    renderProject: project,
    selection: { type: "canvas" },
    posterExport: {
      exportingPng: false,
      exportPng: vi.fn(),
      exportSvg: vi.fn(),
      openProjectExportDialog: vi.fn(),
    } as unknown as StageSlotsContext["posterExport"],
    onSelect: vi.fn(),
    onPatchScene: vi.fn(),
    onResetScene: vi.fn(),
  };
  return partial as StageSlotsContext;
}

function renderPanels(activePanel: ActivePanel) {
  const ctx = buildCtx();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    ctx,
    activePanel,
    summary: [],
    syncState: { status: "saved" } as LocalWorkspaceOverwriteState,
    customTemplates: [],
    commitProject: vi.fn(),
    onStatusMessage: vi.fn(),
    onActivePanelChange: vi.fn(),
    onApplySystemTemplate: vi.fn(),
    onApplyCustomTemplate: vi.fn(),
    onSaveTemplate: vi.fn(),
    onSaveLocal: vi.fn(),
  };
  flushSync(() => root.render(<LegacySidebarPanels {...props} />));
  return { container, ctx, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("LegacySidebarPanels decorative icons", () => {
  it("hides the save-template button icon in the layout panel from AT", () => {
    const { container, props } = renderPanels("layout");

    const saveButton = [...container.querySelectorAll<HTMLButtonElement>("button.wide-button")]
      .find((button) => button.textContent?.includes("保存当前整体模板"));
    expect(saveButton).not.toBeUndefined();
    expect(saveButton!.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    // 面板内不允许出现未隐藏的装饰性 svg。
    for (const icon of container.querySelectorAll("svg")) {
      expect(icon.getAttribute("aria-hidden"), `svg inside "${icon.closest("button")?.textContent?.trim()}"`).toBe("true");
    }

    flushSync(() => saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it("hides the PNG export icon and every delivery action icon in the deliver panel from AT", () => {
    const { container, ctx } = renderPanels("deliver");

    const exportButton = container.querySelector<HTMLButtonElement>("button.workflow-export-button");
    expect(exportButton).not.toBeNull();
    expect(exportButton!.textContent).toContain("导出 PNG");
    expect(exportButton!.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    // ImageDown（导出 PNG）+ CompactButton 的 Download / Save / PackageOpen。
    const icons = [...container.querySelectorAll("svg")];
    expect(icons.length).toBe(4);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden"), `svg inside "${icon.closest("button")?.textContent?.trim()}"`).toBe("true");
    }

    flushSync(() => exportButton!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(ctx.posterExport.exportPng).toHaveBeenCalledTimes(1);
  });
});
