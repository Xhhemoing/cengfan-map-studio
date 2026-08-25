import { describe, expect, it } from "vitest";
import {
  solveCardLayout,
  type CardArea,
  type CardLayoutBounds,
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

describe("card layout: proximity, columns, crossings and overlap switches", () => {
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

  it("degrades to the fewest crossings instead of throwing, and never calls a crossing layout solved", () => {
    // `grid` ignores anchor relationships, so its natural output crosses. Whether
    // the uncrossing repair rescues a given board is an implementation detail that
    // improves over time; what must never change is that `solved` means zero
    // crossings and that switching the constraint on cannot add crossings.
    const boards = [
      Array.from({ length: 6 }, (_, i) => cardInput({
        id: `cross-${i}`,
        anchorX: 700 + (i % 2) * 120,
        anchorY: 380 + (i % 3) * 60,
        width: 200,
        height: 110,
      })),
      // 16 cards is the densest board this canvas still fits; 18 tips it over the
      // saturation cliff, where the solver keeps every card at the cost of overlap.
      Array.from({ length: 16 }, (_, i) => cardInput({
        id: `dense-${i}`,
        anchorX: 420 + (i % 6) * 140,
        anchorY: 260 + ((i * 5) % 7) * 80,
        width: 210,
        height: 105,
      })),
    ];
    for (const input of boards) {
      const options = { mode: "grid", connectorStyle: "straight", connectorWidth: 1 } as const;
      const constrained = solveCardLayout(input, bounds, options);
      const unconstrained = solveCardLayout(input, bounds, { ...options, forbidConnectorCrossing: false });
      const context = `cards=${input.length} status=${constrained.status}`;

      expect(constrained.placements, context).toHaveLength(input.length);
      assertHardConstraints(constrained.placements, bounds);
      expect(straightCrossings(constrained.placements) === 0, `${context} solved must mean uncrossed`)
        .toBe(constrained.status === "solved");
      expect(straightCrossings(constrained.placements), `${context} constraint must not add crossings`)
        .toBeLessThanOrEqual(straightCrossings(unconstrained.placements));
      expect(unconstrained.status, context).toBe("solved");
    }
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
