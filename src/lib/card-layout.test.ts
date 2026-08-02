import { describe, expect, it } from "vitest";
import {
  clampCardPosition,
  layoutCards,
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
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
      const input = [
        cardInput({ id: "nw", anchorX: 610, anchorY: 220 }),
        cardInput({ id: "se", anchorX: 930, anchorY: 650 }),
        cardInput({ id: "ne", anchorX: 940, anchorY: 250 }),
        cardInput({ id: "sw", anchorX: 590, anchorY: 620 }),
        cardInput({ id: "c", anchorX: 760, anchorY: 460 }),
      ];
      const result = solveCardLayout(input, { ...bounds, occupiedAreas: occupied }, { mode });
      expect(result.placements).toHaveLength(input.length);
      assertHardConstraints(result.placements, { ...bounds, occupiedAreas: occupied }, occupied);
    },
  );

  it("auto-balances the left/right split to equalize column heights", () => {
    const input = Array.from({ length: 7 }, (_, i) => cardInput({
      id: `e-${i}`,
      anchorX: 760 + (i % 3) * 60,
      anchorY: 200 + i * 90,
    }));
    const balanced = solveCardLayout(input, bounds, { mode: "quadrant", autoBalance: true });
    const leftCount = balanced.placements.filter((c) => c.side === "left").length;
    const rightCount = balanced.placements.filter((c) => c.side === "right").length;
    // With autoBalance, neither side should hold all cards.
    expect(leftCount).toBeGreaterThan(0);
    expect(rightCount).toBeGreaterThan(0);
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
    // Grid should use >1 row and >1 column for 9 cards.
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
    // All visible inside canvas.
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

  it("clamps a manual drag position outside the map frame and province AABBs", () => {
    const occupied = [{ x: 520, y: 240, width: 230, height: 330 }];
    const pos = clampCardPosition({ x: 600, y: 400, width: 220, height: 110 }, { ...bounds, occupiedAreas: occupied });
    expect(pos.x).toBeGreaterThanOrEqual(bounds.margin);
    expect(pos.y).toBeGreaterThanOrEqual(bounds.margin);
    expect(pos.x + 220).toBeLessThanOrEqual(bounds.width - bounds.margin);
    expect(pos.y + 110).toBeLessThanOrEqual(bounds.height - bounds.margin);
    expect(overlaps({ ...pos, width: 220, height: 110 }, bounds.map)).toBe(false);
    expect(overlaps({ ...pos, width: 220, height: 110 }, occupied[0]!)).toBe(false);
  });

  it("prioritizes the map union when many province obstacles cover a manual position", () => {
    const occupied = Array.from({ length: 20 }, (_, index) => ({
      x: 500 + index * 5,
      y: 300 + index * 3,
      width: 180,
      height: 140,
    }));
    const position = { x: 600, y: 400, width: 220, height: 110 };

    const clamped = clampCardPosition(position, { ...bounds, occupiedAreas: occupied });

    expect(overlaps({ ...clamped, width: position.width, height: position.height }, bounds.map)).toBe(false);
  });

  it("finds a free position when map and fixed obstacles would cause escape oscillation", () => {
    const fixedObstacle = { x: 500, y: 885, width: 500, height: 45 };
    const position = { x: 600, y: 400, width: 220, height: 116 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [fixedObstacle],
    });
    const card = { ...clamped, width: position.width, height: position.height };

    expect(overlaps(card, bounds.map)).toBe(false);
    expect(overlaps(card, fixedObstacle)).toBe(false);
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
      height: 400,
      map: { x: 0, y: 0, width: 600, height: 400 },
      occupiedAreas: [],
      margin: 20,
      gap: 8,
      allowMapOverlap: true,
    };
    const card = cardInput({ id: "inside", anchorX: 300, anchorY: 200, width: 180, height: 90 });

    const result = solveCardLayout([card], fullMapBounds, { mode: "grid" });

    expect(result.status).toBe("solved");
    expect(overlaps(result.placements[0]!, fullMapBounds.map)).toBe(true);
  });

  it("uses content bounds (not the raw map frame) as the anchor for side rails when provided", () => {
    // Content bounds much smaller than the map frame and shifted right.
    const b: CardLayoutBounds = {
      ...bounds,
      map: { x: 500, y: 200, width: 300, height: 300 },
    };
    const input = [
      cardInput({ id: "left", anchorX: 400, anchorY: 460 }),
      cardInput({ id: "right", anchorX: 900, anchorY: 460 }),
    ];
    const cards = layoutCards(input, b, { mode: "quadrant" });
    const left = cards.find((c) => c.id === "left")!;
    const right = cards.find((c) => c.id === "right")!;
    expect(left.side).toBe("left");
    expect(right.side).toBe("right");
    // Left card sits to the left of the content box, not the (wider) map frame left edge.
    expect(left.x + left.width).toBeLessThanOrEqual(b.map.x);
    expect(right.x).toBeGreaterThanOrEqual(b.map.x + b.map.width);
    assertHardConstraints(cards, b);
  });

  it("keeps same-anchor cluster cards adjacent and non-overlapping", () => {
    const occupied = [{ x: 560, y: 170, width: 430, height: 540 }];
    const input = [
      cardInput({ id: "bj-a", anchorX: 900, anchorY: 300 }),
      cardInput({ id: "bj-b", anchorX: 902, anchorY: 302 }),
      cardInput({ id: "gd", anchorX: 860, anchorY: 720 }),
    ];
    const cards = layoutCards(input, { ...bounds, occupiedAreas: occupied }, { mode: "quadrant" });
    const bjA = cards.find((c) => c.id === "bj-a")!;
    const bjB = cards.find((c) => c.id === "bj-b")!;
    expect(bjA.side).toBe(bjB.side);
    expect(overlaps(bjA, bjB)).toBe(false);
    assertHardConstraints(cards, { ...bounds, occupiedAreas: occupied }, occupied);
  });

  it("uses real province pixels instead of the map union box as a placement obstacle", () => {
    const actualProvinceAreas = [
      { x: 560, y: 320, width: 180, height: 180 },
      { x: 820, y: 320, width: 180, height: 180 },
    ];
    const result = solveCardLayout([
      cardInput({ id: "central", anchorX: 760, anchorY: 410, width: 180, height: 100 }),
    ], {
      ...bounds,
      map: { x: 350, y: 180, width: 800, height: 560 },
      occupiedAreas: actualProvinceAreas,
    }, { mode: "quadrant" });
    const card = result.placements[0]!;

    expect(card.x).toBeGreaterThanOrEqual(350);
    expect(card.x + card.width).toBeLessThanOrEqual(1150);
    expect(card.y).toBeGreaterThanOrEqual(180);
    expect(card.y + card.height).toBeLessThanOrEqual(740);
    expect(actualProvinceAreas.some((area) => overlaps(card, area))).toBe(false);
    expect(Math.hypot(card.x + card.width / 2 - 760, card.y + card.height / 2 - 410)).toBeLessThan(360);
  });

  it("distributes cardinal province anchors around all four sides when the center is occupied", () => {
    const occupied = [{ x: 560, y: 300, width: 400, height: 320 }];
    const input = [
      cardInput({ id: "north", anchorX: 760, anchorY: 330 }),
      cardInput({ id: "east", anchorX: 930, anchorY: 460 }),
      cardInput({ id: "south", anchorX: 760, anchorY: 590 }),
      cardInput({ id: "west", anchorX: 590, anchorY: 460 }),
    ];
    const result = solveCardLayout(input, { ...bounds, occupiedAreas: occupied }, { mode: "radial", connectorStyle: "straight" });

    expect(new Set(result.placements.map((card) => card.side))).toEqual(new Set(["top", "right", "bottom", "left"]));
    assertHardConstraints(result.placements, { ...bounds, occupiedAreas: occupied }, occupied);
  });

  it("uses the renderer connector geometry while optimizing for distance and crossings", () => {
    const input = [
      cardInput({ id: "c0", anchorX: 786.5, anchorY: 199.8, width: 170, height: 90 }),
      cardInput({ id: "c1", anchorX: 750.9, anchorY: 204.9, width: 170, height: 90 }),
      cardInput({ id: "c2", anchorX: 1011.5, anchorY: 375.7, width: 170, height: 90 }),
      cardInput({ id: "c3", anchorX: 691.5, anchorY: 330.5, width: 170, height: 90 }),
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
