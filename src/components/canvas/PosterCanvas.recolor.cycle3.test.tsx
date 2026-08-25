import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

const projectionCalls = vi.hoisted(() => ({ points: 0 }));

vi.mock("d3-geo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("d3-geo")>();
  return {
    ...actual,
    geoMercator: () => {
      const projection = actual.geoMercator();
      const counted: typeof projection = new Proxy(projection, {
        apply(target, thisArg, args) {
          projectionCalls.points += 1;
          return Reflect.apply(target as never, thisArg, args);
        },
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
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

import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument } from "../../lib/project-document";
import { PosterCanvas } from "./PosterCanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
  projectionCalls.points = 0;
});

describe("PosterCanvas province recoloring projection cost", () => {
  it("does not reproject province geometry when only a province color changes", () => {
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
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(projectionCalls.points).toBeGreaterThan(1000);
    const afterMount = projectionCalls.points;

    const recolored = {
      ...project,
      map: {
        ...project.map,
        provinceStyles: {
          ...project.map.provinceStyles,
          北京市: {
            ...project.map.provinceStyles?.北京市,
            appearance: { kind: "manual-color" as const, color: "#1257a6" },
          },
        },
      },
    };
    flushSync(() => root.render(<PosterCanvas project={recolored} exportMode />));

    expect(projectionCalls.points).toBe(afterMount);

    const hidden = {
      ...recolored,
      map: {
        ...recolored.map,
        provinceStyles: {
          ...recolored.map.provinceStyles,
          北京市: {
            ...recolored.map.provinceStyles?.北京市,
            visible: false,
          },
        },
      },
    };
    flushSync(() => root.render(<PosterCanvas project={hidden} exportMode />));

    // Visibility changes collision geometry and must not be mistaken for styling.
    expect(projectionCalls.points).toBeGreaterThan(afterMount);
  });
});
