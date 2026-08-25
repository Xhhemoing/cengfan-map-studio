// 仅供 MapLayer 测试使用的共享装置：从 src/components/canvas/MapLayer.test.tsx
// 原样搬出的省份要素样本、地图基础设置与挂载登记，供按域拆分后的
// src/components/canvas/MapLayer.*.test.tsx 共用。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach } from "vitest";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";

export const feature: MapFeature = {
  type: "Feature",
  properties: { adcode: 1, name: "北京市", center: [116, 40] },
  geometry: { type: "Polygon", coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40.5], [115.5, 40.5], [115.5, 39.5]]] },
  id: "1",
  name: "北京市",
  shortName: "北京",
  center: [116, 40],
};

export const baseMapSettings: Pick<MapSettings, "edgeStyle" | "edgeWidth" | "provinceStyles"> = {
  edgeStyle: "solid",
  edgeWidth: 1,
  provinceStyles: {},
};

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

export function trackedRoot() {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  return { container, root };
}

/**
 * Registers the file-level teardown every MapLayer suite depends on.
 *
 * An assertion throwing before an inline unmount would leave the root mounted for
 * the rest of the run, racing React's scheduler against jsdom teardown. Every case in
 * these files mounts, so the drain belongs to the harness rather than to each suite.
 * The `setupFiles` leaked-root guard reports a missing net, it does not stand in for one.
 */
export function installMapLayerTestHarness(): void {
  afterEach(() => {
    flushSync(() => {
      for (const { root, container } of mounted.splice(0)) {
        root.unmount();
        container.remove();
      }
    });
  });
}
