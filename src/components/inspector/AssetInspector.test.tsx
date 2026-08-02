import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetInspector } from "./AssetInspector";
import type { AssetElement } from "../../lib/scene-document";

const landmark: AssetElement = {
  id: "landmark-1",
  assetId: "source-1",
  label: "北京地标",
  src: "data:image/svg+xml,%3Csvg/%3E",
  kind: "landmark",
  province: "北京市",
  x: 120,
  y: 240,
  width: 140,
  height: 100,
  rotation: 18,
  opacity: 0.7,
  zIndex: 2,
  visibility: true,
};

const texture: AssetElement = {
  ...landmark,
  id: "texture-1",
  label: "北京纹理",
  kind: "province-texture",
  x: 0,
  y: 0,
  width: 600,
  height: 420,
  rotation: 0,
  province: "北京市",
};

const decoration: AssetElement = {
  ...landmark,
  id: "decoration-1",
  label: "校徽装饰",
  kind: "decoration",
  province: undefined,
  x: 420,
  y: 520,
  width: 90,
  height: 90,
  rotation: 0,
};

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(asset: AssetElement, callbacks: Partial<React.ComponentProps<typeof AssetInspector>> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <AssetInspector
      asset={asset}
      onPatch={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
      onLayerChange={vi.fn()}
      {...callbacks}
    />,
  ));
  return container;
}

describe("AssetInspector", () => {
  it("shows landmark identity and defers transform control patches", () => {
    const onPatch = vi.fn();
    const container = render(landmark, { onPatch });

    expect(container.textContent).toContain("北京地标");
    expect(container.textContent).toContain("北京市");
    expect(container.querySelector("#asset-x")).not.toBeNull();
    expect(container.querySelector("#asset-y")).not.toBeNull();
    expect(container.querySelector("#asset-width")).not.toBeNull();
    expect(container.querySelector("#asset-height")).not.toBeNull();
    expect(container.querySelector("#asset-rotation")).not.toBeNull();
    expect(container.querySelector("#asset-opacity")).not.toBeNull();
    expect(container.querySelector("#asset-visible")).not.toBeNull();

    const width = container.querySelector<HTMLInputElement>("#asset-width")!;
    flushSync(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(width, "180");
      width.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => width.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ width: 180 });
  });

  it("keeps province texture bound to its province without free-position controls", () => {
    const onPatch = vi.fn();
    const onLayerChange = vi.fn();
    const container = render(texture, { onPatch, onLayerChange });

    expect(container.textContent).toContain("旧省份贴图实例");
    expect(container.textContent).toContain("地图底纹");
    expect(container.textContent).toContain("北京市");
    expect(container.querySelector("#asset-x")).toBeNull();
    expect(container.querySelector("#asset-y")).toBeNull();
    expect(container.querySelector("#asset-width")).toBeNull();
    expect(container.querySelector("#asset-height")).toBeNull();
    expect(container.querySelector("#asset-opacity")).not.toBeNull();
    expect(container.querySelector("#asset-visible")).not.toBeNull();

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="素材上移"]')?.click());
    expect(onLayerChange).toHaveBeenCalledWith(1);
  });

  it("supports decoration geometry, duplication, and deletion by instance id", () => {
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const container = render(decoration, { onDelete, onDuplicate });

    expect(container.textContent).toContain("普通装饰");
    expect(container.querySelector("#asset-x")).not.toBeNull();
    expect(container.querySelector("#asset-y")).not.toBeNull();
    expect(container.querySelector("#asset-width")).not.toBeNull();
    expect(container.querySelector("#asset-height")).not.toBeNull();
    expect(container.querySelector("#asset-rotation")).toBeNull();

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="复制素材"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="删除素材"]')?.click());
    expect(onDuplicate).toHaveBeenCalledWith("decoration-1");
    expect(onDelete).toHaveBeenCalledWith("decoration-1");
  });
});
