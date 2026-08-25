import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import { baseMapSettings, feature, installMapLayerTestHarness, trackedRoot } from "./map-layer-test-harness";
import type { MapFeature } from "../../lib/map-data";

installMapLayerTestHarness();

describe("MapLayer uploaded map image", () => {
  it("renders an uploaded map image while preserving province selection through the SVG hit area", () => {
    const { container, root } = trackedRoot();
    const onSelectProvince = vi.fn();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: { kind: "image", assetId: "map-upload", src: "data:image/png;base64,AAAA", fit: "contain", opacity: 0.75 },
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
          onSelectProvince={onSelectProvince}
        />
      </svg>,
    ));

    const image = container.querySelector("[data-map-image]");
    const province = container.querySelector('[data-province-hit="1"]')!;
    expect(image?.getAttribute("href")).toBe("data:image/png;base64,AAAA");
    expect(image?.getAttribute("opacity")).toBe("0.75");
    flushSync(() => province.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectProvince).toHaveBeenCalledWith("北京市");

  });

  it("places aligned overlay images with rotation and keeps vector fills in overlay mode", () => {
    const { container, root } = trackedRoot();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 600, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: {
              kind: "image",
              assetId: "map-upload",
              src: "data:image/png;base64,BBBB",
              fit: "contain",
              opacity: 0.6,
              composition: "overlay",
              clipToMap: true,
              alignment: {
                sourceWidth: 1000,
                sourceHeight: 500,
                sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
                x: 40,
                y: 50,
                width: 720,
                height: 360,
                rotation: 12,
              },
            },
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map([["北京市", 2]])}
        />
      </svg>,
    ));

    const image = container.querySelector("[data-map-image]")!;
    expect(image.getAttribute("x")).toBe("40");
    expect(image.getAttribute("y")).toBe("50");
    expect(image.getAttribute("width")).toBe("720");
    expect(image.getAttribute("height")).toBe("360");
    expect(image.getAttribute("preserveAspectRatio")).toBe("none");
    expect(image.closest("[data-map-image-aligned]")?.getAttribute("transform")).toContain("rotate(12)");
    expect(container.querySelector("[data-map-image-clip]")).not.toBeNull();
    // overlay keeps vector fills visible
    expect(container.querySelector('[data-province-id="1"]')?.getAttribute("fill")).not.toBe("none");
    expect(container.querySelector('[data-province-id="1"]')?.getAttribute("fill")).not.toBeNull();

  });

  it("keeps province texture images above a replace-mode uploaded map", () => {
    const { container, root } = trackedRoot();
    const texturedFeature: MapFeature = {
      ...feature,
      geometry: {
        type: "Polygon",
        coordinates: [[[115, 39], [117, 39], [117, 41], [115, 41], [115, 39]]],
      },
    };
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: {
              kind: "image",
              assetId: "map-upload",
              src: "data:image/png;base64,MAP",
              fit: "contain",
              opacity: 1,
              composition: "replace",
            },
            ...baseMapSettings,
            provinceStyles: {
              北京市: {
                appearance: {
                  kind: "texture",
                  assetId: "province-image",
                  src: "data:image/png;base64,PROVINCE",
                  fit: "contain",
                  scale: 0.7,
                  overflow: true,
                },
              },
            },
          }}
          features={[texturedFeature]}
          counts={new Map([["北京市", 1]])}
        />
      </svg>,
    ));

    const mapImage = container.querySelector("[data-map-image]");
    const provinceImage = container.querySelector('[data-province-texture="1"]');
    expect(mapImage).not.toBeNull();
    expect(provinceImage).not.toBeNull();
    expect(provinceImage?.getAttribute("href")).toBe("data:image/png;base64,PROVINCE");
    expect(provinceImage?.getAttribute("data-province-overflow")).toBe("1");
    expect(mapImage?.compareDocumentPosition(provinceImage!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

  });

  it("hides vector fills in replace mode without alignment (legacy fit)", () => {
    const { container, root } = trackedRoot();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: {
              kind: "image",
              assetId: "map-upload",
              src: "data:image/png;base64,CCCC",
              fit: "cover",
              opacity: 1,
              composition: "replace",
            },
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
        />
      </svg>,
    ));

    const image = container.querySelector("[data-map-image]")!;
    expect(image.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    // first MapDataLayer with fills should be suppressed in replace mode
    const fills = Array.from(container.querySelectorAll('[data-province-id="1"]'));
    // borders still render in second pass; fill pass should not paint land colors when replace
    expect(fills.some((node) => node.getAttribute("fill") === "#eee" || node.getAttribute("fill") === "#123")).toBe(false);

  });
});
