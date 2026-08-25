import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

const geoCalls = vi.hoisted(() => ({ projectPoint: 0, stream: 0 }));

vi.mock("d3-geo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("d3-geo")>();
  return {
    ...actual,
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
import type { ProvinceStyle } from "../../lib/scene-document";
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

function withProvinceStyle(project: ProjectDocument, province: string, style: ProvinceStyle): ProjectDocument {
  return {
    ...project,
    map: {
      ...project.map,
      provinceStyles: {
        ...project.map.provinceStyles,
        [province]: { ...project.map.provinceStyles?.[province], ...style },
      },
    },
  };
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

describe("PosterCanvas province recolor cost", () => {
  it("reprojects nothing and keeps the layout key when a province only changes color", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { root } = mount();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    expect(geoCalls.projectPoint).toBeGreaterThan(1000);
    const afterMount = { ...geoCalls };
    const keyAfterMount = layoutKeys.list.at(-1);
    expect(keyAfterMount).toBeTypeOf("string");

    flushSync(() => root.render(
      <PosterCanvas project={withProvinceStyle(project, "北京市", { fill: "#d05a45" })} exportMode />,
    ));

    expect(geoCalls).toEqual(afterMount);
    expect(layoutKeys.list.at(-1)).toBe(keyAfterMount);
  });

  it("still reprojects when a province is hidden, so the color case is not flat by accident", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { root } = mount();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const afterMount = { ...geoCalls };
    const keyAfterMount = layoutKeys.list.at(-1);

    flushSync(() => root.render(
      <PosterCanvas project={withProvinceStyle(project, "北京市", { visible: false })} exportMode />,
    ));

    expect(geoCalls.projectPoint).toBeGreaterThan(afterMount.projectPoint);
    expect(layoutKeys.list.at(-1)).not.toBe(keyAfterMount);
  });
});
