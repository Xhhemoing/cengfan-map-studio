import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";

import { MapLayer } from "./MapLayer";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";

function province(id: string, name: string, shortName: string, lon: number, lat: number): MapFeature {
  return {
    type: "Feature",
    properties: { adcode: Number(id), name, center: [lon, lat] },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [lon - 0.5, lat - 0.5],
        [lon + 0.5, lat - 0.5],
        [lon + 0.5, lat + 0.5],
        [lon - 0.5, lat + 0.5],
        [lon - 0.5, lat - 0.5],
      ]],
    },
    id,
    name,
    shortName,
    center: [lon, lat],
  };
}

const features = [province("1", "北京市", "北京", 116, 40), province("2", "浙江省", "浙江", 120, 30)];
const counts = new Map([["北京市", 3]]);

const baseSettings: MapSettings = {
  x: 350, y: 120, width: 800, height: 690, scale: 1.2,
  landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true,
  edgeStyle: "solid", edgeWidth: 1, provinceStyles: {},
};

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

function mapLayer(container: HTMLDivElement): Element {
  const layer = container.querySelector("[data-map-layer]");
  expect(layer).not.toBeNull();
  return layer!;
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("MapLayer content isolation from the map origin", () => {
  // The memo skips the whole subtree on a pan, which is only sound while nothing under it
  // reads `settings.x`/`settings.y`. A child that started reading them would render stale
  // output after a pan, and comparing against a fresh mount at the panned offset is what
  // makes that visible — the pan-memo test only counts renders, so it cannot see it.
  it("draws the panned subtree exactly as a fresh mount at the panned offset would", () => {
    const target: MapSettings = { ...baseSettings, x: baseSettings.x + 90, y: baseSettings.y - 40 };

    const incremental = mount();
    incremental.render(baseSettings);
    incremental.render(target);

    const fresh = mount();
    fresh.render(target);

    const panned = mapLayer(incremental.container);
    const rendered = mapLayer(fresh.container);

    expect(panned.innerHTML).toBe(rendered.innerHTML);
    expect(panned.getAttribute("transform")).toBe(rendered.getAttribute("transform"));
    // The comparison is only meaningful against real province output.
    expect(panned.querySelector('[data-province-hit="1"]')).not.toBeNull();
    expect(panned.innerHTML.length).toBeGreaterThan(200);
  });

  it("moves the map by the wrapper transform alone", () => {
    const { container, render } = mount();
    render(baseSettings);
    const before = mapLayer(container).innerHTML;

    render({ ...baseSettings, x: 0, y: 0 });

    const after = mapLayer(container);
    expect(after.getAttribute("transform")).toContain("translate(0 0)");
    expect(after.innerHTML).toBe(before);
  });
});
