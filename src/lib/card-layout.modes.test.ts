import { describe, expect, it } from "vitest";
import {
  layoutCards,
  solveCardLayout,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
} from "./card-layout";
import { buildConnectorGeometry, connectorGeometriesIntersect } from "./connector-geometry";
import { assertHardConstraints, bounds, cardInput, overlaps } from "./card-layout-test-fixtures";

function straightCrossings(placements: CardPlacement[], clearance = 1): number {
  const geometries = placements.map((placement) => buildConnectorGeometry({
    card: placement,
    anchor: { x: placement.anchorX, y: placement.anchorY },
    preferredSide: placement.side,
    style: "straight",
  }));
  let crossings = 0;
  for (let left = 0; left < geometries.length; left += 1) {
    for (let right = left + 1; right < geometries.length; right += 1) {
      if (connectorGeometriesIntersect(geometries[left]!, geometries[right]!, clearance)) crossings += 1;
    }
  }
  return crossings;
}

function anchorDistance(placement: CardPlacement): number {
  return Math.hypot(
    placement.x + placement.width / 2 - placement.anchorX,
    placement.y + placement.height / 2 - placement.anchorY,
  );
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

  it.each<CardLayoutMode>(["proximity", "columns", "quadrant", "radial", "right-stack", "grid"])(
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

  it("proximity mode parks every card far closer to its anchor than a naive dump", () => {
    // Anchors sit inside the obstacle, so no card can simply stay put.
    const occupied = [{ x: 420, y: 200, width: 620, height: 520 }];
    const layoutBounds: CardLayoutBounds = { ...bounds, occupiedAreas: occupied };
    const input = [
      cardInput({ id: "nw", anchorX: 470, anchorY: 250, width: 170, height: 90 }),
      cardInput({ id: "ne", anchorX: 1000, anchorY: 260, width: 170, height: 90 }),
      cardInput({ id: "sw", anchorX: 470, anchorY: 670, width: 170, height: 90 }),
      cardInput({ id: "se", anchorX: 1000, anchorY: 660, width: 170, height: 90 }),
      cardInput({ id: "mid", anchorX: 730, anchorY: 460, width: 170, height: 90 }),
    ];

    const result = solveCardLayout(input, layoutBounds, { mode: "proximity" });
    assertHardConstraints(result.placements, layoutBounds, occupied);

    // Naive baseline: each card dumped in the canvas corner opposite its anchor.
    const naive = input.reduce((sum, card) => {
      const x = card.anchorX < bounds.width / 2 ? bounds.width - bounds.margin - card.width : bounds.margin;
      const y = card.anchorY < bounds.height / 2 ? bounds.height - bounds.margin - card.height : bounds.margin;
      return sum + Math.hypot(x + card.width / 2 - card.anchorX, y + card.height / 2 - card.anchorY);
    }, 0);
    const total = (placements: CardPlacement[]) =>
      placements.reduce((sum, card) => sum + anchorDistance(card), 0);
    const stacked = solveCardLayout(input, layoutBounds, { mode: "right-stack" });

    expect(total(result.placements)).toBeLessThan(naive * 0.25);
    expect(total(result.placements)).toBeLessThan(total(stacked.placements) * 0.6);
    for (const placement of result.placements) {
      expect(anchorDistance(placement), placement.id).toBeLessThan(360);
    }
  });

  it("columns mode packs two anchor-ordered columns against the map edges", () => {
    const input = [
      cardInput({ id: "w-north", anchorX: 480, anchorY: 220 }),
      cardInput({ id: "w-mid", anchorX: 500, anchorY: 470 }),
      cardInput({ id: "w-south", anchorX: 460, anchorY: 700 }),
      cardInput({ id: "e-north", anchorX: 1000, anchorY: 250 }),
      cardInput({ id: "e-south", anchorX: 1040, anchorY: 560 }),
    ];

    const result = solveCardLayout(input, bounds, { mode: "columns" });
    expect(result.status).toBe("solved");
    assertHardConstraints(result.placements, bounds);

    const sides = Object.fromEntries(result.placements.map((card) => [card.id, card.side]));
    expect(sides).toEqual({
      "w-north": "left",
      "w-mid": "left",
      "w-south": "left",
      "e-north": "right",
      "e-south": "right",
    });

    for (const side of ["left", "right"] as const) {
      const column = result.placements
        .filter((card) => card.side === side)
        .sort((left, right) => left.anchorY - right.anchorY);
      const ys = column.map((card) => card.y);
      expect(ys, side).toEqual([...ys].sort((left, right) => left - right));
      for (const card of column) {
        // Hugging the map's outer edge, never inside it.
        if (side === "left") expect(card.x + card.width).toBeLessThanOrEqual(bounds.map.x);
        else expect(card.x).toBeGreaterThanOrEqual(bounds.map.x + bounds.map.width);
      }
    }
  });

  it("columns mode moves the split line to even out the two columns when auto-balancing", () => {
    const input = [
      cardInput({ id: "c1", anchorX: 400, anchorY: 200 }),
      cardInput({ id: "c2", anchorX: 450, anchorY: 340 }),
      cardInput({ id: "c3", anchorX: 500, anchorY: 480 }),
      cardInput({ id: "c4", anchorX: 550, anchorY: 620 }),
      cardInput({ id: "c5", anchorX: 1000, anchorY: 400 }),
    ];
    const countLeft = (autoBalance: boolean) =>
      solveCardLayout(input, bounds, { mode: "columns", autoBalance })
        .placements.filter((card) => card.side === "left").length;

    // The map centre line leaves a 4/1 split; balancing pulls it left to 2/3.
    expect(countLeft(false)).toBe(4);
    expect(countLeft(true)).toBe(2);
  });

  it("never ships crossing connectors when a crossing-free arrangement exists", () => {
    const occupied = [{ x: 420, y: 200, width: 620, height: 520 }];
    const layoutBounds: CardLayoutBounds = { ...bounds, occupiedAreas: occupied };
    const input = [
      cardInput({ id: "north", anchorX: 1000, anchorY: 260, width: 200, height: 100 }),
      cardInput({ id: "south", anchorX: 1000, anchorY: 660, width: 200, height: 100 }),
    ];
    // A layout that swaps the two obvious slots really does cross, so the
    // assertion below is not vacuously satisfied by an easy board.
    const swapped: CardPlacement[] = [
      { ...input[0]!, x: 1180, y: 610, side: "right" },
      { ...input[1]!, x: 1180, y: 210, side: "right" },
    ];
    expect(straightCrossings(swapped)).toBeGreaterThan(0);

    const result = solveCardLayout(input, layoutBounds, {
      mode: "proximity",
      connectorStyle: "straight",
      connectorWidth: 1,
    });

    expect(result.status).toBe("solved");
    expect(straightCrossings(result.placements)).toBe(0);
    assertHardConstraints(result.placements, layoutBounds, occupied);
  });

  it("reports a fallback with the fewest crossings instead of throwing when none is crossing-free", () => {
    const input = Array.from({ length: 6 }, (_, i) => cardInput({
      id: `cross-${i}`,
      anchorX: 700 + (i % 2) * 120,
      anchorY: 380 + (i % 3) * 60,
      width: 200,
      height: 110,
    }));
    const result = solveCardLayout(input, bounds, {
      mode: "grid",
      connectorStyle: "straight",
      connectorWidth: 1,
    });

    expect(result.placements).toHaveLength(input.length);
    expect(result.status).toBe("fallback");
    expect(straightCrossings(result.placements)).toBeGreaterThan(0);
    assertHardConstraints(result.placements, bounds);
    expect(solveCardLayout(input, bounds, {
      mode: "grid",
      connectorStyle: "straight",
      connectorWidth: 1,
      forbidConnectorCrossing: false,
    }).status).toBe("solved");
  });

  it("treats element areas as obstacles unless element overlap is allowed", () => {
    const elementAreas: CardArea[] = [{ x: 40, y: 500, width: 1420, height: 460 }];
    const layoutBounds: CardLayoutBounds = {
      ...bounds,
      occupiedAreas: [{ ...bounds.map }],
      elementAreas,
    };
    const input = Array.from({ length: 4 }, (_, i) => cardInput({
      id: `el-${i}`,
      anchorX: 500 + i * 200,
      anchorY: 760,
      width: 200,
      height: 100,
    }));

    const strict = solveCardLayout(input, layoutBounds, { mode: "quadrant" });
    for (const placement of strict.placements) {
      expect(overlaps(placement, elementAreas[0]!), placement.id).toBe(false);
    }

    const relaxed = solveCardLayout(
      input,
      { ...layoutBounds, allowElementOverlap: true },
      { mode: "proximity" },
    );
    expect(relaxed.status).toBe("solved");
    expect(relaxed.placements.every((placement) => overlaps(placement, elementAreas[0]!))).toBe(true);
    // Relaxing elements must not relax the map.
    for (const placement of relaxed.placements) {
      expect(overlaps(placement, bounds.map), placement.id).toBe(false);
    }
  });
});
