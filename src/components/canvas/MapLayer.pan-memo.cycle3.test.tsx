import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";

const renderCounts = vi.hoisted(() => ({ data: 0 }));

// The province subtree is what a pan must not rebuild, and MapDataLayer draws all of it
// (fills, textures, borders). A plain stub makes "MapLayer handed it the same props again"
// observable without depending on the real layer's output.
vi.mock("./MapDataLayer", () => ({
  MapDataLayer: () => {
    renderCounts.data += 1;
    return <g data-map-data-layer />;
  },
}));

import { MapLayer } from "./MapLayer";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";

const feature: MapFeature = {
  type: "Feature",
  properties: { adcode: 1, name: "北京市", center: [116, 40] },
  geometry: { type: "Polygon", coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40.5], [115.5, 40.5], [115.5, 39.5]]] },
  id: "1",
  name: "北京市",
  shortName: "北京",
  center: [116, 40],
};

const baseSettings: MapSettings = {
  x: 350, y: 120, width: 800, height: 690, scale: 1.2,
  landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true,
  edgeStyle: "solid", edgeWidth: 1, provinceStyles: {},
};

const features = [feature];
const counts = new Map([["北京市", 1]]);
const onSelectMap = vi.fn();
const onSelectProvince = vi.fn();

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const render = (settings: MapSettings) => {
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={settings}
          features={features}
          counts={counts}
          onSelectMap={onSelectMap}
          onSelectProvince={onSelectProvince}
        />
      </svg>,
    ));
  };
  return { container, render };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  renderCounts.data = 0;
});

describe("MapLayer pan cost", () => {
  it("moves the map without rebuilding the province subtree", () => {
    const { container, render } = mount();
    render(baseSettings);
    const settled = renderCounts.data;
    expect(settled).toBeGreaterThan(0);

    render({ ...baseSettings, x: baseSettings.x + 90, y: baseSettings.y + 40 });

    expect(container.querySelector("[data-map-layer]")?.getAttribute("transform"))
      .toContain("translate(440 160)");
    expect(renderCounts.data).toBe(settled);
  });

  it("still repaints provinces when an appearance setting changes", () => {
    const { render } = mount();
    render(baseSettings);
    const settled = renderCounts.data;

    // Every non-position field has to keep flowing through, or the bailout above would be
    // hiding real edits rather than skipping redundant work.
    render({ ...baseSettings, landColor: "#d05a45" });
    expect(renderCounts.data).toBeGreaterThan(settled);

    const afterFill = renderCounts.data;
    render({ ...baseSettings, landColor: "#d05a45", scale: 0.8 });
    expect(renderCounts.data).toBeGreaterThan(afterFill);

    const afterScale = renderCounts.data;
    render({
      ...baseSettings,
      landColor: "#d05a45",
      scale: 0.8,
      provinceStyles: { 北京市: { appearance: { kind: "manual-color", color: "#123456" } } },
    });
    expect(renderCounts.data).toBeGreaterThan(afterScale);
  });

  it("keeps province labels and hit targets on the panned map", () => {
    const { container, render } = mount();
    render(baseSettings);
    render({ ...baseSettings, x: baseSettings.x + 90 });

    expect(container.querySelector('[data-province-label="1"]')?.textContent).toBe("北京*");
    expect(container.querySelector('[data-province-hit="1"]')).not.toBeNull();
    expect(container.querySelector("[data-map-frame]")?.getAttribute("width")).toBe("800");
    expect(container.querySelector("[data-map-selection-overlay]")).not.toBeNull();
  });
});
