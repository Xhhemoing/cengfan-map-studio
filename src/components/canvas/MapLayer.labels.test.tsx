import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import { baseMapSettings, feature, installMapLayerTestHarness, trackedRoot } from "./map-layer-test-harness";

installMapLayerTestHarness();

describe("MapLayer province labels", () => {
  it("renders the selected province label font over the map-wide font", () => {
    const { container, root } = trackedRoot();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true,
            provinceLabelFontId: "font-system-serif",
            ...baseMapSettings,
            provinceStyles: { 北京市: { labelFontId: "font-system-kaiti" } },
          }}
          features={[feature]}
          counts={new Map()}
        />
      </svg>,
    ));

    expect(container.querySelector('[data-province-label="1"]')?.getAttribute("font-family")).toContain("KaiTi");
  });

  it("positions province labels at the projected administrative center", () => {
    const { container, root } = trackedRoot();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{ x: 0, y: 0, width: 800, height: 690, scale: 1, landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true, ...baseMapSettings }}
          features={[feature]}
          counts={new Map()}
        />
      </svg>,
    ));
    const label = container.querySelector('[data-province-label="1"]')!;
    expect(Number(label.getAttribute("x"))).toBeGreaterThan(0);
    expect(Number(label.getAttribute("y"))).toBeGreaterThan(0);
    expect(label.getAttribute("data-label-anchor")).toBe("administrative-center");
    expect(label.textContent).toBe("北京");
  });
});
