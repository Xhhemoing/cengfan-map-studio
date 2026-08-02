import { describe, expect, it, vi } from "vitest";
import { geoMercator, geoPath } from "d3-geo";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { MapDataLayer } from "./MapDataLayer";
import { MapLayer } from "./MapLayer";

const feature: MapFeature = {
  type: "Feature",
  properties: { adcode: 1, name: "北京市", center: [116.4, 40.3] },
  geometry: {
    type: "Polygon",
    coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40], [116, 40], [116, 40.5], [115.5, 40.5], [115.5, 39.5]]],
  },
  id: "1",
  name: "北京市",
  shortName: "北京",
  center: [116.4, 40.3],
};

function settings(styles: MapSettings["provinceStyles"]): MapSettings {
  return {
    x: 0,
    y: 0,
    width: 800,
    height: 690,
    scale: 1,
    landColor: "#eee",
    activeColor: "#123",
    edgeColor: "#456",
    showProvinceLabels: true,
    edgeStyle: "solid",
    edgeWidth: 1,
    provinceStyles: styles,
  };
}

describe("province texture positioning", () => {
  it("anchors textures at the geometry centroid while labels keep the administrative center", () => {
    const mapSettings = settings({ 北京市: { appearance: {
      kind: "texture",
      assetId: "texture-beijing",
      src: "data:image/png;base64,AAAA",
      fit: "contain",
      overflow: true,
    } } });
    const projection = geoMercator().fitExtent(
      [[0, 0], [mapSettings.width, mapSettings.height]],
      { type: "FeatureCollection", features: [feature] } as never,
    );
    const expected = geoPath(projection).centroid(feature as never);
    const administrativeCenter = projection(feature.center)!;
    expect(Math.hypot(expected[0] - administrativeCenter[0], expected[1] - administrativeCenter[1])).toBeGreaterThan(10);

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<svg><MapLayer settings={mapSettings} features={[feature]} counts={new Map()} /></svg>));

    const texture = container.querySelector('[data-province-texture="1"]')!;
    const label = container.querySelector('[data-province-label="1"]')!;
    expect(Number(texture.getAttribute("data-texture-cx"))).toBeCloseTo(expected[0], 4);
    expect(Number(texture.getAttribute("data-texture-cy"))).toBeCloseTo(expected[1], 4);
    expect(Number(label.getAttribute("x"))).toBeCloseTo(administrativeCenter[0], 4);
    expect(Number(label.getAttribute("y"))).toBeCloseTo(administrativeCenter[1], 4);
    root.unmount();
  });

  it("previews drag locally and commits one rounded map-local offset on pointer up", async () => {
    const onSelectProvince = vi.fn();
    const onMoveProvinceTexture = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<svg><MapLayer
      settings={settings({ 北京市: { appearance: {
        kind: "texture", assetId: "texture-beijing", src: "beijing.png", fit: "contain", overflow: true,
      } } })}
      features={[feature]}
      counts={new Map()}
      selectedProvince="北京市"
      onSelectProvince={onSelectProvince}
      onMoveProvinceTexture={onMoveProvinceTexture}
    /></svg>));

    const image = container.querySelector<SVGImageElement>('[data-province-texture="1"]')!;
    const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="1"]')!;
    Object.assign(editor, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const initialX = Number(image.getAttribute("x"));
    const initialY = Number(image.getAttribute("y"));

    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100, pointerId: 7 })));
    editor.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 130.4, clientY: 119.6, pointerId: 7 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSelectProvince).toHaveBeenCalledWith("北京市");
    expect(Number(image.getAttribute("x"))).toBeCloseTo(initialX + 30.4, 1);
    expect(Number(image.getAttribute("y"))).toBeCloseTo(initialY + 19.6, 1);
    expect(onMoveProvinceTexture).not.toHaveBeenCalled();

    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 130.4, clientY: 119.6, pointerId: 7 })));
    expect(onMoveProvinceTexture).toHaveBeenCalledTimes(1);
    expect(onMoveProvinceTexture).toHaveBeenCalledWith("北京市", 30, 20);
    root.unmount();
  });

  it("starts the first manual drag at an automatically adjusted visible rectangle", async () => {
    const features = ["a", "b"].map((id, index): MapFeature => ({
      ...feature,
      id,
      name: id,
      shortName: id,
      properties: { ...feature.properties, adcode: index + 1, name: id },
    }));
    const mapSettings = settings(Object.fromEntries(features.map((item) => [item.name, { appearance: {
      kind: "texture", assetId: `asset-${item.id}`, src: item.id, fit: "contain", overflow: true, sizingMode: "natural",
    } }])));
    mapSettings.width = 220;
    mapSettings.height = 160;
    mapSettings.provinceTextureUniformSize = { enabled: true, width: 72, height: 44 };

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<svg><MapDataLayer
      settings={mapSettings}
      features={features}
      counts={new Map()}
      dataView="province"
      path={() => "M0 0 H100 V100 H0 Z"}
      bounds={() => [[0, 0], [100, 100]]}
      center={() => [90, 80]}
      onSelectProvince={vi.fn()}
      onMoveProvinceTexture={vi.fn()}
    /></svg>));

    const image = container.querySelector<SVGImageElement>('[data-province-texture="b"]')!;
    expect(image.getAttribute("data-texture-adjusted")).toBe("true");
    const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="b"]')!;
    Object.assign(editor, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const visibleX = Number(image.getAttribute("x"));
    const visibleY = Number(image.getAttribute("y"));

    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100, pointerId: 1 })));
    editor.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 110, clientY: 105, pointerId: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Number(image.getAttribute("x"))).toBeCloseTo(visibleX + 10, 2);
    expect(Number(image.getAttribute("y"))).toBeCloseTo(visibleY + 5, 2);
    root.unmount();
  });
});
