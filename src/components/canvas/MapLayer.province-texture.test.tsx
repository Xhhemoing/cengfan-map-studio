import { describe, expect, it, vi } from "vitest";
import { geoMercator, geoPath } from "d3-geo";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import { baseMapSettings, feature, installMapLayerTestHarness, trackedRoot } from "./map-layer-test-harness";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";

installMapLayerTestHarness();

describe("MapLayer province textures", () => {
  it("centers province textures on the geometry centroid instead of the administrative center", () => {
    const asymmetricFeature: MapFeature = {
      ...feature,
      center: [116.4, 40.3],
      properties: { ...feature.properties, center: [116.4, 40.3] },
      geometry: {
        type: "Polygon",
        coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40], [116, 40], [116, 40.5], [115.5, 40.5], [115.5, 39.5]]],
      },
    };
    const settings: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true,
      ...baseMapSettings,
      provinceStyles: {
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "texture-beijing",
            src: "data:image/png;base64,AAAA",
            fit: "contain",
            overflow: true,
          },
        },
      },
    };
    const projection = geoMercator().fitExtent(
      [[0, 0], [settings.width, settings.height]],
      { type: "FeatureCollection", features: [asymmetricFeature] } as never,
    );
    const expected = geoPath(projection).centroid(asymmetricFeature as never);
    const administrativeCenter = projection(asymmetricFeature.center)!;
    expect(Math.hypot(expected[0] - administrativeCenter[0], expected[1] - administrativeCenter[1])).toBeGreaterThan(10);

    const { container, root } = trackedRoot();
    flushSync(() => root.render(
      <svg>
        <MapLayer settings={settings} features={[asymmetricFeature]} counts={new Map()} />
      </svg>,
    ));

    const texture = container.querySelector('[data-province-texture="1"]')!;
    const label = container.querySelector('[data-province-label="1"]')!;
    expect(Number(texture.getAttribute("data-texture-cx"))).toBeCloseTo(expected[0], 4);
    expect(Number(texture.getAttribute("data-texture-cy"))).toBeCloseTo(expected[1], 4);
    expect(label.getAttribute("data-label-anchor")).toBe("administrative-center");
  });

  it("selects and previews a province texture drag before committing once on pointer up", async () => {
    const settings: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
      ...baseMapSettings,
      provinceStyles: {
        北京市: { appearance: {
          kind: "texture",
          assetId: "texture-beijing",
          src: "data:image/png;base64,AAAA",
          fit: "contain",
          overflow: true,
        } },
      },
    };
    const onSelectProvince = vi.fn();
    const onMoveProvinceTexture = vi.fn();
    const { container, root } = trackedRoot();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={settings}
          features={[feature]}
          counts={new Map()}
          selectedProvince="北京市"
          onSelectProvince={onSelectProvince}
          onMoveProvinceTexture={onMoveProvinceTexture}
        />
      </svg>,
    ));

    const texture = container.querySelector<SVGImageElement>('[data-province-texture="1"]')!;
    const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="1"]')!;
    Object.assign(editor, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    const initialX = Number(texture.getAttribute("x"));
    const initialY = Number(texture.getAttribute("y"));
    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 100, clientY: 100, pointerId: 7,
    })));
    expect(onSelectProvince).toHaveBeenCalledWith("北京市");
    expect(container.querySelector('[data-province-texture-selection="1"]')).not.toBeNull();

    const moveEvent = new PointerEvent("pointermove", {
      bubbles: true, clientX: 130, clientY: 120, pointerId: 7,
    });
    expect(moveEvent.clientX).toBe(130);
    expect(moveEvent.clientY).toBe(120);
    editor.dispatchEvent(moveEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Number(container.querySelector('[data-province-texture-editor="1"]')?.getAttribute("data-texture-offset-x"))).toBeCloseTo(30, 2);
    expect(Number(container.querySelector('[data-province-texture-editor="1"]')?.getAttribute("data-texture-offset-y"))).toBeCloseTo(20, 2);
    expect(Number(texture.getAttribute("x"))).toBeCloseTo(initialX + 30, 2);
    expect(Number(texture.getAttribute("y"))).toBeCloseTo(initialY + 20, 2);
    expect(onMoveProvinceTexture).not.toHaveBeenCalled();

    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 130, clientY: 120, pointerId: 7,
    })));
    expect(onMoveProvinceTexture).toHaveBeenCalledTimes(1);
    expect(onMoveProvinceTexture).toHaveBeenCalledWith("北京市", 30, 20);
  });
});
