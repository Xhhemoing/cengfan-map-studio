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

import { clampDestinationCardPosition, type CardArea, type CardLayoutBounds } from "../../lib/card-layout";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import { createProjectDocument, type ProjectDocument } from "../../lib/project-document";
import type { AssetElement, CardSettings } from "../../lib/scene-document";
import { PosterCanvas } from "./PosterCanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

const DECORATION: AssetElement = {
  id: "asset-decoration",
  assetId: "lib-lantern",
  label: "灯笼",
  src: "data:image/png;base64,AA",
  kind: "decoration",
  x: 60,
  y: 640,
  width: 180,
  height: 140,
  rotation: 0,
  opacity: 1,
  zIndex: 30,
  visibility: true,
};

function project(cards: Partial<CardSettings> = {}, assets: AssetElement[] = [DECORATION]): ProjectDocument {
  const base = createProjectDocument({
    students: [{
      id: "student-1",
      name: "林舟",
      university: "北京大学",
      city: "北京市",
      province: "北京市",
      visibility: true,
    }],
    templateId: "original",
    dataView: "province",
  });
  return { ...base, cards: { ...base.cards, ...cards }, assetElements: assets };
}

function boundsFor(document: ProjectDocument): CardLayoutBounds {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  flushSync(() => root.render(<PosterCanvas project={document} exportMode />));
  expect(capturedBounds.length).toBeGreaterThan(0);
  return capturedBounds[capturedBounds.length - 1] as CardLayoutBounds;
}

function hasArea(areas: CardArea[] | undefined, expected: CardArea): boolean {
  return (areas ?? []).some((area) => area.x === expected.x
    && area.y === expected.y
    && area.width === expected.width
    && area.height === expected.height);
}

function overlaps(left: CardArea, right: CardArea): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

const decorationArea: CardArea = {
  x: DECORATION.x,
  y: DECORATION.y,
  width: DECORATION.width,
  height: DECORATION.height,
};

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  cardLayoutCache.clear();
  capturedBounds.length = 0;
});

describe("PosterCanvas obstacle assembly for the two overlap switches", () => {
  it("hands the solver the map rects and the element rects as separate sets", () => {
    const document = project();
    const guests = document.guests;
    const title = document.textElements.find((text) => text.id === "text-title")!;
    const bounds = boundsFor(document);

    expect(bounds.allowMapOverlap).toBe(false);
    expect(bounds.allowElementOverlap).toBe(false);
    expect(bounds.occupiedPolygons?.length).toBeGreaterThan(0);
    // The guest panel, the poster texts and the visible decoration are element obstacles;
    // decorations in particular used to be missing, so cards were happily placed on top.
    expect(hasArea(bounds.elementAreas, decorationArea)).toBe(true);
    expect((bounds.elementAreas ?? []).some((area) =>
      area.x === guests.x && area.y === guests.y && area.width === guests.width)).toBe(true);
    expect((bounds.elementAreas ?? []).some((area) => area.y === title.y - title.fontSize)).toBe(true);
    // Element rects must not leak into the map set, or 允许覆盖地图 would release them too.
    expect(hasArea(bounds.occupiedAreas, decorationArea)).toBe(false);
  });

  it("keeps each switch on its own set", () => {
    const permissive = boundsFor(project({ allowElementOverlap: true }));
    const strict = boundsFor(project());

    // The element rects still travel with the bounds; the solver is what relaxes them, so
    // one switch can never quietly release the geometry the other one protects.
    expect(permissive.allowElementOverlap).toBe(true);
    expect(permissive.elementAreas).toEqual(strict.elementAreas);
    expect(permissive.occupiedPolygons?.length).toBe(strict.occupiedPolygons?.length);
    expect(permissive.occupiedAreas).toEqual(strict.occupiedAreas);

    const mapOverlap = boundsFor(project({ allowMapOverlap: true }));
    expect(mapOverlap.allowMapOverlap).toBe(true);
    expect(mapOverlap.occupiedPolygons).toEqual([]);
    expect(mapOverlap.occupiedAreas).toEqual([]);
    expect(hasArea(mapOverlap.elementAreas, decorationArea)).toBe(true);
  });

  it("keeps a dragged card off a decoration until 禁止遮挡其他元素 is unchecked", () => {
    const strict = boundsFor(project());
    const permissive = boundsFor(project({ allowElementOverlap: true }));
    const dropped = { x: DECORATION.x + 20, y: DECORATION.y + 20, width: 120, height: 80 };

    // Same bounds the auto-layout got, so the drag and the solver agree on what is protected.
    const blocked = clampDestinationCardPosition(dropped, strict);
    expect(overlaps({ ...blocked, width: dropped.width, height: dropped.height }, decorationArea)).toBe(false);
    expect(clampDestinationCardPosition(dropped, permissive)).toEqual({ x: dropped.x, y: dropped.y });
  });

  it("ignores decorations that paint nothing and reserves the extent of a rotated one", () => {
    const hidden = { ...DECORATION, id: "asset-hidden", visibility: false };
    const transparent = { ...DECORATION, id: "asset-transparent", opacity: 0 };
    const rotated = { ...DECORATION, id: "asset-rotated", rotation: 90 };
    const bounds = boundsFor(project({}, [hidden, transparent, rotated]));

    // A 90° turn swaps the extents around the same center.
    expect(hasArea(bounds.elementAreas, { x: 80, y: 620, width: 140, height: 180 })).toBe(true);
    expect(hasArea(bounds.elementAreas, decorationArea)).toBe(false);
  });
});
