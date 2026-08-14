import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { MapDataLayer } from "./MapDataLayer";

const features: MapFeature[] = [
  {
    type: "Feature",
    properties: { adcode: 1, name: "北京市", center: [116, 40] },
    geometry: { type: "Polygon", coordinates: [] },
    id: "beijing",
    name: "北京市",
    shortName: "北京",
    center: [116, 40],
  },
  {
    type: "Feature",
    properties: { adcode: 2, name: "浙江省", center: [120, 30] },
    geometry: { type: "Polygon", coordinates: [] },
    id: "zhejiang",
    name: "浙江省",
    shortName: "浙江",
    center: [120, 30],
  },
  {
    type: "Feature",
    properties: { adcode: 3, name: "四川省", center: [104, 30] },
    geometry: { type: "Polygon", coordinates: [] },
    id: "sichuan",
    name: "四川省",
    shortName: "四川",
    center: [104, 30],
  },
];

const settings = (overrides: Record<string, unknown> = {}) => ({
  x: 0,
  y: 0,
  width: 800,
  height: 690,
  scale: 1,
  landColor: "#eeeeee",
  activeColor: "#123456",
  edgeColor: "#456789",
  showProvinceLabels: true,
  edgeStyle: "solid",
  edgeWidth: 1,
  provinceStyles: {},
  ...overrides,
} as unknown as MapSettings);

function renderMap(overrides: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <svg>
      <MapDataLayer
        settings={settings(overrides)}
        features={features}
        counts={new Map([["北京市", 2], ["浙江省", 10]])}
        dataView="heat"
        heatColors={["#d9f0e5", "#8ccfb6", "#237a62"]}
        path={() => "M0 0 H100 V100 H0 Z"}
        bounds={() => [[0, 0], [100, 100]]}
        center={() => [40, 55]}
      />
    </svg>,
  ));
  return { container, root };
}

describe("MapDataLayer", () => {
  it("normalizes heat colors against the highest active province count", () => {
    const { container, root } = renderMap({ fillMode: "heat" });

    expect(container.querySelector('[data-province-id="beijing"]')?.getAttribute("fill")).toBe("#d9f0e5");
    expect(container.querySelector('[data-province-id="zhejiang"]')?.getAttribute("fill")).toBe("#237a62");

    root.unmount();
    container.remove();
  });

  it("uses configured heat depths and colors while retaining manual province overrides", () => {
    const { container, root } = renderMap({
      fillMode: "heat",
      heatScale: {
        minDepth: 2,
        maxDepth: 10,
        lowColor: "#dceeff",
        highColor: "#174a7c",
      },
      provinceStyles: {
        北京市: { appearance: { kind: "manual-color", color: "#e56a54" } },
      },
    });

    expect(container.querySelector('[data-province-id="beijing"]')?.getAttribute("fill")).toBe("#e56a54");
    expect(container.querySelector('[data-province-id="zhejiang"]')?.getAttribute("fill")).toBe("#174a7c");

    root.unmount();
    container.remove();
  });

  it("applies a deterministic poster palette to active provinces and keeps manual overrides", () => {
    const { container, root } = renderMap({
      fillMode: "manual",
      dataPalette: "playful",
      provinceStyles: {
        北京市: { appearance: { kind: "manual-color", color: "#102030" } },
      },
    });

    expect(container.querySelector('[data-province-id="beijing"]')?.getAttribute("fill")).toBe("#102030");
    expect(["#e95646", "#f3c847", "#efb8c6", "#3d8fc2", "#263b78"]).toContain(
      container.querySelector('[data-province-id="zhejiang"]')?.getAttribute("fill"),
    );

    root.unmount();
    container.remove();
  });

  it("shows the canvas background through zero-count provinces when enabled", () => {
    const { container, root } = renderMap({ emptyProvinceFill: "transparent" });

    expect(container.querySelector('[data-province-id="sichuan"]')?.getAttribute("fill")).toBe("transparent");

    root.unmount();
    container.remove();
  });

  it("uses a single centered clipped texture image instead of a tiling pattern fill", () => {
    const { container, root } = renderMap({
      provinceStyles: {
        浙江省: {
          appearance: {
            kind: "texture",
            assetId: "asset-zhejiang",
            src: "data:image/png;base64,zhejiang",
            fit: "contain",
            scale: 0.5,
            opacity: 0.4,
            overflow: false,
          },
          fill: "#ff0000",
        },
      },
    });

    // underfill remains a solid color; image is a separate single node
    expect(container.querySelector('[data-province-id="zhejiang"]')?.getAttribute("fill")).toBe("#ff0000");
    expect(container.querySelector("#province-texture-zhejiang")).toBeNull();
    const image = container.querySelector('[data-province-texture="zhejiang"]');
    expect(image).not.toBeNull();
    expect(image?.getAttribute("href")).toBe("data:image/png;base64,zhejiang");
    expect(image?.getAttribute("preserveAspectRatio")).toBe("none");
    expect(image?.getAttribute("data-texture-scale")).toBe("0.5");
    expect(image?.getAttribute("opacity")).toBe("0.4");
    expect(image?.getAttribute("data-texture-mode")).toBe("single");
    expect(image?.getAttribute("clip-path")).toContain("province-texture-clip-zhejiang");
    // scale 0.5 of 100x100 bounds, centered on (40,55)
    expect(Number(image?.getAttribute("width"))).toBeCloseTo(50);
    expect(Number(image?.getAttribute("height"))).toBeCloseTo(50);
    expect(Number(image?.getAttribute("x"))).toBeCloseTo(15);
    expect(Number(image?.getAttribute("y"))).toBeCloseTo(30);
    // only one image node for the province — no pattern tiling
    expect(container.querySelectorAll('[data-province-texture="zhejiang"]')).toHaveLength(1);

    root.unmount();
    container.remove();
  });

  it("distinguishes province-stretched sizing from natural image aspect ratio", () => {
    const { container, root } = renderMap({
      provinceStyles: {
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "asset-beijing",
            src: "data:image/png;base64,beijing",
            fit: "contain",
            scale: 1,
            overflow: false,
            sizingMode: "province",
          },
        },
        浙江省: {
          appearance: {
            kind: "texture",
            assetId: "asset-zhejiang-natural",
            src: "data:image/png;base64,zhejiang-natural",
            fit: "contain",
            scale: 1,
            overflow: false,
            sizingMode: "natural",
          },
        },
      },
    });

    expect(container.querySelector('[data-province-texture="beijing"]')?.getAttribute("preserveAspectRatio")).toBe("none");
    expect(container.querySelector('[data-province-texture="zhejiang"]')?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");

    root.unmount();
    container.remove();
  });

  it("uses one explicit image box for every province when uniform texture size is enabled", () => {
    const { container, root } = renderMap({
      provinceTextureUniformSize: { enabled: true, width: 72, height: 44 },
      provinceStyles: {
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "asset-beijing",
            src: "data:image/png;base64,beijing",
            fit: "contain",
            scale: 1,
            overflow: false,
            sizingMode: "province",
          },
        },
        浙江省: {
          appearance: {
            kind: "texture",
            assetId: "asset-zhejiang",
            src: "data:image/png;base64,zhejiang",
            fit: "contain",
            scale: 0.5,
            overflow: false,
            sizingMode: "natural",
          },
        },
      },
    });

    for (const image of container.querySelectorAll("[data-province-texture]")) {
      expect(Number(image.getAttribute("width"))).toBeCloseTo(72);
      expect(Number(image.getAttribute("height"))).toBeCloseTo(44);
      expect(image.getAttribute("data-texture-uniform")).toBe("true");
    }

    root.unmount();
    container.remove();
  });

  it("separates nearby overflow textures inside the map bounds", () => {
    const closeCenters: Record<string, [number, number]> = {
      beijing: [80, 70],
      zhejiang: [95, 78],
      sichuan: [88, 92],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapDataLayer
          settings={settings({
            width: 220,
            height: 160,
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
          })}
          features={features}
          counts={new Map()}
          dataView="province"
          path={() => "M0 0 H100 V100 H0 Z"}
          bounds={() => [[0, 0], [100, 100]]}
          center={(feature) => closeCenters[feature.id]}
        />
      </svg>,
    ));

    const images = Array.from(container.querySelectorAll<SVGImageElement>("[data-province-texture]"));
    expect(images).toHaveLength(3);
    const rects = images.map((image) => ({
      x: Number(image.getAttribute("x")),
      y: Number(image.getAttribute("y")),
      width: Number(image.getAttribute("width")),
      height: Number(image.getAttribute("height")),
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
    container.remove();
  });

  it("renders multi-layer decorative province borders", () => {
    const { container, root } = renderMap({
      edgeStyle: "double",
      edgeWidth: 2,
      edgeColor: "#215d75",
    });

    const edges = container.querySelectorAll('[data-province-edge="zhejiang"]');
    expect(edges.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-edge-layer="underlay"]')).not.toBeNull();
    expect(container.querySelector('[data-edge-layer="stroke"]')).not.toBeNull();

    root.unmount();
    container.remove();
  });

  it("injects glow filters for soft-glow borders", () => {
    const { container, root } = renderMap({
      edgeStyle: "soft-glow",
      edgeWidth: 1.5,
    });

    expect(container.querySelector('[data-edge-filter="soft-glow"]')).not.toBeNull();
    expect(container.querySelector('[data-edge-layer="underlay"]')?.getAttribute("filter")).toContain("map-edge-soft-glow");

    root.unmount();
    container.remove();
  });

  it("renders overflow textures above solid fills so they are not covered by pure color", () => {
    const { container, root } = renderMap({
      provinceStyles: {
        浙江省: {
          appearance: {
            kind: "texture",
            assetId: "asset-zhejiang",
            src: "data:image/png;base64,zhejiang",
            fit: "contain",
            scale: 1,
            overflow: true,
          },
        },
      },
    });

    const fill = container.querySelector('[data-province-id="zhejiang"]');
    const image = container.querySelector('[data-province-overflow="zhejiang"]')
      ?? container.querySelector('[data-province-texture="zhejiang"]');
    expect(fill).not.toBeNull();
    expect(image).not.toBeNull();
    expect(image?.getAttribute("clip-path")).toBeNull();
    expect(container.querySelector("#province-texture-zhejiang")).toBeNull();

    // DOM order: image must appear after the province fill path so it paints on top
    const nodes = Array.from(container.querySelectorAll("[data-province-id=\"zhejiang\"], [data-province-texture=\"zhejiang\"], [data-province-overflow=\"zhejiang\"]"));
    expect(nodes[0]?.getAttribute("data-province-id")).toBe("zhejiang");
    expect(nodes[nodes.length - 1]?.getAttribute("data-province-overflow")
      ?? nodes[nodes.length - 1]?.getAttribute("data-province-texture")).toBe("zhejiang");

    root.unmount();
    container.remove();
  });
});
