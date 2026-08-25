import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents, type DataViewId } from "../../lib/project-data";
import type { SceneSelection } from "../../lib/scene-document";
import { MapStyleRail, MapStyleWorkspace } from "./MapStyleWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderWorkspace(selectedProvince?: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const onChangeDataView = vi.fn<(view: DataViewId) => void>();
  const onPatchMap = vi.fn();
  const onPatchProvince = vi.fn();
  const onSelect = vi.fn<(selection: SceneSelection) => void>();
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const workspaceProps = {
    project,
    selectedProvince: selectedProvince ?? null,
    userFonts: [] as never[],
    canUndo: true,
    canRedo: true,
    undoLabel: "撤销地图修改",
    redoLabel: "重做地图修改",
    onChangeDataView,
    onPatchMap,
    onResetMap: vi.fn(),
    onPatchProvince,
    onUndo,
    onRedo,
    onAddUserAsset: vi.fn(),
  };
  flushSync(() => root.render(
    <>
      {/* The shell renders the workspace (center) and the rail side by side. */}
      <MapStyleWorkspace
        {...workspaceProps}
        onSelect={onSelect}
      />
      <MapStyleRail {...workspaceProps} />
    </>,
  ));
  return { container, onChangeDataView, onPatchMap, onPatchProvince, onSelect, onUndo, onRedo };
}

describe("MapStyleWorkspace", () => {
  it("renders the center preview and the right rail with the five map data expressions and unified appearance controls", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图样式预览"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图对象属性"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="地图表达"] button')).toHaveLength(5);
    expect(container.textContent).toContain("省份");
    expect(container.textContent).toContain("城市");
    expect(container.textContent).toContain("院校");
    expect(container.textContent).toContain("图钉");
    expect(container.textContent).toContain("热力");
    expect(container.querySelector('[aria-label="地图样式控制"]')).toBeNull();
    expect(container.querySelector('#map-land-color')).not.toBeNull();
    expect(container.querySelector('#map-active-color')).not.toBeNull();
    expect(container.querySelector('.map-edge-styles')).not.toBeNull();
    expect(container.querySelector('button[aria-label="打开边界风格选择器"]')).not.toBeNull();
    expect(container.querySelector('#map-labels')).not.toBeNull();
    expect(container.querySelector('#map-collapse-south-sea')).not.toBeNull();
    expect(container.querySelector('#map-image-upload')).not.toBeNull();
  });

  it("switches data expressions through the supplied callback", () => {
    const { container, onChangeDataView } = renderWorkspace();
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="切换为热力表达"]');

    expect(button).not.toBeNull();
    flushSync(() => button?.click());

    expect(onChangeDataView).toHaveBeenCalledWith("heat");
  });

  it("keeps a selected province in the single right-side object inspector", () => {
    const { container, onPatchProvince } = renderWorkspace("北京市");

    expect(container.querySelector(".province-inspector")).not.toBeNull();
    expect(container.querySelector(".province-inspector")?.textContent).toContain("北京市");
    expect(container.querySelector('[aria-label="省份素材"]')).toBeNull();
    expect(onPatchProvince).not.toHaveBeenCalled();
  });

  it("gives every primary control an accessible name and announces the canvas selection", () => {
    const { container } = renderWorkspace("北京市");

    // Data-view segmented control: each button carries an explicit name + pressed state.
    const viewButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="地图表达"] button'));
    expect(viewButtons).toHaveLength(5);
    for (const button of viewButtons) {
      expect(button.getAttribute("aria-label")).toMatch(/^切换为.+表达$/);
      expect(button.hasAttribute("aria-pressed")).toBe(true);
    }
    // History buttons are named.
    expect(container.querySelector('button[aria-label="撤销地图修改"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="重做地图修改"]')).not.toBeNull();

    // The rail inspector exposes a labelled focus target for the selected province.
    const panel = container.querySelector('[data-inspector-panel]');
    expect(panel?.getAttribute("aria-label")).toBe("当前对象属性：省份 北京市");

    // The canvas announces the selected province via a polite live region.
    const announcer = container.querySelector('.map-style-workspace__canvas [data-canvas-selection-announcement]');
    expect(announcer?.getAttribute("aria-live")).toBe("polite");
    expect(announcer?.textContent).toBe("已选中省份：北京市");
  });

  it("announces undo/redo outcomes through a persistent polite live region", () => {
    const { container, onUndo, onRedo } = renderWorkspace();

    // The region is in the rail and exists before any interaction (live
    // regions must be in the DOM ahead of the change to announce reliably),
    // screen-reader-only and initially empty.
    const region = container.querySelector('[aria-label="地图对象属性"] [data-history-announcement]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.classList.contains("sr-only")).toBe(true);
    expect(region?.textContent).toBe("");

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="撤销地图修改"]');
    flushSync(() => undo?.click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销地图修改");

    // Undoing a second, identically labelled step still mutates the DOM text
    // (an invisible suffix toggles), so aria-live re-announces it.
    const firstAnnouncement = region?.textContent;
    flushSync(() => undo?.click());
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销地图修改");
    expect(region?.textContent).not.toBe(firstAnnouncement);

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="重做地图修改"]')?.click());
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已重做地图修改");
    // Same node throughout: announcements never rely on a remount.
    expect(region?.isConnected).toBe(true);
  });

  it("keeps history controls in the right-side context without a return-editor header", () => {
    const { container, onPatchMap, onUndo, onRedo } = renderWorkspace();

    flushSync(() => container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="撤销地图修改"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="重做地图修改"]')?.click());

    expect(container.querySelector(".map-style-workspace__header")).toBeNull();
    expect(container.querySelector(".map-style-workspace__context .map-style-workspace__history")).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).toBeNull();
    expect(onPatchMap).toHaveBeenCalledWith({ collapseSouthChinaSea: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
