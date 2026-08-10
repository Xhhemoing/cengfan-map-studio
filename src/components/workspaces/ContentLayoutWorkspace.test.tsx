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
  flushSync(() => root.render(
    <>
      <StudioTopbar
        stageActions={
          <>
            <ToolbarGroup label="历史与缩放">
              <ToolbarButton label="撤销内容修改" icon={null} disabled={false} onClick={vi.fn()} />
              <ToolbarButton label="重做内容修改" icon={null} disabled={false} onClick={vi.fn()} />
            </ToolbarGroup>
            <ToolbarButton label="刷新展示框位置" icon={null} onClick={onRefreshPositions} />
            <ToolbarButton label="返回地图样式" icon={null} onClick={onBackToMap} />
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
      />
    </>,
  ));
  return { container, onPatch };
}

describe("ContentLayoutWorkspace", () => {
  it("renders the center canvas preview and the right rail with the object inspector and asset context", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容大纲"]')).toBeNull();
    expect(container.querySelector('[aria-label="内容排版画布"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容对象属性"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="当前对象属性"]')).not.toBeNull();
    expect(container.querySelector('.content-layout-workspace__context .property-panel')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容素材上下文"]')).not.toBeNull();
    expect(container.querySelector('.content-layout-workspace__context')?.textContent).toContain("当前对象");
    expect(container.querySelector('.content-layout-workspace__context')?.textContent).toContain("素材与实例");
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
    const backToMap = container.querySelector<HTMLButtonElement>('button[aria-label="返回地图样式"]');
    expect(backToMap?.closest(".topbar")).not.toBeNull();
    expect(container.querySelector(".content-layout-workspace__header")).toBeNull();

    flushSync(() => refresh?.click());
    flushSync(() => backToMap?.click());
    expect(onRefreshPositions).toHaveBeenCalledTimes(1);
    expect(onBackToMap).toHaveBeenCalledTimes(1);
  });

  it("keeps layout management out of the canvas workspace", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[aria-label="智能排版控制"]')).toBeNull();
    expect(container.querySelector('[aria-label="排版问题提示"]')).toBeNull();
  });
});
