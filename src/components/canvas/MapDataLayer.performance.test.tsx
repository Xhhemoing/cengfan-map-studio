import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { MapDataLayer } from "./MapDataLayer";

const features: MapFeature[] = ["a", "b"].map((id, index) => ({
  type: "Feature",
  properties: { adcode: index + 1, name: id, center: [0, 0] },
  geometry: { type: "Polygon", coordinates: [] },
  id,
  name: id,
  shortName: id,
  center: [0, 0],
}));

const settings = {
  x: 0, y: 0, width: 220, height: 160, scale: 1,
  landColor: "#eee", activeColor: "#123", edgeColor: "#456",
  showProvinceLabels: true, edgeStyle: "solid", edgeWidth: 1,
  provinceTextureUniformSize: { enabled: true, width: 72, height: 44 },
  provinceStyles: Object.fromEntries(features.map((feature) => [feature.name, {
    appearance: {
      kind: "texture", assetId: `asset-${feature.id}`, src: feature.id,
      fit: "contain", overflow: true, sizingMode: "natural",
    },
  }])),
} as unknown as MapSettings;

/**
 * `path` only runs while React renders, so counting its calls measures render passes
 * without mocking the component under test.
 */
function mountTextureLayer(renderIntervalMs = 0) {
  const path = vi.fn(() => "M0 0 H100 V100 H0 Z");
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <svg>
      <MapDataLayer
        settings={settings}
        features={features}
        counts={new Map()}
        dataView="province"
        path={path}
        bounds={() => [[0, 0], [100, 100]]}
        center={() => [90, 80]}
        renderIntervalMs={renderIntervalMs}
        onSelectProvince={vi.fn()}
        onMoveProvinceTexture={vi.fn()}
      />
    </svg>,
  ));
  const image = container.querySelector<SVGImageElement>('[data-province-texture="a"]')!;
  const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="a"]')!;
  Object.assign(editor, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
  return { container, root, path, image, editor };
}

function dragFrames(editor: SVGGElement, frames: number) {
  editor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100, pointerId: 3 }));
  for (let frame = 1; frame <= frames; frame += 1) {
    editor.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 100 + frame, clientY: 100 + frame * 2, pointerId: 3,
    }));
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MapDataLayer texture drag rendering", () => {
  it("keeps the render count flat while a texture drag emits many pointer frames", async () => {
    const { container, root, path, image, editor } = mountTextureLayer();
    const mountedCalls = path.mock.calls.length;
    const initialX = Number(image.getAttribute("x"));
    const initialY = Number(image.getAttribute("y"));

    dragFrames(editor, 40);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(path.mock.calls.length).toBe(mountedCalls);
    expect(Number(image.getAttribute("x"))).toBeCloseTo(initialX + 40, 2);
    expect(Number(image.getAttribute("y"))).toBeCloseTo(initialY + 80, 2);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("does not grow render work when the frame count grows", async () => {
    const short = mountTextureLayer();
    const shortBaseline = short.path.mock.calls.length;
    dragFrames(short.editor, 5);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const shortRenders = short.path.mock.calls.length - shortBaseline;
    flushSync(() => short.root.unmount());
    short.container.remove();

    const long = mountTextureLayer();
    const longBaseline = long.path.mock.calls.length;
    dragFrames(long.editor, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const longRenders = long.path.mock.calls.length - longBaseline;
    flushSync(() => long.root.unmount());
    long.container.remove();

    expect(shortRenders).toBe(0);
    expect(longRenders).toBe(0);
  });

  it("coalesces preview writes into one attribute update per render interval", () => {
    vi.useFakeTimers();
    const { container, root, image, editor } = mountTextureLayer(100);
    const initialX = Number(image.getAttribute("x"));

    dragFrames(editor, 25);
    expect(Number(image.getAttribute("x"))).toBeCloseTo(initialX, 2);

    vi.advanceTimersByTime(100);
    expect(Number(image.getAttribute("x"))).toBeCloseTo(initialX + 25, 2);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("commits a single rounded offset when the drag ends", () => {
    const path = vi.fn(() => "M0 0 H100 V100 H0 Z");
    const onMoveProvinceTexture = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapDataLayer
          settings={settings}
          features={features}
          counts={new Map()}
          dataView="province"
          path={path}
          bounds={() => [[0, 0], [100, 100]]}
          center={() => [90, 80]}
          onSelectProvince={vi.fn()}
          onMoveProvinceTexture={onMoveProvinceTexture}
        />
      </svg>,
    ));
    const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="a"]')!;
    Object.assign(editor, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const startOffsetX = Number(editor.getAttribute("data-texture-offset-x"));
    const startOffsetY = Number(editor.getAttribute("data-texture-offset-y"));

    dragFrames(editor, 12);
    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 112, clientY: 124, pointerId: 3,
    })));

    expect(onMoveProvinceTexture).toHaveBeenCalledTimes(1);
    expect(onMoveProvinceTexture).toHaveBeenCalledWith("a", Math.round(startOffsetX + 12), Math.round(startOffsetY + 24));

    flushSync(() => root.unmount());
    container.remove();
  });
});
