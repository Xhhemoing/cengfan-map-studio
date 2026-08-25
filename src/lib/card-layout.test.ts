import { describe, expect, it } from "vitest";
import {
  clampCardPosition,
  layoutCards,
  solveCardLayout,
  __layoutDebug,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
  type ConnectorSearchDecision,
} from "./card-layout";
import { optimizedLayout } from "./card-layout-optimizer";
import { LayoutSpace } from "./card-layout-space";
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

/** Pairs of leader lines that cross, as the canvas would draw them. */
function countCrossings(placements: readonly CardPlacement[]): number {
  const geometries = placements.map((card) => buildConnectorGeometry({
    card,
    anchor: { x: card.anchorX, y: card.anchorY },
    preferredSide: card.side,
    style: "curve",
  }));
  let crossings = 0;
  for (let i = 0; i < geometries.length; i += 1) {
    for (let j = i + 1; j < geometries.length; j += 1) {
      if (connectorGeometriesIntersect(geometries[i]!, geometries[j]!, 1.5)) crossings += 1;
    }
  }
  return crossings;
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

  it("returns an empty solved layout for empty input in every mode", () => {
    for (const mode of ["quadrant", "radial", "right-stack", "grid"] as CardLayoutMode[]) {
      const result = solveCardLayout([], bounds, { mode });
      expect(result).toEqual({ status: "solved", placements: [], mode });
    }
  });

  it("places a single card beside its anchor without touching the map", () => {
    const occupied = [{ x: 350, y: 120, width: 800, height: 690 }];
    const result = solveCardLayout(
      [cardInput({ id: "only", anchorX: 1100, anchorY: 500 })],
      { ...bounds, occupiedAreas: occupied },
      { mode: "quadrant" },
    );
    expect(result.status).toBe("solved");
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]!.side).toBe("right");
    assertHardConstraints(result.placements, { ...bounds, occupiedAreas: occupied }, occupied);
  });

  it("never throws on degenerate canvases and still returns every card", () => {
    const degenerate: CardLayoutBounds[] = [
      { width: 0, height: 0, map: { x: 0, y: 0, width: 0, height: 0 }, margin: 0, gap: 0 },
      { width: 200, height: 150, map: { x: 10, y: 10, width: 50, height: 50 }, margin: 400, gap: 12 },
      { width: 300, height: 300, map: { x: 0, y: 0, width: 300, height: 300 }, margin: 150, gap: 0 },
    ];
    const input = [
      cardInput({ id: "a", anchorX: 10, anchorY: 10 }),
      cardInput({ id: "b", anchorX: 120, anchorY: 90 }),
    ];
    for (const canvas of degenerate) {
      for (const mode of ["quadrant", "radial", "right-stack", "grid"] as CardLayoutMode[]) {
        const result = solveCardLayout(input, canvas, { mode });
        expect(result.placements).toHaveLength(input.length);
        expect(result.placements.map((placement) => placement.id)).toEqual(["a", "b"]);
        for (const placement of result.placements) {
          expect(Number.isFinite(placement.x)).toBe(true);
          expect(Number.isFinite(placement.y)).toBe(true);
        }
      }
    }
  });

  it("keeps non-finite input from poisoning the result", () => {
    const broken = [
      { id: "nan", anchorX: Number.NaN, anchorY: Number.NaN, width: 120, height: 60 },
      { id: "infinite", anchorX: Number.POSITIVE_INFINITY, anchorY: -100, width: Number.NaN, height: -40 },
      cardInput({ id: "sane", anchorX: 700, anchorY: 400 }),
    ];
    const result = solveCardLayout(broken, bounds, { mode: "quadrant" });
    expect(result.placements.map((placement) => placement.id)).toEqual(["nan", "infinite", "sane"]);
    for (const placement of result.placements) {
      expect(Number.isFinite(placement.x)).toBe(true);
      expect(Number.isFinite(placement.y)).toBe(true);
      expect(Number.isFinite(placement.width)).toBe(true);
      expect(Number.isFinite(placement.height)).toBe(true);
    }
  });

  it("separates cards that share the exact same anchor", () => {
    const occupied = [{ x: 560, y: 220, width: 380, height: 500 }];
    const input = Array.from({ length: 6 }, (_, i) => cardInput({
      id: `same-${i}`,
      anchorX: 750,
      anchorY: 470,
      width: 160,
      height: 80,
    }));
    const result = solveCardLayout(input, { ...bounds, occupiedAreas: occupied }, { mode: "quadrant" });
    expect(result.status).toBe("solved");
    expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
    assertHardConstraints(result.placements, { ...bounds, occupiedAreas: occupied }, occupied);
  });

  it("auto-places over the map when allowMapOverlap is set and honours other obstacles", () => {
    const obstacle = { x: 40, y: 40, width: 200, height: 120 };
    const permissive: CardLayoutBounds = {
      width: 700,
      height: 560,
      map: { x: 60, y: 60, width: 580, height: 440 },
      margin: 24,
      gap: 10,
      occupiedAreas: [obstacle],
      allowMapOverlap: true,
    };
    const input = Array.from({ length: 5 }, (_, i) => cardInput({
      id: `o-${i}`,
      anchorX: 150 + i * 90,
      anchorY: 200 + (i % 2) * 150,
      width: 150,
      height: 70,
    }));
    const result = solveCardLayout(input, permissive, { mode: "quadrant" });
    expect(result.status).toBe("solved");
    assertHardConstraints(result.placements, permissive, [obstacle]);
    // The map itself is coverable, so at least one card should sit over it.
    expect(result.placements.some((placement) => overlaps(placement, permissive.map))).toBe(true);
  });

  it("reports fallback but stays contained when the canvas cannot hold the cards", () => {
    const saturated: CardLayoutBounds = {
      width: 700,
      height: 500,
      map: { x: 200, y: 100, width: 300, height: 300 },
      margin: 20,
      gap: 10,
      occupiedAreas: [{ x: 200, y: 100, width: 300, height: 300 }],
    };
    const input = Array.from({ length: 30 }, (_, i) => cardInput({
      id: `sat-${i}`,
      anchorX: 350,
      anchorY: 250,
      width: 200,
      height: 100,
    }));
    const result = solveCardLayout(input, saturated, { mode: "quadrant" });
    expect(result.status).toBe("fallback");
    // The area proof settles this board, so it is the short saturated path
    // rather than the full contained ladder that has to keep caller order.
    expect(__layoutDebug.last!.decision).toBe("skipped-infeasible");
    expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
    for (const placement of result.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(saturated.margin - 1e-6);
      expect(placement.y).toBeGreaterThanOrEqual(saturated.margin - 1e-6);
      expect(placement.x + placement.width).toBeLessThanOrEqual(saturated.width - saturated.margin + 1e-6);
      expect(placement.y + placement.height).toBeLessThanOrEqual(saturated.height - saturated.margin + 1e-6);
    }
  });

  it("keeps caller order when obstacles, not area, are what make the canvas unsolvable", () => {
    // The area proof passes — six cards need a fraction of the canvas — so the
    // solve walks the whole ladder and lands in the contained fallback instead
    // of the saturated shortcut. Nothing validates that result, so the order it
    // ships is whatever the winning contained strategy happened to produce, and
    // every one of those strategies packs in an order of its own.
    const walled: CardLayoutBounds = {
      width: 800,
      height: 600,
      map: { x: 20, y: 20, width: 760, height: 500 },
      margin: 20,
      gap: 10,
      // Leaves a 60px strip below the wall: too shallow for any card, so no
      // legal arrangement exists at all.
      occupiedAreas: [{ x: 20, y: 20, width: 760, height: 500 }],
    };
    // Anchors descend, so reading order — what the sweep, the shelf and the
    // layered pack all sort by — is the reverse of the input order.
    const input = Array.from({ length: 6 }, (_, i) => cardInput({
      id: `w-${i}`,
      anchorX: 700 - i * 100,
      anchorY: 520 - i * 80,
      width: 200,
      height: 100,
    }));

    // `grid` places by rule and degrades from there; the packing modes reach
    // the same contained fallback after the repair ladder comes back empty.
    const paths: Array<[CardLayoutMode, ConnectorSearchDecision]> = [
      ["quadrant", "skipped-no-legal-layout"],
      ["radial", "skipped-no-legal-layout"],
      ["right-stack", "skipped-no-legal-layout"],
      ["grid", "skipped-mode"],
    ];
    for (const [mode, decision] of paths) {
      const result = solveCardLayout(input, walled, { mode });
      expect({ mode, status: result.status, decision: __layoutDebug.last!.decision })
        .toEqual({ mode, status: "fallback", decision });
      expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
      for (const placement of result.placements) {
        expect(placement.x).toBeGreaterThanOrEqual(walled.margin - 1e-6);
        expect(placement.y).toBeGreaterThanOrEqual(walled.margin - 1e-6);
        expect(placement.x + placement.width).toBeLessThanOrEqual(walled.width - walled.margin + 1e-6);
        expect(placement.y + placement.height).toBeLessThanOrEqual(walled.height - walled.margin + 1e-6);
      }
    }
  });

  it("keeps 150 dense cards deterministic, in bounds and non-overlapping", () => {
    const dense: CardLayoutBounds = {
      width: 1600,
      height: 1100,
      map: { x: 500, y: 300, width: 300, height: 220 },
      margin: 30,
      gap: 6,
      occupiedAreas: [{ x: 500, y: 300, width: 300, height: 220 }],
    };
    const input = Array.from({ length: 150 }, (_, i) => cardInput({
      id: `d-${i}`,
      anchorX: 120 + ((i * 97) % 1360),
      anchorY: 80 + ((i * 53) % 940),
      width: 84,
      height: 38,
    }));
    const first = solveCardLayout(input, dense, { mode: "quadrant" });
    const second = solveCardLayout(input, dense, { mode: "quadrant" });
    expect(second).toEqual(first);
    expect(first.status).toBe("solved");
    expect(first.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
    assertHardConstraints(first.placements, dense, dense.occupiedAreas);
  });

  it("is deterministic for every mode, obstacle shape and option set", () => {
    const polygons = [{
      rings: [[
        { x: 520, y: 240 },
        { x: 900, y: 240 },
        { x: 900, y: 600 },
        { x: 520, y: 600 },
      ]],
    }];
    const input = Array.from({ length: 18 }, (_, i) => cardInput({
      id: `det-${i}`,
      anchorX: 400 + ((i * 131) % 700),
      anchorY: 160 + ((i * 71) % 600),
      width: 130 + (i % 3) * 20,
      height: 60 + (i % 4) * 10,
    }));
    for (const mode of ["quadrant", "radial", "right-stack", "grid"] as CardLayoutMode[]) {
      for (const canvas of [
        bounds,
        { ...bounds, occupiedAreas: [{ x: 520, y: 240, width: 380, height: 360 }] },
        { ...bounds, occupiedAreas: [], occupiedPolygons: polygons },
        { ...bounds, allowMapOverlap: true },
      ]) {
        const options = { mode, autoBalance: mode === "quadrant", connectorStyle: "elbow" as const, connectorWidth: 2 };
        expect(solveCardLayout(input, canvas, options)).toEqual(solveCardLayout(input, canvas, options));
      }
    }
  });

  it("places every card even when no candidate avoids a connector crossing", () => {
    const crowded: CardLayoutBounds = {
      width: 900,
      height: 700,
      map: { x: 250, y: 180, width: 400, height: 340 },
      margin: 24,
      gap: 12,
      occupiedAreas: [{ x: 250, y: 180, width: 400, height: 340 }],
    };
    const input = Array.from({ length: 12 }, (_, i) => cardInput({
      id: `x-${i}`,
      anchorX: 300 + ((i * 37) % 300),
      anchorY: 220 + ((i * 61) % 280),
      width: 170,
      height: 74,
    }));
    const result = solveCardLayout(input, crowded, { mode: "radial", connectorStyle: "curve", connectorWidth: 3 });
    expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
    expect(new Set(result.placements.map((placement) => placement.id)).size).toBe(input.length);
  });

  it("never drops, duplicates or corrupts a card, on either side of the search cap", () => {
    const provinces = Array.from({ length: 34 }, (_, index) => {
      const cx = 400 + ((index * 137) % 700);
      const cy = 150 + ((index * 89) % 560);
      return {
        rings: [Array.from({ length: 24 }, (_, step) => {
          const angle = (step / 24) * Math.PI * 2;
          const radius = 30 + (index % 5) * 8;
          return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
        })],
      };
    });
    const canvases: CardLayoutBounds[] = [
      { ...bounds, occupiedAreas: [bounds.map] },
      { ...bounds, occupiedAreas: [], occupiedPolygons: provinces },
      { ...bounds, occupiedAreas: [{ x: 200, y: 100, width: 1100, height: 800 }] },
    ];
    // Straddles MAX_OPTIMIZED_CARDS (80) so both the searched and the
    // packing-only paths are covered, and 200 saturates every canvas here.
    for (const count of [1, 34, 79, 80, 81, 200]) {
      const input = Array.from({ length: count }, (_, index) => cardInput({
        id: `card-${index}`,
        anchorX: 380 + ((index * 137) % 740),
        anchorY: 140 + ((index * 89) % 620),
        width: 150,
        height: 64,
      }));
      for (const canvas of canvases) {
        for (const mode of ["quadrant", "radial"] as CardLayoutMode[]) {
          const result = solveCardLayout(input, canvas, { mode, connectorStyle: "curve", connectorWidth: 1.5 });
          expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
          for (const placement of result.placements) {
            expect(Number.isFinite(placement.x) && Number.isFinite(placement.y)).toBe(true);
            expect(placement.x).toBeGreaterThanOrEqual(canvas.margin - 1e-6);
            expect(placement.y).toBeGreaterThanOrEqual(canvas.margin - 1e-6);
            expect(placement.x + placement.width).toBeLessThanOrEqual(canvas.width - canvas.margin + 1e-6);
            expect(placement.y + placement.height).toBeLessThanOrEqual(canvas.height - canvas.margin + 1e-6);
          }
        }
      }
    }
  });

  it("never lets the connector search return a worse layout than packing alone", () => {
    // Both canvases protect exactly the map frame, so they pose the identical
    // problem — but only the explicit `occupiedAreas` form counts as geography
    // worth searching, so the other one shows what packing alone produces.
    const searched: CardLayoutBounds = { ...bounds, occupiedAreas: [bounds.map] };
    const packedOnly: CardLayoutBounds = { ...bounds };

    for (const count of [12, 30, 55]) {
      const input = Array.from({ length: count }, (_, index) => cardInput({
        id: `q-${index}`,
        anchorX: 380 + ((index * 137) % 740),
        anchorY: 140 + ((index * 89) % 620),
        width: 150,
        height: 64,
      }));
      const withSearch = solveCardLayout(input, searched, { mode: "quadrant", connectorStyle: "curve", connectorWidth: 1.5 });
      const withoutSearch = solveCardLayout(input, packedOnly, { mode: "quadrant", connectorStyle: "curve", connectorWidth: 1.5 });
      expect(withSearch.status).toBe(withoutSearch.status);
      expect(countCrossings(withSearch.placements)).toBeLessThanOrEqual(countCrossings(withoutSearch.placements));
    }
  });

  it("keeps every saturated card contained, distinct and mostly unstacked", () => {
    const shapes: Array<[CardLayoutBounds, number, number, number]> = [
      // [canvas, card width, card height, card count]
      [{ width: 600, height: 400, map: { x: 150, y: 80, width: 300, height: 240 }, margin: 16, gap: 8 }, 150, 70, 60],
      [{ width: 1500, height: 1000, map: { x: 350, y: 120, width: 800, height: 690 }, margin: 40, gap: 8 }, 150, 70, 400],
      [{ width: 420, height: 260, map: { x: 100, y: 60, width: 220, height: 140 }, margin: 0, gap: 8 }, 220, 110, 150],
      [{ width: 800, height: 500, map: { x: 200, y: 100, width: 400, height: 300 }, margin: 8, gap: 4 }, 90, 40, 400],
      // A canvas with no gap budgets nothing for the fan that keeps stacked
      // cards apart, and put 23 of these 59 cards at another card's exact
      // coordinates until the fan learned to take a hairline out of its slack.
      [{ width: 1078, height: 460, map: { x: 215, y: 69, width: 593, height: 299 }, margin: 32, gap: 0 }, 155, 65, 59],
    ];
    for (const [canvas, width, height, count] of shapes) {
      const input = Array.from({ length: count }, (_, index) => cardInput({
        id: `s-${index}`,
        anchorX: canvas.width * 0.2 + ((index * 53) % (canvas.width * 0.6)),
        anchorY: canvas.height * 0.2 + ((index * 37) % (canvas.height * 0.6)),
        width,
        height,
      }));
      const result = solveCardLayout(input, canvas, { mode: "quadrant" });
      expect(result.status).toBe("fallback");
      expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
      for (const placement of result.placements) {
        expect(Number.isFinite(placement.x) && Number.isFinite(placement.y)).toBe(true);
        expect(placement.x).toBeGreaterThanOrEqual(canvas.margin - 1e-6);
        expect(placement.y).toBeGreaterThanOrEqual(canvas.margin - 1e-6);
        expect(placement.x + placement.width).toBeLessThanOrEqual(canvas.width - canvas.margin + 1e-6);
        expect(placement.y + placement.height).toBeLessThanOrEqual(canvas.height - canvas.margin + 1e-6);
      }
      // No card may sit at exactly another's coordinates: that one is invisible
      // and unselectable, which is worse than any amount of partial overlap.
      const positions = new Set(result.placements.map((placement) => `${placement.x}:${placement.y}`));
      expect({ shape: `${canvas.width}x${canvas.height}`, distinct: positions.size })
        .toEqual({ shape: `${canvas.width}x${canvas.height}`, distinct: count });
    }
  });

  it("fills every slot the saturated canvas holds instead of leaving spares empty", () => {
    // Overlap grows with the square of a slot's occupancy, so the fewest pairs
    // a canvas can force is the even split of its cards over every slot that
    // fits on it. Anything above that bound means slots went unused.
    const shapes: Array<[CardLayoutBounds, number, number, number]> = [
      [{ width: 900, height: 650, map: { x: 225, y: 130, width: 450, height: 390 }, margin: 24, gap: 8 }, 130, 56, 200],
      [{ width: 1500, height: 1000, map: { x: 375, y: 200, width: 750, height: 600 }, margin: 24, gap: 8 }, 150, 64, 200],
      [{ width: 1500, height: 1000, map: { x: 375, y: 200, width: 750, height: 600 }, margin: 24, gap: 8 }, 130, 56, 400],
    ];
    for (const [canvas, width, height, count] of shapes) {
      const input = Array.from({ length: count }, (_, index) => cardInput({
        id: `f-${index}`,
        anchorX: canvas.width * 0.2 + ((index * 53) % (canvas.width * 0.6)),
        anchorY: canvas.height * 0.2 + ((index * 37) % (canvas.height * 0.6)),
        width,
        height,
      }));
      const columns = Math.floor((canvas.width - canvas.margin * 2 + canvas.gap) / (width + canvas.gap));
      const rows = Math.floor((canvas.height - canvas.margin * 2 + canvas.gap) / (height + canvas.gap));
      const slots = Math.max(1, columns * rows);
      const perSlot = Math.floor(count / slots);
      const fullSlots = count % slots;
      const bound = fullSlots * ((perSlot + 1) * perSlot) / 2
        + (slots - fullSlots) * (perSlot * (perSlot - 1)) / 2;

      const result = solveCardLayout(input, canvas, { mode: "quadrant" });

      let pairs = 0;
      for (let i = 0; i < result.placements.length; i += 1) {
        for (let j = i + 1; j < result.placements.length; j += 1) {
          if (overlaps(result.placements[i]!, result.placements[j]!)) pairs += 1;
        }
      }
      expect({ shape: `${count}@${canvas.width}x${canvas.height}`, pairs })
        .toEqual({ shape: `${count}@${canvas.width}x${canvas.height}`, pairs: bound });
    }
  });

  it("shares saturated overlap out instead of piling it into one stack", () => {
    const tiny: CardLayoutBounds = {
      width: 600,
      height: 400,
      map: { x: 150, y: 80, width: 300, height: 240 },
      margin: 16,
      gap: 8,
    };
    const input = Array.from({ length: 60 }, (_, index) => cardInput({
      id: `s-${index}`,
      anchorX: 120 + ((index * 53) % 360),
      anchorY: 90 + ((index * 37) % 220),
      width: 150,
      height: 70,
    }));
    const result = solveCardLayout(input, tiny, { mode: "quadrant" });
    // A single stack would pair every card with every other one; spreading
    // them over slots that tile the canvas has to beat that by a wide margin.
    let pairs = 0;
    for (let i = 0; i < result.placements.length; i += 1) {
      for (let j = i + 1; j < result.placements.length; j += 1) {
        if (overlaps(result.placements[i]!, result.placements[j]!)) pairs += 1;
      }
    }
    expect(pairs).toBeLessThan((input.length * (input.length - 1)) / 2 / 10);
  });

  it("clamps a manual position on degenerate and hostile bounds without NaN", () => {
    const cases: Array<[CardLayoutBounds, { x: number; y: number; width: number; height: number }]> = [
      [bounds, { x: Number.NaN, y: Number.NaN, width: 200, height: 100 }],
      [bounds, { x: -9000, y: 9000, width: 200, height: 100 }],
      [{ ...bounds, width: 0, height: 0, margin: 0 }, { x: 10, y: 10, width: 200, height: 100 }],
      [{ ...bounds, margin: 5000 }, { x: 700, y: 400, width: 200, height: 100 }],
      [bounds, { x: 700, y: 400, width: Number.POSITIVE_INFINITY, height: -50 }],
      [bounds, { x: 700, y: 400, width: Number.NaN, height: Number.NaN }],
      // A blocked origin forces the candidate search, so the degenerate inputs
      // have to survive that path too, not just the early accept.
      [{ ...bounds, occupiedAreas: [{ x: 0, y: 0, width: 1500, height: 1000 }] },
        { x: Number.NaN, y: 400, width: Number.NaN, height: 100 }],
      [{ ...bounds, occupiedAreas: [], occupiedPolygons: [{ rings: [[{ x: Number.NaN, y: 0 }, { x: 900, y: 200 }, { x: 900, y: 600 }]] }] },
        { x: 700, y: 400, width: 200, height: 100 }],
    ];
    for (const [canvas, position] of cases) {
      const clamped = clampCardPosition(position, canvas);
      expect(Number.isFinite(clamped.x)).toBe(true);
      expect(Number.isFinite(clamped.y)).toBe(true);
    }
  });

  it("pushes a manual card clear of a province-dense map, deterministically and quickly", () => {
    // Roughly the vertex budget of the real China outlines, where the clamp
    // used to enumerate the full cross product of every part's AABB edges.
    const occupiedPolygons = Array.from({ length: 240 }, (_, index) => {
      const cx = 380 + ((index * 137) % 720);
      const cy = 140 + ((index * 89) % 600);
      const radius = 26 + (index % 9) * 7;
      return {
        rings: [Array.from({ length: 120 }, (_, step) => {
          const angle = (step / 120) * Math.PI * 2;
          return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
        })],
      };
    });
    const canvas: CardLayoutBounds = { ...bounds, occupiedAreas: [], occupiedPolygons };
    const frames = Array.from({ length: 60 }, (_, index) => ({
      x: 300 + index * 9,
      y: 200 + index * 6,
      width: 220,
      height: 110,
    }));

    const started = performance.now();
    const first = frames.map((frame) => clampCardPosition(frame, canvas));
    const elapsed = performance.now() - started;

    expect(frames.map((frame) => clampCardPosition(frame, canvas))).toEqual(first);
    for (const clamped of first) {
      expect(Number.isFinite(clamped.x) && Number.isFinite(clamped.y)).toBe(true);
      expect(clamped.x).toBeGreaterThanOrEqual(canvas.margin - 1e-6);
      expect(clamped.y).toBeGreaterThanOrEqual(canvas.margin - 1e-6);
      expect(clamped.x + 220).toBeLessThanOrEqual(canvas.width - canvas.margin + 1e-6);
      expect(clamped.y + 110).toBeLessThanOrEqual(canvas.height - canvas.margin + 1e-6);
    }
    // A drag frame has to land inside a frame budget. The unindexed scan took
    // ~1s per frame here, so this is a cliff detector rather than a tight bound.
    expect(elapsed / frames.length).toBeLessThan(50);
  });

  it("puts a manually dragged card on the nearest legal spot, not merely a legal one", () => {
    const blocker = { x: 600, y: 300, width: 300, height: 200 };
    const position = { x: 650, y: 340, width: 120, height: 80 };

    const clamped = clampCardPosition(position, { ...bounds, occupiedAreas: [blocker] });
    const card = { ...clamped, width: position.width, height: position.height };

    expect(overlaps(card, blocker)).toBe(false);
    // Every candidate edge of the blocker is a legal escape; the closest of
    // them is sliding up to sit on its top edge, 60px away.
    expect(clamped).toEqual({ x: 650, y: 220 });
  });

  it("stays deterministic on a board large enough to exhaust the search budget", () => {
    const provinces = Array.from({ length: 34 }, (_, index) => ({
      rings: [Array.from({ length: 90 }, (_, step) => {
        const angle = (step / 90) * Math.PI * 2;
        const radius = 34 + (index % 7) * 5;
        return {
          x: 400 + ((index * 137) % 700) + Math.cos(angle) * radius,
          y: 150 + ((index * 89) % 560) + Math.sin(angle) * radius,
        };
      })],
    }));
    const canvas: CardLayoutBounds = { ...bounds, occupiedAreas: [], occupiedPolygons: provinces };
    const input = Array.from({ length: 70 }, (_, index) => cardInput({
      id: `b-${index}`,
      anchorX: 400 + ((index * 137) % 700),
      anchorY: 150 + ((index * 89) % 560),
      width: 130,
      height: 56,
    }));
    const options = { mode: "quadrant" as const, connectorStyle: "curve" as const, connectorWidth: 1.5 };
    const first = solveCardLayout(input, canvas, options);
    expect(solveCardLayout(input, canvas, options)).toEqual(first);
    expect(solveCardLayout([...input], canvas, options)).toEqual(first);
    expect(first.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
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

/**
 * The search is the most expensive thing a solve can do, so what these assert
 * is *which path was taken*, read off {@link __layoutDebug}. Wall-clock
 * assertions would say the same thing far less reliably on a shared machine.
 */
describe("connector search cost control", () => {
  const provinces = Array.from({ length: 34 }, (_, index) => ({
    rings: [Array.from({ length: 24 }, (_, step) => {
      const angle = (step / 24) * Math.PI * 2;
      const radius = 30 + (index % 5) * 8;
      return {
        x: 400 + ((index * 137) % 700) + Math.cos(angle) * radius,
        y: 150 + ((index * 89) % 560) + Math.sin(angle) * radius,
      };
    })],
  }));
  const vectorBoard: CardLayoutBounds = { ...bounds, occupiedAreas: [], occupiedPolygons: provinces };
  const searchOptions = { connectorStyle: "curve" as const, connectorWidth: 1.5 };

  function roster(count: number, width = 130, height = 56): CardLayoutInput[] {
    return Array.from({ length: count }, (_, index) => cardInput({
      id: `s-${index}`,
      anchorX: 400 + ((index * 137) % 700),
      anchorY: 150 + ((index * 89) % 560),
      width,
      height,
    }));
  }

  it.each<[CardLayoutMode, ConnectorSearchDecision]>([
    ["quadrant", "ran"],
    ["radial", "ran"],
    ["grid", "skipped-mode"],
    ["right-stack", "skipped-mode"],
  ])("only pays for the connector search in a mode that can act on it: %s", (mode, decision) => {
    const input = roster(24);
    const result = solveCardLayout(input, vectorBoard, { ...searchOptions, mode });
    const debug = __layoutDebug.last!;

    expect({ decision: debug.decision, searched: debug.trace !== null })
      .toEqual({ decision, searched: decision === "ran" });
    // Skipping has to leave the placements alone, not just the timings.
    expect(solveCardLayout(input, vectorBoard, { ...searchOptions, mode })).toEqual(result);
    expect(result.placements.map((placement) => placement.id)).toEqual(input.map((card) => card.id));
  });

  it.each<[string, CardLayoutBounds, CardLayoutInput[], ConnectorSearchDecision]>([
    ["no geography to route around", bounds, roster(24), "skipped-no-geography"],
    ["more cards than the search has ever helped", vectorBoard, roster(81, 90, 40), "skipped-card-count"],
    ["a canvas that cannot hold the cards", { ...vectorBoard, width: 500, height: 400 }, roster(60), "skipped-infeasible"],
    ["an empty roster", vectorBoard, [], "skipped-empty"],
  ])("skips the search on %s", (_label, canvas, input, decision) => {
    solveCardLayout(input, canvas, { ...searchOptions, mode: "quadrant" });
    expect(__layoutDebug.last!.decision).toBe(decision);
  });

  it("stops exploring insertion orders once they stop paying off", () => {
    // Rotating the insertion order cannot help every board, and on the ones it
    // cannot the full sweep used to cost several times the packing ladder it
    // was trying to beat.
    for (const canvas of [
      vectorBoard,
      { ...bounds, occupiedAreas: [bounds.map] },
      { ...bounds, occupiedAreas: [{ x: 360, y: 130, width: 360, height: 300 }, { x: 760, y: 130, width: 380, height: 300 }] },
    ]) {
      for (const count of [16, 34]) {
        solveCardLayout(roster(count), canvas, { ...searchOptions, mode: "quadrant" });
        const trace = __layoutDebug.last!.trace!;
        const lastImprovement = trace.improvingOrders.at(-1) ?? -1;
        // The rule, stated as an invariant rather than a magic number: no order
        // runs more than the patience past the last one that improved.
        expect({ stop: trace.stop, wasted: trace.ordersRun - 1 - lastImprovement })
          .toEqual({ stop: "no-gain", wasted: 2 });
      }
    }
  });

  it("gives up before scoring anything when no card has a candidate rectangle", () => {
    // Every rail lands on the obstacle, so each shortlist comes back empty and
    // the seed's own quadratic scoring pass would be paid for nothing.
    const walled = new LayoutSpace({ ...bounds, occupiedAreas: [{ x: 0, y: 0, width: 1500, height: 1000 }] });
    const input = roster(8);
    const seed = input.map((card) => ({ ...card, x: card.anchorX, y: card.anchorY, side: "right" as const }));

    const { placements, trace } = optimizedLayout(input, walled, "quadrant", searchOptions, seed);

    expect(placements).toBeNull();
    expect(trace).toEqual({
      candidates: 0,
      ordersRun: 0,
      ordersScored: 0,
      improvingOrders: [],
      stop: "no-candidates",
      budgetSpent: 0,
    });
  });

  it("hands back the packed layout untouched when it stops without a win", () => {
    // The two canvases protect the same rectangle and so pose the identical
    // problem, but only the explicit `occupiedAreas` form counts as geography
    // worth searching. Whatever the search decides, the other one is exactly
    // what the solve would have shipped without it.
    const searched: CardLayoutBounds = { ...bounds, occupiedAreas: [bounds.map] };
    const packedOnly: CardLayoutBounds = { ...bounds };

    for (const count of [8, 16, 34, 55]) {
      const input = roster(count);
      const withSearch = solveCardLayout(input, searched, { ...searchOptions, mode: "quadrant" });
      const debug = __layoutDebug.last!;
      const withoutSearch = solveCardLayout(input, packedOnly, { ...searchOptions, mode: "quadrant" });

      expect(debug.decision).toBe("ran");
      if (debug.improved) {
        expect(countCrossings(withSearch.placements)).toBeLessThanOrEqual(countCrossings(withoutSearch.placements));
      } else {
        expect(withSearch.placements).toEqual(withoutSearch.placements);
      }
    }
  });
});

/**
 * The solver is spread over a dozen modules, several of which keep mutable
 * state for speed: the grid index stamps entries to de-duplicate a query, the
 * province entries memoize their last ray cast, the occupancy raster is filled
 * in once and read millions of times. All of it is per-`LayoutSpace` and
 * per-query by construction.
 *
 * "Same input, same output" only holds while that stays true, and a solve run
 * on its own can never catch a leak — the state has to be dirtied by something
 * else first. So these run the boards against each other rather than against
 * themselves.
 */
describe("solver state isolation", () => {
  const provinces = Array.from({ length: 20 }, (_, index) => ({
    rings: [Array.from({ length: 30 }, (_, step) => {
      const angle = (step / 30) * Math.PI * 2;
      const radius = 32 + (index % 6) * 7;
      return {
        x: 420 + ((index * 149) % 660) + Math.cos(angle) * radius,
        y: 170 + ((index * 97) % 540) + Math.sin(angle) * radius,
      };
    })],
  }));

  function roster(prefix: string, count: number, width: number, height: number): CardLayoutInput[] {
    return Array.from({ length: count }, (_, index) => cardInput({
      id: `${prefix}-${index}`,
      anchorX: 390 + ((index * 137) % 720),
      anchorY: 145 + ((index * 89) % 610),
      width,
      height,
    }));
  }

  const boards: { name: string; cards: CardLayoutInput[]; canvas: CardLayoutBounds; mode: CardLayoutMode }[] = [
    { name: "vector", cards: roster("v", 22, 140, 60), canvas: { ...bounds, occupiedAreas: [], occupiedPolygons: provinces }, mode: "quadrant" },
    { name: "rectangles", cards: roster("r", 18, 160, 70), canvas: { ...bounds, occupiedAreas: [bounds.map] }, mode: "radial" },
    { name: "open canvas", cards: roster("o", 14, 150, 64), canvas: bounds, mode: "quadrant" },
    { name: "grid", cards: roster("g", 26, 120, 52), canvas: { ...bounds, occupiedAreas: [bounds.map] }, mode: "grid" },
    { name: "saturated", cards: roster("s", 44, 210, 96), canvas: { ...bounds, width: 820, height: 620, occupiedAreas: [{ x: 200, y: 140, width: 420, height: 340 }] }, mode: "quadrant" },
  ];
  const options = { connectorStyle: "curve" as const, connectorWidth: 1.5 };

  it("gives each board the same answer however the solves are interleaved", () => {
    const alone = new Map(boards.map((board) =>
      [board.name, solveCardLayout(board.cards, board.canvas, { ...options, mode: board.mode })]));

    // Round-robin, so every board's solve is sandwiched between two others'
    // and would see any state they left behind.
    for (let pass = 0; pass < 3; pass += 1) {
      for (const board of [...boards].reverse()) {
        const again = solveCardLayout(board.cards, board.canvas, { ...options, mode: board.mode });
        expect({ board: board.name, pass, result: again })
          .toEqual({ board: board.name, pass, result: alone.get(board.name) });
      }
    }
  });

  it("keeps every card on every board, whatever ran before it", () => {
    for (const board of boards) {
      const result = solveCardLayout(board.cards, board.canvas, { ...options, mode: board.mode });
      expect(result.placements.map((placement) => placement.id)).toEqual(board.cards.map((card) => card.id));
      for (const placement of result.placements) {
        expect(Number.isFinite(placement.x) && Number.isFinite(placement.y)).toBe(true);
      }
    }
  });

  it("answers a reused space's obstacle queries independently of probe order", () => {
    // One space, many probes: the raster, the edge index and the per-polygon
    // ray-cast memo are all consulted here, and the memo in particular only
    // holds one slot, so an order-dependent answer would mean it is keyed
    // wrongly.
    const space = new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: provinces });
    const probes = Array.from({ length: 400 }, (_, index) => ({
      x: 40 + ((index * 131) % 1380),
      y: 40 + ((index * 79) % 900),
      width: 20 + (index % 5) * 30,
      height: 18 + (index % 4) * 24,
    }));

    const forward = probes.map((probe) => space.blocked(probe));
    const backward = [...probes].reverse().map((probe) => space.blocked(probe)).reverse();
    expect(backward).toEqual(forward);

    // A fresh space must agree with the one that has answered 800 queries.
    const pristine = new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: provinces });
    expect(probes.map((probe) => pristine.blocked(probe))).toEqual(forward);
  });

  it("counts province crossings independently of the order lines are measured in", () => {
    const space = new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: provinces });
    // Anchors are laid out in columns, so consecutive lines keep asking about
    // the same x with a different y. The per-province ray-cast memo holds a
    // single slot keyed on the whole point, and a column is what tells a
    // correctly keyed memo apart from one that matches on x alone.
    const lines = Array.from({ length: 96 }, (_, index) => {
      const anchor = { x: 420 + (index % 8) * 90, y: 180 + Math.floor(index / 8) * 55 };
      return {
        anchor,
        segments: [{ start: anchor, end: { x: 60 + ((index * 53) % 1340), y: 60 + ((index * 37) % 880) } }],
      };
    });

    const forward = lines.map((line) => space.polygonCrossings(line.segments, line.anchor));
    const backward = [...lines].reverse().map((line) => space.polygonCrossings(line.segments, line.anchor)).reverse();
    const repeated = lines.map((line) => space.polygonCrossings(line.segments, line.anchor));
    // A space that has answered nothing yet has an empty memo, so it is the
    // reference the warmed-up one has to keep agreeing with.
    const pristine = new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: provinces });

    expect(backward).toEqual(forward);
    expect(repeated).toEqual(forward);
    expect(lines.map((line) => pristine.polygonCrossings(line.segments, line.anchor))).toEqual(forward);
    // Guard against the whole thing being trivially zero.
    expect(forward.some((count) => count > 0)).toBe(true);
  });

  it("keeps a line that starts inside a province distinct from one that merely shares its column", () => {
    // The narrowest form of the same hazard: two anchors on one vertical line,
    // one inside the shape and one outside it, crossing the same outline. A
    // memo that forgets to compare y answers the second with the first's ray
    // cast, and the connector score silently loses a province crossing.
    const block = {
      rings: [[
        { x: 400, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 400 }, { x: 400, y: 400 },
      ]],
    };
    const space = new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: [block] });
    const inside = { x: 500, y: 300 };
    const outside = { x: 500, y: 100 };
    const leaving = [{ start: inside, end: { x: 1400, y: 300 } }];
    const entering = [{ start: outside, end: { x: 500, y: 900 } }];

    // Alone: leaving your own province is free, cutting through someone else's costs one.
    expect(space.polygonCrossings(leaving, inside)).toBe(0);
    expect(new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: [block] })
      .polygonCrossings(entering, outside)).toBe(1);
    // Back to back, in both orders.
    expect(space.polygonCrossings(entering, outside)).toBe(1);
    expect(space.polygonCrossings(leaving, inside)).toBe(0);
  });
});

/**
 * A dragged card is drawn where the user dropped it whatever the solver says,
 * so a solve that does not know about it will happily bury it under the next
 * card it places. These pin the coordinates the canvas actually renders.
 */
describe("hand-placed cards", () => {
  const roster = Array.from({ length: 6 }, (_, index) => cardInput({
    id: `card-${index}`,
    anchorX: 420 + (index % 3) * 320,
    anchorY: 200 + Math.floor(index / 3) * 380,
  }));

  /**
   * The spot the unaware solve hands to another card, so a pin placed there is
   * guaranteed to be contested rather than parked on canvas nobody wanted.
   */
  function contestedSpot(mode: CardLayoutMode, canvas: CardLayoutBounds, rival: string): { x: number; y: number } {
    const unaware = solveCardLayout(roster, canvas, { mode });
    const taken = unaware.placements.find((placement) => placement.id === rival)!;
    return { x: taken.x, y: taken.y };
  }

  it("keeps a pinned card where it was dropped and moves the card that wanted the spot", () => {
    const contested = contestedSpot("quadrant", bounds, "card-1");
    const fixedPositions = { "card-2": contested };
    const result = solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions });
    const pinned = result.placements.find((placement) => placement.id === "card-2")!;
    const rival = result.placements.find((placement) => placement.id === "card-1")!;

    expect(result.placements.map((placement) => placement.id)).toEqual(roster.map((card) => card.id));
    expect({ x: pinned.x, y: pinned.y }).toEqual(contested);
    expect({ x: rival.x, y: rival.y }).not.toEqual(contested);
    assertHardConstraints(result.placements, bounds);
  });

  it("clears the whole gap around a pinned card, not merely its rectangle", () => {
    const contested = contestedSpot("quadrant", bounds, "card-1");
    const result = solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions: { "card-2": contested } });
    const pinned = result.placements.find((placement) => placement.id === "card-2")!;
    const withGap = {
      x: pinned.x - bounds.gap,
      y: pinned.y - bounds.gap,
      width: pinned.width + bounds.gap * 2,
      height: pinned.height + bounds.gap * 2,
    };

    for (const placement of result.placements) {
      if (placement.id === "card-2") continue;
      expect({ id: placement.id, hit: overlaps(placement, withGap) }).toEqual({ id: placement.id, hit: false });
    }
  });

  it("keeps a pinned card exactly where it was dropped, even off the canvas margin", () => {
    // The renderer draws the saved coordinate either way, so quietly moving it
    // here would only make the solver's obstacle disagree with the canvas.
    const fixedPositions = { "card-1": { x: -40, y: 12 } };
    const result = solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions });
    const pinned = result.placements.find((placement) => placement.id === "card-1")!;

    expect({ x: pinned.x, y: pinned.y }).toEqual(fixedPositions["card-1"]);
    expect(result.status).toBe("solved");
  });

  it.each<CardLayoutMode>(["quadrant", "radial", "right-stack", "grid"])(
    "packs around pinned cards in %s mode, obstacles and all",
    (mode) => {
      const occupied = [{ x: 560, y: 170, width: 430, height: 540 }];
      const fixedPositions = {
        "card-1": { x: 120, y: 620 },
        "card-4": { x: 1120, y: 180 },
      };
      const canvas = { ...bounds, occupiedAreas: occupied };
      const result = solveCardLayout(roster, canvas, { mode, fixedPositions });

      for (const [id, point] of Object.entries(fixedPositions)) {
        const pinned = result.placements.find((placement) => placement.id === id)!;
        expect({ id, x: pinned.x, y: pinned.y }).toEqual({ id, ...point });
      }
      assertHardConstraints(result.placements, canvas, occupied);
    },
  );

  it("leaves the solve untouched when no card is pinned", () => {
    const plain = solveCardLayout(roster, bounds, { mode: "quadrant" });

    expect(solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions: {} })).toEqual(plain);
    expect(solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions: { absent: { x: 10, y: 10 } } }))
      .toEqual(plain);
    expect(solveCardLayout(roster, bounds, {
      mode: "quadrant",
      fixedPositions: { "card-0": { x: Number.NaN, y: 40 } },
    })).toEqual(plain);
  });

  it("is deterministic and still solves when every card is pinned", () => {
    const fixedPositions = Object.fromEntries(roster.map((card, index) => [
      card.id,
      { x: 60 + (index % 3) * 300, y: 60 + Math.floor(index / 3) * 300 },
    ]));
    const result = solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions });

    expect(result.status).toBe("solved");
    expect(result.placements.map((placement) => ({ x: placement.x, y: placement.y })))
      .toEqual(roster.map((card) => fixedPositions[card.id]));
    expect(solveCardLayout(roster, bounds, { mode: "quadrant", fixedPositions })).toEqual(result);
  });
});