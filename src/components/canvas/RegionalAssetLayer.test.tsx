import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { RegionalAssetLayer } from "./RegionalAssetLayer";
import type { MapFeature } from "../../lib/map-data";
import type { AssetElement, MapSettings } from "../../lib/scene-document";

const settings: MapSettings = {
  x: 100,
  y: 120,
  width: 600,
  height: 420,
  scale: 1,
  landColor: "#eef0ee",
  activeColor: "#215d75",
  edgeColor: "#c4cbd1",
  edgeStyle: "solid",
  edgeWidth: 1,
  showProvinceLabels: false,
  provinceStyles: {},
};

const features: MapFeature[] = [
  {
    type: "Feature",
    id: "110000",
    name: "北京市",
    shortName: "北京",
    center: [116.4, 39.9],
    properties: { adcode: 110000, name: "北京市", center: [116.4, 39.9] },
    geometry: { type: "Polygon", coordinates: [] },
  },
  {
    type: "Feature",
    id: "330000",
    name: "浙江省",
    shortName: "浙江",
    center: [120.1, 30.2],
    properties: { adcode: 330000, name: "浙江省", center: [120.1, 30.2] },
    geometry: { type: "Polygon", coordinates: [] },
  },
];

const texture: AssetElement = {
  id: "texture-1",
  assetId: "source-texture",
  label: "北京纹理",
  src: "data:image/svg+xml,%3Csvg/%3E",
  kind: "province-texture",
  province: "北京市",
  x: 0,
  y: 0,
  width: 120,
  height: 120,
  rotation: 0,
  opacity: 0.7,
  zIndex: 1,
  visibility: true,
};

const landmark: AssetElement = {
  id: "landmark-1",
  assetId: "source-landmark",
  label: "北京地标",
  src: "data:image/svg+xml,%3Csvg/%3E",
  kind: "landmark",
  province: "北京市",
  x: 260,
  y: 340,
  width: 80,
  height: 60,
  rotation: 18,
  opacity: 0.6,
  zIndex: 3,
  visibility: true,
};

function renderLayer(props: Partial<React.ComponentProps<typeof RegionalAssetLayer>> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <svg>
      <RegionalAssetLayer
        settings={settings}
        features={features}
        path={(feature) => feature.id === "110000" ? "M0 0 H300 V180 H0 Z" : "M300 180 H560 V390 H300 Z"}
        assets={[texture, landmark]}
        {...props}
      />
    </svg>,
  ));
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLDivElement) {
  flushSync(() => root.unmount());
  container.remove();
}

describe("RegionalAssetLayer", () => {
  it("clips every visible province texture to its matching province path", () => {
    const second = { ...texture, id: "texture-2", label: "北京纹理二", zIndex: 2 };
    const { container, root } = renderLayer({ assets: [texture, second] });

    const clips = Array.from(container.querySelectorAll("clipPath"));
    const textures = Array.from(container.querySelectorAll("[data-province-texture]"));
    expect(clips).toHaveLength(2);
    expect(new Set(clips.map((clip) => clip.id)).size).toBe(2);
    expect(textures).toHaveLength(2);
    expect(textures.every((image) => image.getAttribute("clip-path")?.startsWith("url(#province-clip-"))).toBe(true);
    expect(textures[0]?.getAttribute("opacity")).toBe("0.7");

    cleanup(root, container);
  });

  it("renders landmarks in z-index order with instance geometry", () => {
    const lower = { ...landmark, id: "landmark-low", zIndex: 1 };
    const higher = { ...landmark, id: "landmark-high", zIndex: 4, x: 360 };
    const onSelectAsset = vi.fn();
    const { container, root } = renderLayer({
      assets: [higher, lower],
      selectedAssetId: "landmark-low",
      onSelectAsset,
    });

    const images = Array.from(container.querySelectorAll("[data-landmark]"));
    expect(images.map((image) => image.getAttribute("data-landmark"))).toEqual(["landmark-low", "landmark-high"]);
    expect(images[0]?.getAttribute("x")).toBe("260");
    expect(images[0]?.getAttribute("y")).toBe("340");
    expect(images[0]?.getAttribute("width")).toBe("80");
    expect(images[0]?.getAttribute("height")).toBe("60");
    expect(images[0]?.getAttribute("opacity")).toBe("0.6");
    expect(images[0]?.parentElement?.getAttribute("transform")).toBe("rotate(18 300 370)");
    expect(container.querySelector('[data-asset-selection="landmark-low"]')).not.toBeNull();
    flushSync(() => images[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectAsset).toHaveBeenCalledWith("landmark-low");

    cleanup(root, container);
  });

  it("skips hidden assets, reports broken images, and omits overlays during export", () => {
    const onAssetLoadError = vi.fn();
    const editor = renderLayer({
      assets: [
        { ...texture, id: "hidden", visibility: false },
        { ...landmark, id: "selected" },
      ],
      selectedAssetId: "selected",
      onAssetLoadError,
    });
    expect(editor.container.querySelector('[data-asset-id="hidden"]')).toBeNull();
    const image = editor.container.querySelector('[data-landmark="selected"]')!;
    flushSync(() => image.dispatchEvent(new Event("error", { bubbles: true })));
    expect(onAssetLoadError).toHaveBeenCalledWith("selected");
    expect(editor.container.querySelector('[data-asset-selection="selected"]')).not.toBeNull();
    cleanup(editor.root, editor.container);

    const exported = renderLayer({
      assets: [{ ...landmark, id: "selected" }],
      selectedAssetId: "selected",
      exportMode: true,
    });
    expect(exported.container.querySelector('[data-landmark="selected"]')).not.toBeNull();
    expect(exported.container.querySelector('[data-asset-selection="selected"]')).toBeNull();
    cleanup(exported.root, exported.container);
  });

  it("renders resize handles for selected landmark", () => {
    const onResizeAsset = vi.fn();
    const { container, root } = renderLayer({
      assets: [landmark],
      selectedAssetId: "landmark-1",
      onResizeAsset,
    });

    const handles = container.querySelectorAll("[data-resize-handles]");
    expect(handles.length).toBe(1);
    expect(handles[0]?.querySelector("[data-resize-handle='se']")).not.toBeNull();

    cleanup(root, container);
  });

  it("commits landmark movement once on pointer up", () => {
    const onMoveAsset = vi.fn();
    const { container, root } = renderLayer({ onMoveAsset });
    const group = container.querySelector('[data-landmark="landmark-1"]')?.parentElement!;

    flushSync(() => {
      group.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 260, clientY: 340 }));
      group.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 280, clientY: 365 }));
    });
    expect(onMoveAsset).not.toHaveBeenCalled();

    flushSync(() => group.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 280, clientY: 365 })));
    expect(onMoveAsset).toHaveBeenCalledTimes(1);
    expect(onMoveAsset).toHaveBeenCalledWith("landmark-1", 280, 365);

    cleanup(root, container);
  });

  it("does not commit a move for a plain click without movement", () => {
    const onMoveAsset = vi.fn();
    const { container, root } = renderLayer({ onMoveAsset });
    const group = container.querySelector('[data-landmark="landmark-1"]')?.parentElement!;

    flushSync(() => {
      group.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 260, clientY: 340 }));
      group.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 260, clientY: 340 }));
    });
    expect(onMoveAsset).not.toHaveBeenCalled();

    cleanup(root, container);
  });

  it("captures the pointer and ignores non-primary buttons on drag start", () => {
    const onMoveAsset = vi.fn();
    const { container, root } = renderLayer({ onMoveAsset });
    const group = container.querySelector('[data-landmark="landmark-1"]')?.parentElement!;
    const capture = vi.fn();
    (group as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = capture;

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: 260, clientY: 340 })));
    expect(capture).toHaveBeenCalledWith(7);

    // right-click must not start a drag
    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 8, clientX: 260, clientY: 340, button: 2 })));
    expect(capture).toHaveBeenCalledTimes(1);

    cleanup(root, container);
  });

  it("limits landmark drag preview paints while committing the final position immediately", () => {
    vi.useFakeTimers();
    const onMoveAsset = vi.fn();
    const { container, root } = renderLayer({ onMoveAsset, renderIntervalMs: 100 });
    const group = container.querySelector<SVGGElement>('[data-asset-group="landmark-1"]')!;
    const image = container.querySelector<SVGImageElement>('[data-landmark="landmark-1"]')!;

    flushSync(() => {
      group.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 260, clientY: 340 }));
      group.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 280, clientY: 365 }));
    });
    expect(image.getAttribute("x")).toBe("260");

    flushSync(() => vi.advanceTimersByTime(100));
    expect(image.getAttribute("x")).toBe("280");
    expect(image.getAttribute("y")).toBe("365");

    flushSync(() => group.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 295, clientY: 380 })));
    expect(onMoveAsset).toHaveBeenCalledOnce();
    expect(onMoveAsset).toHaveBeenCalledWith("landmark-1", 295, 380);
    expect(image.getAttribute("x")).toBe("260");

    cleanup(root, container);
    vi.useRealTimers();
  });
});
