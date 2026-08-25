import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

const capturedBounds = vi.hoisted(() => [] as unknown[]);

vi.mock("../../lib/card-layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/card-layout")>();
  return {
    ...actual,
    solveCardLayout: (...args: Parameters<typeof actual.solveCardLayout>) => {
      capturedBounds.push(args[1]);
      return actual.solveCardLayout(...args);
    },
  };
});

import type { CardLayoutBounds, CardPolygon } from "../../lib/card-layout";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
import { PosterCanvas } from "./PosterCanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  return { root };
}

function latestBounds(): CardLayoutBounds {
  expect(capturedBounds.length).toBeGreaterThan(0);
  return capturedBounds[capturedBounds.length - 1] as CardLayoutBounds;
}

function expectTranslatedPolygons(
  before: readonly CardPolygon[],
  after: readonly CardPolygon[],
  deltaX: number,
  deltaY: number,
) {
  expect(after).toHaveLength(before.length);
  for (let polygonIndex = 0; polygonIndex < before.length; polygonIndex += 1) {
    const beforePolygon = before[polygonIndex]!;
    const afterPolygon = after[polygonIndex]!;
    expect(afterPolygon.rings).toHaveLength(beforePolygon.rings.length);

    for (let ringIndex = 0; ringIndex < beforePolygon.rings.length; ringIndex += 1) {
      const beforeRing = beforePolygon.rings[ringIndex]!;
      const afterRing = afterPolygon.rings[ringIndex]!;
      expect(afterRing).toHaveLength(beforeRing.length);
      for (let pointIndex = 0; pointIndex < beforeRing.length; pointIndex += 1) {
        expect(afterRing[pointIndex]!.x).toBeCloseTo(beforeRing[pointIndex]!.x + deltaX, 8);
        expect(afterRing[pointIndex]!.y).toBeCloseTo(beforeRing[pointIndex]!.y + deltaY, 8);
      }
    }

    expect(afterPolygon.bounds!.x).toBeCloseTo(beforePolygon.bounds!.x + deltaX, 8);
    expect(afterPolygon.bounds!.y).toBeCloseTo(beforePolygon.bounds!.y + deltaY, 8);
    expect(afterPolygon.bounds!.width).toBeCloseTo(beforePolygon.bounds!.width, 8);
    expect(afterPolygon.bounds!.height).toBeCloseTo(beforePolygon.bounds!.height, 8);
  }
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
  capturedBounds.length = 0;
});

describe("PosterCanvas province polygons during map pan", () => {
  it("translates every solver polygon by the map pan delta", () => {
    const project = createProjectDocument({
      students: [
        {
          id: "student-1",
          name: "林舟",
          university: "北京大学",
          city: "北京市",
          province: "北京市",
          visibility: true,
        },
      ],
      templateId: "original",
      dataView: "province",
    });
    const deltaX = 73;
    const deltaY = -41;
    const panned = {
      ...project,
      map: {
        ...project.map,
        x: project.map.x + deltaX,
        y: project.map.y + deltaY,
      },
    };
    const { root } = mount();

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    const before = latestBounds();
    expect(before.occupiedPolygons!.length).toBeGreaterThan(0);

    flushSync(() => root.render(<PosterCanvas project={panned} exportMode />));
    const after = latestBounds();

    expectTranslatedPolygons(
      before.occupiedPolygons!,
      after.occupiedPolygons!,
      deltaX,
      deltaY,
    );
  });
});
