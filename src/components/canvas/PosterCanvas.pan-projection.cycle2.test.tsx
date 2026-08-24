import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

const geoCalls = vi.hoisted(() => ({ projectPoint: 0, stream: 0 }));

vi.mock("d3-geo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("d3-geo")>();
  return {
    ...actual,
    // A proxy rather than a wrapper function: d3's fluent setters hand back the projection
    // itself, and `geoPath` reads `stream` off whatever `fitExtent` returned. Counting
    // `stream` covers the ring traversal behind `mapPath.bounds`.
    geoMercator: () => {
      const projection = actual.geoMercator();
      const counted: typeof projection = new Proxy(projection, {
        apply(target, thisArg, args) {
          geoCalls.projectPoint += 1;
          return Reflect.apply(target as never, thisArg, args);
        },
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            if (property === "stream") geoCalls.stream += 1;
            const result = (value as (...called: unknown[]) => unknown).apply(target, args);
            return result === target ? counted : result;
          };
        },
      });
      return counted;
    },
  };
});

vi.mock("./MapLayer", () => ({ MapLayer: () => <g data-map-layer /> }));
vi.mock("./RegionalAssetLayer", () => ({ RegionalAssetLayer: () => null }));
vi.mock("./DecorationLayer", () => ({ DecorationLayer: () => null }));
vi.mock("./TextLayer", () => ({ TextLayer: () => null }));

const layoutKeys = vi.hoisted(() => ({ list: [] as string[] }));

vi.mock("../../lib/card-layout-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/card-layout-cache")>();
  return {
    ...actual,
    createCardLayoutCacheKey: (input: Parameters<typeof actual.createCardLayoutCacheKey>[0]) => {
      const key = actual.createCardLayoutCacheKey(input);
      layoutKeys.list.push(key);
      return key;
    },
  };
});

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
  return { container, root };
}

function cardTransforms(container: HTMLDivElement): Record<string, string> {
  return Object.fromEntries(Array.from(
    container.querySelectorAll("[data-destination-card]"),
    (card) => [card.getAttribute("data-destination-card")!, card.getAttribute("transform")!],
  ));
}

function panned(project: ProjectDocument): ProjectDocument {
  return { ...project, map: { ...project.map, x: project.map.x + 90, y: project.map.y + 40 } };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
  layoutKeys.list.length = 0;
  geoCalls.projectPoint = 0;
  geoCalls.stream = 0;
});

describe("PosterCanvas map pan projection cost", () => {
  it("reprojects no province geometry when only map x/y change", () => {
    // Pin view has no destination cards, so the only projection work left on the pan path
    // is the province geometry the collision bounds are built from.
    const project = createProjectDocument({ students, templateId: "original", dataView: "pins" });
    const { root } = mount();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(geoCalls.projectPoint).toBeGreaterThan(1000);
    expect(geoCalls.stream).toBeGreaterThan(0);
    const afterMount = { ...geoCalls };

    const target = panned(project);
    flushSync(() => root.render(<PosterCanvas project={target} exportMode />));

    expect(geoCalls).toEqual(afterMount);

    // A zoom changes the projected geometry itself, so it must still reproject — without
    // this the counters above could stay flat for the wrong reason.
    flushSync(() => root.render(
      <PosterCanvas project={{ ...target, map: { ...target.map, scale: target.map.scale * 0.8 } }} exportMode />,
    ));

    expect(geoCalls.projectPoint).toBeGreaterThan(afterMount.projectPoint);
  });

  it("pans to the collision geometry a fresh render at the panned offset would project", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const target = panned(project);

    const incremental = mount();
    flushSync(() => incremental.root.render(<PosterCanvas project={project} exportMode />));
    flushSync(() => incremental.root.render(<PosterCanvas project={target} exportMode />));
    // The cache key serializes every ring point of every province, so matching keys means
    // the translated geometry is identical to the freshly projected one, not merely close.
    const incrementalKey = layoutKeys.list.at(-1);
    expect(incrementalKey).toBeTypeOf("string");

    cardLayoutCache.clear();
    layoutKeys.list.length = 0;
    const fresh = mount();
    flushSync(() => fresh.root.render(<PosterCanvas project={target} exportMode />));

    expect(layoutKeys.list.at(-1)).toBe(incrementalKey);
    expect(Object.keys(cardTransforms(fresh.container))).toHaveLength(students.length);
    expect(cardTransforms(incremental.container)).toEqual(cardTransforms(fresh.container));
  });
});
