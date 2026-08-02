import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { MapDataLayer } from "./MapDataLayer";

const features: MapFeature[] = ["a", "b", "c"].map((id, index) => ({
  type: "Feature",
  properties: { adcode: index + 1, name: id, center: [0, 0] },
  geometry: { type: "Polygon", coordinates: [] },
  id,
  name: id,
  shortName: id,
  center: [0, 0],
}));

describe("province texture overlap rendering", () => {
  it("separates nearby overflow textures inside the map bounds", () => {
    const centers: Record<string, [number, number]> = { a: [80, 70], b: [95, 78], c: [88, 92] };
    const settings = {
      x: 0, y: 0, width: 220, height: 160, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456",
      showProvinceLabels: true, edgeStyle: "solid", edgeWidth: 1,
      provinceTextureUniformSize: { enabled: true, width: 72, height: 44 },
      provinceStyles: Object.fromEntries(features.map((feature) => [feature.name, {
        appearance: {
          kind: "texture",
          assetId: `asset-${feature.id}`,
          src: `data:image/png;base64,${feature.id}`,
          fit: "contain",
          scale: 1,
          overflow: true,
          sizingMode: "natural",
        },
      }])),
    } as unknown as MapSettings;
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapDataLayer
          settings={settings}
          features={features}
          counts={new Map()}
          dataView="province"
          path={() => "M0 0 H100 V100 H0 Z"}
          bounds={() => [[0, 0], [100, 100]]}
          center={(feature) => centers[feature.id]}
        />
      </svg>,
    ));

    const images = Array.from(container.querySelectorAll<SVGImageElement>("[data-province-texture]"));
    expect(images).toHaveLength(3);
    const rects = images.map((image) => ({
      x: Number(image.getAttribute("x")), y: Number(image.getAttribute("y")),
      width: Number(image.getAttribute("width")), height: Number(image.getAttribute("height")),
    }));
    for (let index = 0; index < rects.length; index += 1) {
      const first = rects[index]!;
      expect(first.x).toBeGreaterThanOrEqual(0);
      expect(first.y).toBeGreaterThanOrEqual(0);
      expect(first.x + first.width).toBeLessThanOrEqual(220);
      expect(first.y + first.height).toBeLessThanOrEqual(160);
      for (let other = index + 1; other < rects.length; other += 1) {
        const second = rects[other]!;
        const overlaps = !(
          first.x + first.width + 4 <= second.x
          || second.x + second.width + 4 <= first.x
          || first.y + first.height + 4 <= second.y
          || second.y + second.height + 4 <= first.y
        );
        expect(overlaps).toBe(false);
      }
    }
    expect(images.some((image) => image.getAttribute("data-texture-adjusted") === "true")).toBe(true);
    root.unmount();
  });

  it("starts a manual drag from the automatically adjusted visible position", async () => {
    const settings = {
      x: 0, y: 0, width: 220, height: 160, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456",
      showProvinceLabels: true, edgeStyle: "solid", edgeWidth: 1,
      provinceTextureUniformSize: { enabled: true, width: 72, height: 44 },
      provinceStyles: Object.fromEntries(features.slice(0, 2).map((feature) => [feature.name, {
        appearance: {
          kind: "texture", assetId: `asset-${feature.id}`, src: feature.id,
          fit: "contain", overflow: true, sizingMode: "natural",
        },
      }])),
    } as unknown as MapSettings;
    const onMoveProvinceTexture = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapDataLayer
          settings={settings}
          features={features.slice(0, 2)}
          counts={new Map()}
          dataView="province"
          path={() => "M0 0 H100 V100 H0 Z"
          }
          bounds={() => [[0, 0], [100, 100]]}
          center={() => [90, 80]}
          onSelectProvince={vi.fn()}
          onMoveProvinceTexture={onMoveProvinceTexture}
        />
      </svg>,
    ));
    const adjusted = container.querySelector<SVGImageElement>('[data-province-texture="b"]')!;
    expect(adjusted.getAttribute("data-texture-adjusted")).toBe("true");
    const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="b"]')!;
    Object.assign(editor, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const visibleX = Number(adjusted.getAttribute("x"));
    const visibleY = Number(adjusted.getAttribute("y"));

    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100, pointerId: 1 })));
    editor.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 110, clientY: 105, pointerId: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Number(adjusted.getAttribute("x"))).toBeCloseTo(visibleX + 10, 2);
    expect(Number(adjusted.getAttribute("y"))).toBeCloseTo(visibleY + 5, 2);
    root.unmount();
  });
});
