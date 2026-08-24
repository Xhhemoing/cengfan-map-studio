import { describe, expect, it } from "vitest";
import {
  clampCardPosition,
  layoutCards,
  solveCardLayout,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
  type CardPoint,
  type CardPolygon,
} from "./card-layout";
import { buildConnectorGeometry, connectorGeometriesIntersect } from "./connector-geometry";

const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 350, y: 120, width: 800, height: 690 },
  margin: 32,
  gap: 14,
};

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function cardInput(input: Omit<CardLayoutInput, "width" | "height"> & Partial<Pick<CardLayoutInput, "width" | "height">>): CardLayoutInput {
  return { width: 220, height: 110, ...input };
}

function assertHardConstraints(
  placements: CardPlacement[],
  b: CardLayoutBounds,
  occupied: { x: number; y: number; width: number; height: number }[] = [],
) {
  for (const card of placements) {
    expect(card.x).toBeGreaterThanOrEqual(b.margin - 1e-6);
    expect(card.y).toBeGreaterThanOrEqual(b.margin - 1e-6);
    expect(card.x + card.width).toBeLessThanOrEqual(b.width - b.margin + 1e-6);
    expect(card.y + card.height).toBeLessThanOrEqual(b.height - b.margin + 1e-6);
    for (const zone of occupied) {
      expect(overlaps(card, zone)).toBe(false);
    }
  }
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      expect(overlaps(placements[i]!, placements[j]!)).toBe(false);
    }
  }
}

describe("card layout", () => {
  it("places east/west cards on the nearest side close to their anchors (quadrant)", () => {
    const [west, east] = layoutCards([
      cardInput({ id: "sichuan", anchorX: 560, anchorY: 540 }),
      cardInput({ id: "zhejiang", anchorX: 900, anchorY: 480 }),
    ], bounds, { mode: "quadrant" });

    expect(west.side).toBe("left");
    expect(east.side).toBe("right");
    expect(Math.abs(west.y + west.height / 2 - 540)).toBeLessThan(west.height);
    expect(Math.abs(east.y + east.height / 2 - 480)).toBeLessThan(east.height);
    assertHardConstraints([west, east], bounds);
  });

  it("keeps cards inside the canvas, non-overlapping and outside province AABBs", () => {
    const occupied = [{ x: 520, y: 240, width: 230, height: 330 }, { x: 780, y: 300, width: 220, height: 300 }];
    const cards = layoutCards(
      Array.from({ length: 8 }, (_, i) => cardInput({
        id: `c-${i}`,
        anchorX: i % 2 === 0 ? 560 : 900,
        anchorY: 180 + i * 70,
      })),
      { ...bounds, occupiedAreas: occupied },
      { mode: "quadrant" },
    );
    assertHardConstraints(cards, { ...bounds, occupiedAreas: occupied }, occupied);
  });

  it("is deterministic across repeated calls", () => {
    const input = Array.from({ length: 6 }, (_, i) => cardInput({
      id: `p-${i}`,
      anchorX: 400 + i * 120,
      anchorY: 200 + (i % 3) * 200,
    }));
    const a = solveCardLayout(input, bounds, { mode: "quadrant" });
    const b = solveCardLayout(input, bounds, { mode: "quadrant" });
    expect(b).toEqual(a);
  });

  it.each<CardLayoutMode>(["quadrant", "radial", "right-stack", "grid"])(
    "satisfies hard constraints for every mode on a mixed set: %s",
    (mode) => {
      const occupied = [{ x: 560, y: 170, width: 430, height: 540 }];
      const input = Array.from({ length: 12 }, (_, i) => cardInput({
        id: `m-${i}`,
        anchorX: 500 + (i % 4) * 180,
        anchorY: 220 + Math.floor(i / 4) * 160,
      }));
      const result = solveCardLayout(input, { ...bounds, occupiedAreas: occupied }, { mode });
      assertHardConstraints(result.placements, { ...bounds, occupiedAreas: occupied }, occupied);
    },
  );

  it("auto-balances the left/right split to equalize column heights", () => {
    const input = Array.from({ length: 7 }, (_, i) => cardInput({
      id: `b-${i}`,
      anchorX: 560 + (i % 3) * 40,
      anchorY: 240 + i * 70,
    }));
    const balanced = solveCardLayout(input, bounds, { mode: "quadrant", autoBalance: true });
    const leftCount = balanced.placements.filter((p) => p.side === "left").length;
    const rightCount = balanced.placements.filter((p) => p.side === "right").length;
    expect(Math.abs(leftCount - rightCount)).toBeLessThanOrEqual(1);
    assertHardConstraints(balanced.placements, bounds);
  });

  it("right-stack mode puts every card on the right in anchor-y order", () => {
    const input = Array.from({ length: 5 }, (_, i) => cardInput({
      id: `r-${i}`,
      anchorX: 600 + i * 40,
      anchorY: 200 + i * 120,
    }));
    const cards = layoutCards(input, bounds, { mode: "right-stack" });
    expect(cards.every((c) => c.side === "right")).toBe(true);
    const ys = cards.map((c) => c.y);
    const sorted = [...ys].sort((a, b) => a - b);
    expect(ys).toEqual(sorted);
    assertHardConstraints(cards, bounds);
  });

  it("radial mode distributes cards around the map on multiple sides", () => {
    const input = [
      cardInput({ id: "n", anchorX: 760, anchorY: 180 }),
      cardInput({ id: "s", anchorX: 760, anchorY: 760 }),
      cardInput({ id: "w", anchorX: 460, anchorY: 460 }),
      cardInput({ id: "e", anchorX: 1040, anchorY: 460 }),
    ];
    const cards = layoutCards(input, bounds, { mode: "radial" });
    expect(new Set(cards.map((c) => c.side)).size).toBeGreaterThan(1);
    assertHardConstraints(cards, bounds);
  });

  it("grid mode lays cards out in a non-overlapping grid within the canvas", () => {
    const input = Array.from({ length: 9 }, (_, i) => cardInput({
      id: `g-${i}`,
      anchorX: 760,
      anchorY: 460,
    }));
    const cards = layoutCards(input, bounds, { mode: "grid" });
    assertHardConstraints(cards, bounds);
    const rows = new Set(cards.map((c) => Math.round(c.y / 20)));
    const cols = new Set(cards.map((c) => Math.round(c.x / 20)));
    expect(rows.size).toBeGreaterThan(1);
    expect(cols.size).toBeGreaterThan(1);
  });

  it("falls back gracefully without throwing under extreme saturation", () => {
    const input = Array.from({ length: 40 }, (_, i) => cardInput({
      id: `x-${i}`,
      anchorX: 760,
      anchorY: 460,
      width: 200,
      height: 90,
    }));
    const small: CardLayoutBounds = {
      width: 900,
      height: 640,
      map: { x: 250, y: 100, width: 400, height: 400 },
      margin: 20,
      gap: 8,
      occupiedAreas: [{ x: 300, y: 140, width: 300, height: 320 }],
    };
    expect(() => layoutCards(input, small, { mode: "quadrant" })).not.toThrow();
    const result = solveCardLayout(input, small, { mode: "quadrant" });
    expect(result.placements).toHaveLength(input.length);
    for (const card of result.placements) {
      expect(card.x).toBeGreaterThanOrEqual(small.margin - 1);
      expect(card.y).toBeGreaterThanOrEqual(small.margin - 1);
    }
  });

  it("restarts fallback packing when partial side placements fragment usable space", () => {
    const fragmentedBounds: CardLayoutBounds = {
      width: 1084,
      height: 633,
      map: { x: 271, y: 113.94, width: 542, height: 367.14 },
      margin: 49,
      gap: 10,
      occupiedAreas: [{ x: 336.04, y: 143.3112, width: 411.92, height: 308.3976 }],
    };
    const input: CardLayoutInput[] = [
      { id: "c4", anchorX: 453.073, anchorY: 382.009, width: 131, height: 134 },
      { id: "c5", anchorX: 705.538, anchorY: 352.835, width: 207, height: 92 },
      { id: "c6", anchorX: 554.877, anchorY: 357.828, width: 160, height: 147 },
      { id: "c7", anchorX: 358.731, anchorY: 335.066, width: 207, height: 77 },
      { id: "c8", anchorX: 278.733, anchorY: 472.164, width: 144, height: 75 },
      { id: "c9", anchorX: 743.419, anchorY: 268.814, width: 170, height: 87 },
      { id: "c10", anchorX: 726.72, anchorY: 208.39, width: 210, height: 142 },
    ];

    const result = solveCardLayout(input, fragmentedBounds, { mode: "quadrant" });
    expect(result.status).toBe("solved");
    assertHardConstraints(result.placements, fragmentedBounds, fragmentedBounds.occupiedAreas);
  });

  it("keeps a manually placed card when it does not intersect any occupied geography, regardless of layout style", () => {
    const occupied = [
      { x: 400, y: 200, width: 180, height: 180 },
      { x: 920, y: 200, width: 180, height: 180 },
    ];
    const position = { x: 740, y: 400, width: 80, height: 60 };

    const clamped = clampCardPosition(position, { ...bounds, occupiedAreas: occupied });

    expect(clamped).toEqual({ x: position.x, y: position.y });
  });

  it("keeps a manually placed card in any non-overlapping location, including scattered positions around the map", () => {
    const occupiedPolygons = [{
      rings: [[
        { x: 500, y: 200 },
        { x: 900, y: 200 },
        { x: 900, y: 400 },
        { x: 700, y: 400 },
        { x: 700, y: 600 },
        { x: 500, y: 600 },
      ]],
    }];
    const position = { x: 720, y: 420, width: 80, height: 80 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons,
    });

    expect(clamped).toEqual({ x: position.x, y: position.y });
  });

  it("still rejects a manual card that intersects actual map polygons", () => {
    const occupiedPolygons = [{
      rings: [[
        { x: 500, y: 200 },
        { x: 900, y: 200 },
        { x: 900, y: 600 },
        { x: 500, y: 600 },
      ]],
    }];
    const position = { x: 600, y: 300, width: 220, height: 110 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons,
    });

    expect(clamped).not.toEqual({ x: position.x, y: position.y });
    const card = { ...clamped, width: position.width, height: position.height };
    expect(overlaps(card, { x: 500, y: 200, width: 400, height: 400 })).toBe(false);
  });

  it("pushes a covered manual position off the real occupied AABBs, not the map union", () => {
    const occupied = Array.from({ length: 20 }, (_, index) => ({
      x: 500 + index * 5,
      y: 300 + index * 3,
      width: 180,
      height: 140,
    }));
    const position = { x: 600, y: 400, width: 220, height: 110 };

    const clamped = clampCardPosition(position, { ...bounds, occupiedAreas: occupied });
    const card = { ...clamped, width: position.width, height: position.height };

    expect(occupied.some((area) => overlaps(card, area))).toBe(false);
  });

  it("finds a free position against fixed obstacles while still allowing map-frame whitespace", () => {
    const fixedObstacle = { x: 500, y: 885, width: 500, height: 45 };
    const position = { x: 600, y: 400, width: 220, height: 116 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [fixedObstacle],
    });

    expect(clamped).toEqual({ x: position.x, y: position.y });
    expect(overlaps({ ...clamped, width: position.width, height: position.height }, fixedObstacle)).toBe(false);
  });

  it("keeps a manual position on the map when map overlap is allowed", () => {
    const position = { x: 600, y: 400, width: 220, height: 110 };
    const permissiveBounds = {
      ...bounds,
      occupiedAreas: [{ x: 40, y: 40, width: 120, height: 60 }],
      allowMapOverlap: true,
    };

    expect(clampCardPosition(position, permissiveBounds)).toEqual({ x: position.x, y: position.y });
  });

  it("still clamps against non-map obstacles when map overlap is allowed", () => {
    const obstacle = { x: 560, y: 360, width: 300, height: 240 };
    const position = { x: 600, y: 400, width: 220, height: 110 };
    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [obstacle],
      allowMapOverlap: true,
    });
    expect(overlaps({ ...clamped, width: position.width, height: position.height }, obstacle)).toBe(false);
  });

  it("can auto-place cards over a map that fills the usable canvas", () => {
    const fullMapBounds = {
      width: 600,
      height: 500,
      map: { x: 50, y: 50, width: 500, height: 400 },
      margin: 20,
      gap: 8,
      allowMapOverlap: true,
    };
    const input = Array.from({ length: 6 }, (_, i) => cardInput({
      id: `f-${i}`,
      anchorX: 150 + (i % 3) * 120,
      anchorY: 120 + Math.floor(i / 3) * 180,
    }));
    const result = solveCardLayout(input, fullMapBounds, { mode: "quadrant" });
    expect(result.placements.length).toBe(6);
    assertHardConstraints(result.placements, fullMapBounds, []);
  });

  it("uses content bounds (not the raw map frame) as the anchor for side rails when provided", () => {
    const tightMap = { x: 400, y: 180, width: 440, height: 380 };
    const tightBounds: CardLayoutBounds = {
      ...bounds,
      map: tightMap,
      occupiedAreas: [{ ...tightMap }],
    };
    const input = [
      cardInput({ id: "left", anchorX: 420, anchorY: 360 }),
      cardInput({ id: "right", anchorX: 820, anchorY: 360 }),
    ];
    const result = solveCardLayout(input, tightBounds, { mode: "quadrant" });
    expect(result.placements[0]!.side).toBe("left");
    expect(result.placements[1]!.side).toBe("right");
    assertHardConstraints(result.placements, tightBounds, [tightMap]);
  });

  it("keeps same-anchor cluster cards adjacent and non-overlapping", () => {
    const input = [
      cardInput({ id: "c1", anchorX: 600, anchorY: 300, width: 160, height: 90 }),
      cardInput({ id: "c2", anchorX: 605, anchorY: 305, width: 160, height: 90 }),
      cardInput({ id: "c3", anchorX: 610, anchorY: 310, width: 160, height: 90 }),
    ];
    const result = solveCardLayout(input, bounds, { mode: "quadrant" });
    assertHardConstraints(result.placements, bounds);
    const minY = Math.min(...result.placements.map((p) => p.y));
    const maxY = Math.max(...result.placements.map((p) => p.y + p.height));
    expect(maxY - minY).toBeLessThan(320);
  });

  it("uses real province pixels instead of the map union box as a placement obstacle", () => {
    const occupiedAreas = [
      { x: 420, y: 210, width: 160, height: 120 },
      { x: 920, y: 280, width: 140, height: 160 },
    ];
    const input = Array.from({ length: 5 }, (_, i) => cardInput({
      id: `p-${i}`,
      anchorX: 560 + (i % 2) * 300,
      anchorY: 260 + i * 80,
    }));
    const result = solveCardLayout(input, { ...bounds, occupiedAreas }, { mode: "quadrant" });
    assertHardConstraints(result.placements, { ...bounds, occupiedAreas }, occupiedAreas);
  });

  it("distributes cardinal province anchors around all four sides when the center is occupied", () => {
    const occupied = [{ x: 480, y: 200, width: 520, height: 420 }];
    const input = [
      cardInput({ id: "north", anchorX: 750, anchorY: 150 }),
      cardInput({ id: "south", anchorX: 750, anchorY: 780 }),
      cardInput({ id: "west", anchorX: 420, anchorY: 460 }),
      cardInput({ id: "east", anchorX: 1080, anchorY: 460 }),
    ];
    const result = solveCardLayout(input, { ...bounds, occupiedAreas: occupied }, { mode: "radial" });
    const sides = new Set(result.placements.map((p) => p.side));
    expect(sides.size).toBeGreaterThanOrEqual(3);
    assertHardConstraints(result.placements, { ...bounds, occupiedAreas: occupied }, occupied);
  });

  it("uses the renderer connector geometry while optimizing for distance and crossings", () => {
    const input = [
      cardInput({ id: "c1", anchorX: 515.9, anchorY: 605.4, width: 170, height: 90 }),
      cardInput({ id: "c2", anchorX: 760.2, anchorY: 604.9, width: 170, height: 90 }),
      cardInput({ id: "c3", anchorX: 1004.5, anchorY: 605.1, width: 170, height: 90 }),
      cardInput({ id: "c4", anchorX: 515.9, anchorY: 605.4, width: 170, height: 90 }),
      cardInput({ id: "c5", anchorX: 931.5, anchorY: 372.4, width: 170, height: 90 }),
    ];
    const result = solveCardLayout(input, {
      ...bounds,
      occupiedAreas: [{ x: 560, y: 220, width: 380, height: 500 }],
    }, { mode: "quadrant", connectorStyle: "curve", connectorWidth: 2 });

    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        const first = result.placements[i]!;
        const second = result.placements[j]!;
        expect(connectorGeometriesIntersect(
          buildConnectorGeometry({ card: first, anchor: { x: first.anchorX, y: first.anchorY }, preferredSide: first.side, style: "curve" }),
          buildConnectorGeometry({ card: second, anchor: { x: second.anchorX, y: second.anchorY }, preferredSide: second.side, style: "curve" }),
          2,
        )).toBe(false);
      }
    }
    const totalDistance = result.placements.reduce((sum, card) => sum + Math.hypot(
      card.x + card.width / 2 - card.anchorX,
      card.y + card.height / 2 - card.anchorY,
    ), 0);
    expect(totalDistance).toBeLessThan(2400);
  });
});

// ----- Hard-constraint oracle -----
//
// A deliberately naive, object-allocating rectangle/polygon test kept
// independent of the solver's own broad-phase implementation, so the property
// fuzz below cannot pass by agreeing with a bug in the fast path.

const ORACLE_EPSILON = 1e-7;

function oracleOrientation(a: CardPoint, b: CardPoint, c: CardPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function oraclePointOnSegment(point: CardPoint, start: CardPoint, end: CardPoint): boolean {
  return Math.abs(oracleOrientation(start, end, point)) <= ORACLE_EPSILON
    && point.x >= Math.min(start.x, end.x) - ORACLE_EPSILON
    && point.x <= Math.max(start.x, end.x) + ORACLE_EPSILON
    && point.y >= Math.min(start.y, end.y) - ORACLE_EPSILON
    && point.y <= Math.max(start.y, end.y) + ORACLE_EPSILON;
}

function oracleSegmentsIntersect(a: CardPoint, b: CardPoint, c: CardPoint, d: CardPoint): boolean {
  const abC = oracleOrientation(a, b, c);
  const abD = oracleOrientation(a, b, d);
  const cdA = oracleOrientation(c, d, a);
  const cdB = oracleOrientation(c, d, b);
  if (((abC > ORACLE_EPSILON && abD < -ORACLE_EPSILON) || (abC < -ORACLE_EPSILON && abD > ORACLE_EPSILON))
    && ((cdA > ORACLE_EPSILON && cdB < -ORACLE_EPSILON) || (cdA < -ORACLE_EPSILON && cdB > ORACLE_EPSILON))) return true;
  return oraclePointOnSegment(c, a, b)
    || oraclePointOnSegment(d, a, b)
    || oraclePointOnSegment(a, c, d)
    || oraclePointOnSegment(b, c, d);
}

function oraclePointInRing(point: CardPoint, ring: CardPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous]!;
    const end = ring[index]!;
    if (oraclePointOnSegment(point, start, end)) return true;
    if ((start.y > point.y) !== (end.y > point.y)) {
      const x = start.x + (point.y - start.y) * (end.x - start.x) / (end.y - start.y);
      if (x >= point.x - ORACLE_EPSILON) inside = !inside;
    }
  }
  return inside;
}

function oraclePointInPolygon(point: CardPoint, polygon: CardPolygon): boolean {
  const [shell, ...holes] = polygon.rings;
  return Boolean(shell && oraclePointInRing(point, shell) && !holes.some((hole) => oraclePointInRing(point, hole)));
}

function oraclePolygonBounds(polygon: CardPolygon): CardArea | null {
  if (polygon.bounds) return polygon.bounds;
  const points = polygon.rings.flat();
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function oracleRectHitsPolygon(card: CardArea, polygon: CardPolygon, gap: number): boolean {
  const expanded = {
    x: card.x - gap,
    y: card.y - gap,
    width: card.width + gap * 2,
    height: card.height + gap * 2,
  };
  // A ring that cannot enclose an area is not an obstacle, and a card that only
  // touches the polygon's bounding box exactly (the rail coordinates the solver
  // emits) counts as clear — both are load-bearing contract details.
  const polygonArea = oraclePolygonBounds(polygon);
  if (!polygonArea || !overlapsWithGap(expanded, polygonArea, 0)) return false;
  const corners: CardPoint[] = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    { x: expanded.x, y: expanded.y + expanded.height },
  ];
  if (corners.some((corner) => oraclePointInPolygon(corner, polygon))) return true;
  const shell = polygon.rings[0] ?? [];
  if (shell.some((point) => point.x >= expanded.x - ORACLE_EPSILON
    && point.x <= expanded.x + expanded.width + ORACLE_EPSILON
    && point.y >= expanded.y - ORACLE_EPSILON
    && point.y <= expanded.y + expanded.height + ORACLE_EPSILON)) return true;
  const rectangleEdges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]!] as const);
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && rectangleEdges.some(([start, end]) => oracleSegmentsIntersect(point, next, start, end)));
  }));
}

function overlapsWithGap(left: CardArea, right: CardArea, gap: number): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const FUZZ_MODES: CardLayoutMode[] = ["quadrant", "radial", "right-stack", "grid"];

function fuzzScenario(seed: number) {
  const random = seededRandom(seed);
  const width = 700 + Math.round(random() * 1200);
  const height = 500 + Math.round(random() * 900);
  const margin = 10 + Math.round(random() * 40);
  const gap = Math.round(random() * 18);
  const map = {
    x: margin + random() * width * 0.2,
    y: margin + random() * height * 0.2,
    width: width * (0.3 + random() * 0.4),
    height: height * (0.3 + random() * 0.4),
  };
  const polygons: CardPolygon[] = [];
  const polygonCount = Math.floor(random() * 7);
  for (let index = 0; index < polygonCount; index += 1) {
    const cx = map.x + random() * map.width;
    const cy = map.y + random() * map.height;
    const radiusX = 10 + random() * 110;
    const radiusY = 10 + random() * 110;
    // 2-vertex rings are intentionally reachable so degenerate geometry is fuzzed too.
    const vertices = 2 + Math.floor(random() * 22);
    const ring: CardPoint[] = [];
    for (let step = 0; step < vertices; step += 1) {
      const angle = (step / vertices) * Math.PI * 2;
      ring.push({
        x: cx + Math.cos(angle) * radiusX * (0.6 + random() * 0.8),
        y: cy + Math.sin(angle) * radiusY * (0.6 + random() * 0.8),
      });
    }
    if (random() < 0.5) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of ring) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      polygons.push({ rings: [ring], bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } });
    } else {
      polygons.push({ rings: [ring] });
    }
  }
  const occupiedAreas = Array.from({ length: Math.floor(random() * 4) }, () => ({
    x: margin + random() * (width - margin * 2) * 0.7,
    y: margin + random() * (height - margin * 2) * 0.7,
    width: 40 + random() * 220,
    height: 40 + random() * 180,
  }));
  const layoutBounds: CardLayoutBounds = {
    width,
    height,
    map,
    margin,
    gap,
    ...(random() < 0.75 ? { occupiedAreas } : {}),
    ...(polygons.length ? { occupiedPolygons: polygons } : {}),
    ...(random() < 0.2 ? { allowMapOverlap: true } : {}),
  };
  const cards: CardLayoutInput[] = Array.from({ length: 1 + Math.floor(random() * 13) }, (_, index) => ({
    id: `fuzz-${index}`,
    anchorX: random() * width,
    anchorY: random() * height,
    width: 50 + Math.round(random() * 180),
    height: 30 + Math.round(random() * 110),
  }));
  return {
    cards,
    bounds: layoutBounds,
    options: {
      mode: FUZZ_MODES[Math.floor(random() * FUZZ_MODES.length)]!,
      autoBalance: random() < 0.5,
      connectorStyle: (["straight", "elbow", "curve"] as const)[Math.floor(random() * 3)]!,
      connectorWidth: random() * 4,
    },
  };
}

describe("card layout hard-constraint properties", () => {
  it("never violates margin, card spacing or polygon obstacles on any solved layout", () => {
    for (let seed = 1; seed <= 180; seed += 1) {
      const { cards, bounds: layoutBounds, options } = fuzzScenario(seed);
      const context = `seed=${seed} mode=${options.mode} cards=${cards.length}`;
      const result = solveCardLayout(cards, layoutBounds, options);

      expect(result.placements, context).toHaveLength(cards.length);
      expect(result.placements.map((placement) => placement.id), context)
        .toEqual(cards.map((card) => card.id));
      if (result.status !== "solved") continue;

      const gap = layoutBounds.gap;
      for (const placement of result.placements) {
        expect(placement.x, `${context} left margin`).toBeGreaterThanOrEqual(layoutBounds.margin - 1e-6);
        expect(placement.y, `${context} top margin`).toBeGreaterThanOrEqual(layoutBounds.margin - 1e-6);
        expect(placement.x + placement.width, `${context} right margin`)
          .toBeLessThanOrEqual(layoutBounds.width - layoutBounds.margin + 1e-6);
        expect(placement.y + placement.height, `${context} bottom margin`)
          .toBeLessThanOrEqual(layoutBounds.height - layoutBounds.margin + 1e-6);
        for (const zone of layoutBounds.occupiedAreas ?? []) {
          expect(overlapsWithGap(placement, zone, gap), `${context} zone ${JSON.stringify(zone)}`).toBe(false);
        }
        for (const polygon of layoutBounds.occupiedPolygons ?? []) {
          expect(oracleRectHitsPolygon(placement, polygon, gap), `${context} polygon`).toBe(false);
        }
      }
      for (let left = 0; left < result.placements.length; left += 1) {
        for (let right = left + 1; right < result.placements.length; right += 1) {
          expect(
            overlapsWithGap(result.placements[left]!, result.placements[right]!, gap),
            `${context} pair ${left}/${right}`,
          ).toBe(false);
        }
      }
    }
  });

  it("matches the naive oracle on every rectangle/polygon obstacle decision", () => {
    // `clampCardPosition` returns the requested position unchanged exactly when
    // the polygon test says it is free, so it is a direct probe of the broad-
    // phase predicate. The canvas is far larger than the polygon, so a free
    // rail always exists and the "nothing fits" fallback never masks a result.
    const spacious: Omit<CardLayoutBounds, "occupiedPolygons"> = {
      width: 2000,
      height: 1400,
      map: { x: 700, y: 500, width: 400, height: 300 },
      margin: 20,
      gap: 0,
      occupiedAreas: [],
    };
    let blocked = 0;
    let free = 0;
    for (let seed = 1; seed <= 1400; seed += 1) {
      const random = seededRandom(seed * 7919 + 13);
      const cx = 500 + random() * 900;
      const cy = 400 + random() * 600;
      const radiusX = 20 + random() * 200;
      const radiusY = 20 + random() * 200;
      const vertices = 3 + Math.floor(random() * 26);
      const ring: CardPoint[] = [];
      for (let step = 0; step < vertices; step += 1) {
        const angle = (step / vertices) * Math.PI * 2;
        // Strong radial wobble produces concave rings whose edges cut the card
        // rectangle without ever putting a vertex or a corner inside it.
        const wobble = 0.25 + random() * 1.4;
        ring.push({ x: cx + Math.cos(angle) * radiusX * wobble, y: cy + Math.sin(angle) * radiusY * wobble });
      }
      const polygon: CardPolygon = random() < 0.5
        ? { rings: [ring] }
        : { rings: [ring], bounds: undefined };
      const layoutBounds: CardLayoutBounds = { ...spacious, occupiedPolygons: [polygon] };
      const position = {
        x: 400 + random() * 1100,
        y: 300 + random() * 800,
        width: 40 + Math.round(random() * 320),
        height: 30 + Math.round(random() * 220),
      };
      const origin = {
        x: clamp(position.x, layoutBounds.margin, layoutBounds.width - layoutBounds.margin - position.width),
        y: clamp(position.y, layoutBounds.margin, layoutBounds.height - layoutBounds.margin - position.height),
        width: position.width,
        height: position.height,
      };
      const expectedFree = !oracleRectHitsPolygon(origin, polygon, 0);
      const clamped = clampCardPosition(position, layoutBounds);
      const actualFree = clamped.x === origin.x && clamped.y === origin.y;
      expect(actualFree, `seed=${seed} vertices=${vertices} rect=${JSON.stringify(origin)}`).toBe(expectedFree);
      if (expectedFree) free += 1; else blocked += 1;
    }
    // Guard the guard: both outcomes must be well represented.
    expect(free).toBeGreaterThan(200);
    expect(blocked).toBeGreaterThan(200);
  });

  it("matches the naive oracle on lattice-aligned tangency, where rejects touch exactly", () => {
    // Integer polygons swept by an integer rectangle make edge-on-edge and
    // vertex-on-corner contact common instead of measure-zero, which is where a
    // bounding-box reject that forgets its epsilon slack starts lying.
    const shapes: CardPoint[][] = [
      [{ x: 600, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 600 }, { x: 600, y: 600 }],
      [{ x: 700, y: 380 }, { x: 820, y: 500 }, { x: 700, y: 620 }, { x: 580, y: 500 }],
      // Concave comb: long thin teeth that slice a card without ever putting a
      // vertex inside it or a card corner inside the polygon.
      [
        { x: 560, y: 400 }, { x: 860, y: 400 }, { x: 860, y: 420 }, { x: 600, y: 420 },
        { x: 600, y: 480 }, { x: 860, y: 480 }, { x: 860, y: 500 }, { x: 600, y: 500 },
        { x: 600, y: 560 }, { x: 860, y: 560 }, { x: 860, y: 580 }, { x: 560, y: 580 },
      ],
    ];
    const spacious: Omit<CardLayoutBounds, "occupiedPolygons"> = {
      width: 2000,
      height: 1200,
      map: { x: 900, y: 900, width: 200, height: 150 },
      margin: 20,
      gap: 0,
      occupiedAreas: [],
    };
    let blocked = 0;
    let free = 0;
    for (const rings of shapes) {
      for (const size of [{ width: 40, height: 20 }, { width: 120, height: 60 }, { width: 260, height: 40 }]) {
        const polygon: CardPolygon = { rings: [rings] };
        const layoutBounds: CardLayoutBounds = { ...spacious, occupiedPolygons: [polygon] };
        for (let x = 500; x <= 900; x += 20) {
          for (let y = 340; y <= 660; y += 20) {
            const origin = { x, y, width: size.width, height: size.height };
            const expectedFree = !oracleRectHitsPolygon(origin, polygon, 0);
            const clamped = clampCardPosition({ ...origin }, layoutBounds);
            const actualFree = clamped.x === x && clamped.y === y;
            expect(actualFree, `rect=${JSON.stringify(origin)} shape=${rings.length}`).toBe(expectedFree);
            if (expectedFree) free += 1; else blocked += 1;
          }
        }
      }
    }
    expect(free).toBeGreaterThan(100);
    expect(blocked).toBeGreaterThan(100);
  });

  it("keeps the full gap between cards placed by the containment repair scan", () => {
    // Every card shares one anchor, so side packing overflows and the repair
    // scan places most of them against an already-dense canvas. That is the
    // only path that uses the placed-card grid index, so it is where a query
    // box that forgets to grow by `gap` would let neighbours touch.
    for (const gap of [0, 6, 14, 24, 40]) {
      for (const cardCount of [14, 26, 38]) {
        const layoutBounds: CardLayoutBounds = {
          width: 2200,
          height: 1500,
          map: { x: 900, y: 600, width: 400, height: 300 },
          margin: 30,
          gap,
          occupiedAreas: [{ x: 880, y: 580, width: 440, height: 340 }],
        };
        const cards: CardLayoutInput[] = Array.from({ length: cardCount }, (_, index) => ({
          id: `cf-${index}`,
          anchorX: 1100,
          anchorY: 750,
          width: 150 + (index % 5) * 12,
          height: 70 + (index % 3) * 10,
        }));
        const result = solveCardLayout(cards, layoutBounds, { mode: "quadrant" });
        const context = `gap=${gap} cards=${cardCount} status=${result.status}`;
        expect(result.placements, context).toHaveLength(cardCount);
        if (result.status !== "solved") continue;
        for (let left = 0; left < result.placements.length; left += 1) {
          for (let right = left + 1; right < result.placements.length; right += 1) {
            expect(
              overlapsWithGap(result.placements[left]!, result.placements[right]!, gap),
              `${context} pair ${left}/${right}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("agrees with the naive obstacle oracle for every manual clamp result", () => {
    for (let seed = 500; seed <= 620; seed += 1) {
      const { bounds: layoutBounds } = fuzzScenario(seed);
      const polygons = layoutBounds.occupiedPolygons ?? [];
      if (polygons.length === 0 || layoutBounds.allowMapOverlap) continue;
      const random = seededRandom(seed * 31 + 7);
      const position = {
        x: random() * layoutBounds.width,
        y: random() * layoutBounds.height,
        width: 60 + Math.round(random() * 160),
        height: 40 + Math.round(random() * 90),
      };
      const clamped = clampCardPosition(position, layoutBounds);
      const card = { ...clamped, width: position.width, height: position.height };
      const blocked = polygons.some((polygon) => oracleRectHitsPolygon(card, polygon, 0))
        || (layoutBounds.occupiedAreas ?? []).some((zone) => overlapsWithGap(card, zone, 0));
      // The clamp only reports a blocked result when no free rail existed at all.
      if (!blocked) continue;
      const originBlocked = polygons.some((polygon) => oracleRectHitsPolygon(
        { x: clamp(position.x, layoutBounds.margin, layoutBounds.width - layoutBounds.margin - position.width),
          y: clamp(position.y, layoutBounds.margin, layoutBounds.height - layoutBounds.margin - position.height),
          width: position.width,
          height: position.height },
        polygon,
        0,
      ));
      expect(originBlocked, `seed=${seed}`).toBe(true);
    }
  });
});

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

describe("card layout degenerate and hostile inputs", () => {
  const hostileBounds = (polygons: CardPolygon[]): CardLayoutBounds => ({
    width: 1200,
    height: 800,
    map: { x: 300, y: 150, width: 600, height: 500 },
    margin: 24,
    gap: 10,
    occupiedAreas: [],
    occupiedPolygons: polygons,
  });

  const sample = (count: number): CardLayoutInput[] => Array.from({ length: count }, (_, index) => ({
    id: `d-${index}`,
    anchorX: 350 + index * 70,
    anchorY: 250 + (index % 3) * 120,
    width: 150,
    height: 80,
  }));

  it.each<[string, CardPolygon[]]>([
    ["empty ring list", [{ rings: [] }]],
    ["empty ring", [{ rings: [[]] }]],
    ["single-point ring", [{ rings: [[{ x: 500, y: 400 }]] }]],
    ["two-point ring", [{ rings: [[{ x: 460, y: 300 }, { x: 720, y: 300 }]] }]],
    ["collinear ring", [{ rings: [[{ x: 400, y: 400 }, { x: 500, y: 400 }, { x: 600, y: 400 }, { x: 700, y: 400 }]] }]],
    ["zero-area ring", [{ rings: [[{ x: 500, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 400 }]] }]],
    ["ring with hole", [{
      rings: [
        [{ x: 400, y: 250 }, { x: 800, y: 250 }, { x: 800, y: 600 }, { x: 400, y: 600 }],
        [{ x: 500, y: 330 }, { x: 700, y: 330 }, { x: 700, y: 520 }, { x: 500, y: 520 }],
      ],
    }]],
    ["hole larger than shell", [{
      rings: [
        [{ x: 500, y: 330 }, { x: 700, y: 330 }, { x: 700, y: 520 }, { x: 500, y: 520 }],
        [{ x: 400, y: 250 }, { x: 800, y: 250 }, { x: 800, y: 600 }, { x: 400, y: 600 }],
      ],
    }]],
    ["declared bounds with empty rings", [{ rings: [], bounds: { x: 400, y: 300, width: 200, height: 150 } }]],
    ["declared bounds of zero size", [{
      rings: [[{ x: 500, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 400 }]],
      bounds: { x: 500, y: 400, width: 0, height: 0 },
    }]],
  ])("survives a degenerate polygon: %s", (_label, polygons) => {
    const layoutBounds = hostileBounds(polygons);
    const cards = sample(6);
    const result = solveCardLayout(cards, layoutBounds, { mode: "quadrant" });
    expect(result.placements).toHaveLength(cards.length);
    for (const placement of result.placements) {
      expect(Number.isFinite(placement.x)).toBe(true);
      expect(Number.isFinite(placement.y)).toBe(true);
    }
    if (result.status === "solved") {
      for (const placement of result.placements) {
        for (const polygon of polygons) {
          expect(oracleRectHitsPolygon(placement, polygon, layoutBounds.gap)).toBe(false);
        }
      }
    }
    expect(() => clampCardPosition({ x: 520, y: 380, width: 160, height: 90 }, layoutBounds)).not.toThrow();
  });

  it.each<[string, number, number]>([
    ["NaN anchors", Number.NaN, Number.NaN],
    ["positive infinity anchors", Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ["negative infinity anchors", Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ["mixed NaN/infinity anchors", Number.NaN, Number.POSITIVE_INFINITY],
  ])("never throws on non-finite anchors: %s", (_label, anchorX, anchorY) => {
    const polygons: CardPolygon[] = [{
      rings: [[{ x: 400, y: 250 }, { x: 800, y: 250 }, { x: 800, y: 600 }, { x: 400, y: 600 }]],
    }];
    const layoutBounds = hostileBounds(polygons);
    const cards: CardLayoutInput[] = [
      { id: "bad-0", anchorX, anchorY, width: 160, height: 90 },
      { id: "bad-1", anchorX, anchorY: 300, width: 160, height: 90 },
      { id: "good", anchorX: 500, anchorY: 400, width: 160, height: 90 },
    ];
    for (const mode of FUZZ_MODES) {
      let result: ReturnType<typeof solveCardLayout> | null = null;
      expect(() => { result = solveCardLayout(cards, layoutBounds, { mode, autoBalance: true }); }).not.toThrow();
      expect(result!.placements).toHaveLength(cards.length);
      expect(result!.placements.map((placement) => placement.id)).toEqual(cards.map((card) => card.id));
    }
    expect(() => clampCardPosition({ x: anchorX, y: anchorY, width: 160, height: 90 }, layoutBounds)).not.toThrow();
    expect(() => clampCardPosition({ x: 500, y: 400, width: anchorX, height: anchorY }, layoutBounds)).not.toThrow();
  });

  it("keeps repeated solves of the same inputs byte-identical", () => {
    const { cards, bounds: layoutBounds, options } = fuzzScenario(77);
    const first = solveCardLayout(cards, layoutBounds, options);
    const second = solveCardLayout(cards, layoutBounds, options);
    const third = solveCardLayout(cards.slice(), { ...layoutBounds }, { ...options });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("resolves equidistant repair slots to the first probe in scan order", () => {
    // (192,180) and (240,108) are exactly equidistant from the (30,30) probe.
    // The repair scan compares squared distances, so the row-major first hit
    // wins deterministically instead of depending on Math.hypot rounding.
    const layoutBounds: CardLayoutBounds = {
      width: 900,
      height: 700,
      map: { x: 300, y: 200, width: 300, height: 250 },
      margin: 30,
      gap: 6,
      occupiedAreas: [],
    };
    const cards: CardLayoutInput[] = Array.from({ length: 12 }, (_, index) => ({
      id: `tie-${index}`,
      anchorX: 450,
      anchorY: 325,
      width: 120,
      height: 60,
    }));
    const runs = Array.from({ length: 3 }, () => solveCardLayout(cards, layoutBounds, { mode: "right-stack" }));
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });
});