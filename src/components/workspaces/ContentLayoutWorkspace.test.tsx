import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { StudioTopbar } from "../StudioTopbar";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";
import { ContentLayoutRail, ContentLayoutWorkspace } from "./ContentLayoutWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

/**
 * Shell harness: renders the topbar (with undo/redo, the position-refresh and
 * the back-to-map actions in the stage-actions slot), the center canvas
 * preview workspace and the object-property right rail, mirroring how App
 * composes the content stage.
 */
function renderWorkspace(onRefreshPositions = vi.fn(), onBackToMap = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const onPatch = vi.fn();
  const onApplyTemplate = vi.fn();
  const onApplyCustomTemplate = vi.fn();
  const onSaveTemplate = vi.fn();
  const onImportTemplateRecord = vi.fn();
  flushSync(() => root.render(
    <>
      <StudioTopbar
        stageActions={
          <>
            <ToolbarGroup label="历史">
              <ToolbarButton label="撤销内容修改" icon={null} disabled={false} onClick={vi.fn()} />
              <ToolbarButton label="重做内容修改" icon={null} disabled={false} onClick={vi.fn()} />
            </ToolbarGroup>
            <ToolbarButton label="刷新展示框位置" icon={null} onClick={onRefreshPositions} />
            <ToolbarButton label="返回地图" icon={null} onClick={onBackToMap} />
          </>
        }
        projectActions={<></>}
      />
      <ContentLayoutWorkspace
        project={project}
        selection={{ type: "canvas" }}
        userAssets={[]}
        userFonts={[]}
        canUndo
        canRedo
        undoLabel="撤销内容修改"
        redoLabel="重做内容修改"
        onSelect={vi.fn()}
        onPatch={onPatch}
        onReset={vi.fn()}
        onRefreshPositions={onRefreshPositions}
        onBackToMap={onBackToMap}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        assetPanelProps={{ onApplyBackground: vi.fn() }}
      />
      <ContentLayoutRail
        project={project}
        selection={{ type: "canvas" }}
        userAssets={[]}
        userFonts={[]}
        onPatch={onPatch}
        onReset={vi.fn()}
        assetPanelProps={{ onApplyBackground: vi.fn() }}
        templates={[
          { id: "original", name: "原版" },
          { id: "cartoon", name: "卡通" },
        ]}
        currentTemplateId="original"
        customTemplates={[{ id: "custom-1", name: "我的版式", scope: "layout" }]}
        customTemplateRecords={[]}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={onApplyCustomTemplate}
        onSaveTemplate={onSaveTemplate}
        onImportTemplateRecord={onImportTemplateRecord}
        templateAuthor="小林"
      />
    </>,
  ));
  return {
    container,
    onPatch,
    onApplyTemplate,
    onApplyCustomTemplate,
    onSaveTemplate,
  };
}

describe("ContentLayoutWorkspace", () => {
  it("renders the center canvas preview and the right rail with the object inspector and asset context", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="内容"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容大纲"]')).toBeNull();
    expect(container.querySelector('[aria-label="内容排版画布"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容对象属性"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="当前对象属性"]')).not.toBeNull();
    expect(container.querySelector('.content-layout-workspace__context .property-panel')).not.toBeNull();
    expect(container.querySelector('[aria-label="素材库"]')).not.toBeNull();
    expect(container.querySelector('.content-layout-workspace__context')?.textContent).toContain("当前对象");
    expect(container.querySelector('.content-layout-workspace__context')?.textContent).toContain("素材库");
    expect(container.querySelector('button[aria-label="仅排未手调"]')).toBeNull();
    expect(container.querySelector('button[aria-label="全部重新排版"]')).toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
  });

  it("exposes refresh and back-to-map actions in the topbar stage actions", () => {
    const onRefreshPositions = vi.fn();
    const onBackToMap = vi.fn();
    const { container } = renderWorkspace(onRefreshPositions, onBackToMap);

    const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]');
    expect(refresh?.closest(".topbar")).not.toBeNull();
    const backToMap = container.querySelector<HTMLButtonElement>('button[aria-label="返回地图"]');
    expect(backToMap?.closest(".topbar")).not.toBeNull();
    expect(container.querySelector(".content-layout-workspace__header")).toBeNull();

    flushSync(() => refresh?.click());
    flushSync(() => backToMap?.click());
    expect(onRefreshPositions).toHaveBeenCalledTimes(1);
    expect(onBackToMap).toHaveBeenCalledTimes(1);
  });

  it("collapses the asset library by default while an object is selected", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    flushSync(() => root.render(
      <ContentLayoutRail
        project={project}
        selection={{ type: "map" }}
        userAssets={[]}
        userFonts={[]}
        onPatch={vi.fn()}
        onReset={vi.fn()}
        assetPanelProps={{ onApplyBackground: vi.fn() }}
      />,
    ));

    const details = container.querySelector<HTMLDetailsElement>('details[aria-label="素材库"]');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });

  it("keeps layout management out of the canvas workspace", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[aria-label="智能排版控制"]')).toBeNull();
    expect(container.querySelector('[aria-label="排版问题提示"]')).toBeNull();
  });

  it("offers template picking and file exchange from the live content rail", () => {
    const {
      container,
      onApplyTemplate,
      onApplyCustomTemplate,
      onSaveTemplate,
    } = renderWorkspace();
    const details = container.querySelector<HTMLDetailsElement>(
      '.content-layout-workspace__context details[aria-label="整体模板与交换"]',
    );

    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelector(".template-picker")).not.toBeNull();
    expect(details?.querySelector('[aria-label="模板文件交换"]')).not.toBeNull();
    expect(details?.querySelector('input[aria-label="导入模板文件"]')).not.toBeNull();

    const buttons = Array.from(details?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    flushSync(() => buttons.find((button) => button.textContent === "卡通")?.click());
    flushSync(() => buttons.find((button) => button.textContent?.includes("我的版式"))?.click());
    flushSync(() => buttons.find((button) => button.textContent === "保存当前整体模板")?.click());

    expect(onApplyTemplate).toHaveBeenCalledWith("cartoon");
    expect(onApplyCustomTemplate).toHaveBeenCalledWith({
      id: "custom-1",
      name: "我的版式",
      scope: "layout",
    });
    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it("opens the template disclosure through a native keyboard-focusable summary", () => {
    const { container } = renderWorkspace();
    const details = container.querySelector<HTMLDetailsElement>(
      '.content-layout-workspace__context details[aria-label="整体模板与交换"]',
    );
    const summary = details?.querySelector<HTMLElement>("summary");

    expect(summary?.tagName).toBe("SUMMARY");
    expect(summary?.parentElement).toBe(details);
    expect(summary?.hasAttribute("tabindex")).toBe(false);
    expect(summary?.getAttribute("aria-hidden")).toBeNull();
    expect(summary?.textContent).toBe("整体模板与交换");

    summary?.focus();
    expect(document.activeElement).toBe(summary);

    expect(details?.open).toBe(false);
    flushSync(() => summary?.click());
    expect(details?.open).toBe(true);
  });
});
