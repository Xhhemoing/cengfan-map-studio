import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents, type DataViewId } from "../../lib/project-data";
import type { SceneSelection } from "../../lib/scene-document";
import { MapStyleWorkspace } from "./MapStyleWorkspace";

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
  const onClose = vi.fn();
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  flushSync(() => root.render(
    <MapStyleWorkspace
      project={project}
      selectedProvince={selectedProvince ?? null}
      userFonts={[]}
      canUndo
      canRedo
      undoLabel="撤销地图修改"
      redoLabel="重做地图修改"
      onChangeDataView={onChangeDataView}
      onPatchMap={onPatchMap}
      onResetMap={vi.fn()}
      onPatchProvince={onPatchProvince}
      onSelect={onSelect}
      onClose={onClose}
      onUndo={onUndo}
      onRedo={onRedo}
      onAddUserAsset={vi.fn()}
    />,
  ));
  return { container, onChangeDataView, onPatchMap, onPatchProvince, onSelect, onClose, onUndo, onRedo };
}

describe("MapStyleWorkspace", () => {
  it("presents the five map data expressions and unified appearance controls", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="地图表达"] button')).toHaveLength(5);
    expect(container.textContent).toContain("省份");
    expect(container.textContent).toContain("城市");
    expect(container.textContent).toContain("院校");
    expect(container.textContent).toContain("图钉");
    expect(container.textContent).toContain("热力");
    expect(container.querySelector('[aria-label="地图对象属性"]')).not.toBeNull();
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

  it("routes map and history controls to the existing transaction boundary", () => {
    const { container, onPatchMap, onUndo, onRedo, onClose } = renderWorkspace();

    flushSync(() => container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="撤销地图修改"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="重做地图修改"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')?.click());

    expect(onPatchMap).toHaveBeenCalledWith({ collapseSouthChinaSea: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
