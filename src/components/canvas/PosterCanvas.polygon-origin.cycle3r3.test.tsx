import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

const keyInputs = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("../../lib/card-layout-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/card-layout-cache")>();
  return {
    ...actual,
    createCardLayoutCacheKey: (input: Parameters<typeof actual.createCardLayoutCacheKey>[0]) => {
      keyInputs.list.push(input);
      return actual.createCardLayoutCacheKey(input);
    },
  };
});

import type { CardLayoutCacheInput } from "../../lib/card-layout-cache";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
import type { ProjectDocument } from "../../lib/project-document";
import { PosterCanvas } from "./PosterCanvas";

const students = [
  { id: "student-1", name: "林舟", university: "北京大学", city: "北京市", province: "北京市", visibility: true },
  { id: "student-2", name: "沈青", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
  { id: "student-3", name: "何遥", university: "四川大学", city: "成都市", province: "四川省", visibility: true },
];

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  return { root };
}

/** The key reconstructs the solver's obstacles from `polygonOrigin`, so a divergence between
 *  the two would be invisible in the key while the solver runs on different geometry — a
 *  wrong cache hit rather than a slow one. Reported as a single first-mismatch string so a
 *  failure names the offending point instead of drowning in per-point assertions. */
function firstOriginMismatch(input: CardLayoutCacheInput): string | null {
  const origin = input.polygonOrigin;
  if (!origin) return "no polygonOrigin was passed to createCardLayoutCacheKey";
  const occupied = input.bounds.occupiedPolygons ?? [];
  if (occupied.length !== origin.polygons.length) {
    return `polygon count ${occupied.length} !== centered count ${origin.polygons.length}`;
  }
  for (const [polygonIndex, centered] of origin.polygons.entries()) {
    const absolute = occupied[polygonIndex]!;
    if (absolute.rings.length !== centered.rings.length) {
      return `polygon ${polygonIndex}: ring count ${absolute.rings.length} !== ${centered.rings.length}`;
    }
    for (const [ringIndex, centeredRing] of centered.rings.entries()) {
      const absoluteRing = absolute.rings[ringIndex]!;
      if (absoluteRing.length !== centeredRing.length) {
        return `polygon ${polygonIndex} ring ${ringIndex}: point count ${absoluteRing.length} !== ${centeredRing.length}`;
      }
      for (const [pointIndex, centeredPoint] of centeredRing.entries()) {
        const point = absoluteRing[pointIndex]!;
        const expectedX = origin.originX + centeredPoint.x;
        const expectedY = origin.originY + centeredPoint.y;
        if (point.x !== expectedX || point.y !== expectedY) {
          return `polygon ${polygonIndex} ring ${ringIndex} point ${pointIndex}: `
            + `(${point.x}, ${point.y}) !== (${expectedX}, ${expectedY})`;
        }
      }
    }
    if (Boolean(absolute.bounds) !== Boolean(centered.bounds)) {
      return `polygon ${polygonIndex}: bounds present on only one side`;
    }
    if (centered.bounds && absolute.bounds) {
      const expected = {
        x: origin.originX + centered.bounds.x,
        y: origin.originY + centered.bounds.y,
        width: centered.bounds.width,
        height: centered.bounds.height,
      };
      const actual = absolute.bounds;
      if (actual.x !== expected.x
        || actual.y !== expected.y
        || actual.width !== expected.width
        || actual.height !== expected.height) {
        return `polygon ${polygonIndex}: bounds ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`;
      }
    }
  }
  return null;
}

function ringPointCount(input: CardLayoutCacheInput): number {
  return (input.polygonOrigin?.polygons ?? []).reduce(
    (total, polygon) => total + polygon.rings.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0,
  );
}

function captured(): CardLayoutCacheInput[] {
  return keyInputs.list as CardLayoutCacheInput[];
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
  keyInputs.list.length = 0;
});

describe("PosterCanvas layout cache key polygon origin", () => {
  it("hands the key polygons that translate to exactly the solver's obstacles", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    // Each state exercises a different way the two polygon arrays could drift apart: a pan
    // moves only the origin, a recolor and a hidden province rebuild the centered array, a
    // zoom rebuilds the geometry, and allowMapOverlap must empty both sides together.
    const states: Array<[string, ProjectDocument]> = [
      ["mount", base],
      ["pan", { ...base, map: { ...base.map, x: base.map.x + 90, y: base.map.y + 40 } }],
      ["recolor", {
        ...base,
        map: {
          ...base.map,
          provinceStyles: { 北京市: { appearance: { kind: "manual-color", color: "#d05a45" } } },
        },
      }],
      ["hidden province", {
        ...base,
        map: { ...base.map, provinceStyles: { 浙江省: { visible: false } } },
      }],
      ["zoom", { ...base, map: { ...base.map, scale: base.map.scale * 0.8 } }],
      ["allow map overlap", { ...base, cards: { ...base.cards, allowMapOverlap: true } }],
    ];

    const { root } = mount();
    const seen: Array<{ label: string; inputs: CardLayoutCacheInput[] }> = [];
    for (const [label, project] of states) {
      const before = keyInputs.list.length;
      flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
      seen.push({ label, inputs: captured().slice(before) });
    }

    for (const { label, inputs } of seen) {
      expect(inputs.length, `${label} produced no layout key`).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(firstOriginMismatch(input), `${label}: `).toBeNull();
      }
    }

    // Without real province geometry every check above would hold vacuously.
    expect(ringPointCount(seen[0]!.inputs[0]!)).toBeGreaterThan(1000);
    const hidden = seen[3]!.inputs.at(-1)!;
    expect(ringPointCount(hidden)).toBeLessThan(ringPointCount(seen[0]!.inputs[0]!));
    expect(ringPointCount(seen[5]!.inputs.at(-1)!)).toBe(0);
  });

  it("keeps the origin on the map center that the solver's obstacles were built around", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { root } = mount();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const input = captured().at(-1)!;
    expect(input.polygonOrigin!.originX).toBe(project.map.x + project.map.width / 2);
    expect(input.polygonOrigin!.originY).toBe(project.map.y + project.map.height / 2);
  });
});
