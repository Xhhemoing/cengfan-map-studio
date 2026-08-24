import { describe, expect, it } from "vitest";
import {
  classifyQuadrant,
  isotonicPack,
  packSideCards,
  packSides,
} from "./card-layout-modes";
import { LayoutSpace, PlacementIndex } from "./card-layout-space";
import type { CardLayoutInput } from "./card-layout-types";

const occupied = { x: 300, y: 220, width: 300, height: 260 };

function makeSpace(): LayoutSpace {
  return new LayoutSpace({
    width: 900,
    height: 700,
    map: occupied,
    occupiedAreas: [occupied],
    margin: 20,
    gap: 12,
  });
}

/**
 * Seven cards on a 900×700 canvas whose left column cannot hold all four cards
 * assigned to it. The left assignment order (c0, c1, c2, c3) differs from the
 * order the cards pack in along the side axis (c3, c2, c0, c1), which is what
 * makes the overflow bookkeeping observable.
 */
const crowdedLeftColumn: CardLayoutInput[] = [
  { id: "c0", anchorX: 438, anchorY: 372, width: 167, height: 165 },
  { id: "c1", anchorX: 252, anchorY: 452, width: 121, height: 175 },
  { id: "c2", anchorX: 260, anchorY: 308, width: 140, height: 91 },
  { id: "c3", anchorX: 305, anchorY: 298, width: 178, height: 173 },
  { id: "c4", anchorX: 604, anchorY: 326, width: 172, height: 91 },
  { id: "c5", anchorX: 562, anchorY: 334, width: 146, height: 129 },
  { id: "c6", anchorX: 567, anchorY: 473, width: 138, height: 176 },
];

describe("isotonicPack", () => {
  it("keeps the input order and separates cards by the gap", () => {
    const positions = isotonicPack([0, 10, 20], [40, 40, 40], 10, { start: 0, end: 300 });

    expect(positions[1]! - positions[0]!).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(positions[2]! - positions[1]!).toBeGreaterThanOrEqual(50 - 1e-6);
  });

  it("compresses the gap and stays inside the span when the chain overflows", () => {
    const positions = isotonicPack([0, 0, 0], [100, 100, 100], 40, { start: 0, end: 320 });

    expect(positions[0]!).toBeGreaterThanOrEqual(-1e-6);
    expect(positions[2]! + 100).toBeLessThanOrEqual(320 + 1e-6);
  });
});

describe("packSideCards", () => {
  it("pairs every placement with the input it came from, in side-axis order", () => {
    const space = makeSpace();
    const assignment = classifyQuadrant(crowdedLeftColumn, space, {}).find((entry) => entry.side === "left")!;

    const packed = packSideCards(assignment, space, PlacementIndex.forSpace(space));

    // The pairing is the contract: index order follows the packing axis, not
    // the assignment, so callers must read `card` instead of indexing back.
    expect(packed.every((entry) => entry.card.id === entry.placement.id)).toBe(true);
    expect(packed.map((entry) => entry.card.id)).toEqual(["c3", "c2", "c0", "c1"]);
    expect(packed.map((entry) => entry.card.id)).not.toEqual(assignment.cards.map((card) => card.id));
  });
});

describe("packSides", () => {
  it("overflows the card that broke the block, not the one at its index", () => {
    const placements = packSides(crowdedLeftColumn, makeSpace(), "quadrant", {});
    const byId = new Map(placements.map((placement) => [placement.id, placement]));

    // The left column fits c3, c2 and c0; c1 is the card it cannot take.
    expect(byId.get("c3")!.side).toBe("left");
    expect(byId.get("c2")!.side).toBe("left");
    expect(byId.get("c0")!.side).toBe("left");
    // "top" is the neighbour side "left" overflows to.
    expect(byId.get("c1")!.side).toBe("top");
  });

  it("places every card exactly once when a side rejects part of its block", () => {
    const placements = packSides(crowdedLeftColumn, makeSpace(), "quadrant", {});

    expect(placements.map((placement) => placement.id).sort())
      .toEqual(crowdedLeftColumn.map((card) => card.id).sort());
  });

  it("never places a card twice across randomized boards", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let board = 0; board < 60; board += 1) {
      const cards: CardLayoutInput[] = Array.from({ length: 4 + Math.floor(random() * 10) }, (_, index) => ({
        id: `c${index}`,
        anchorX: 250 + random() * 400,
        anchorY: 200 + random() * 300,
        width: 120 + Math.floor(random() * 60),
        height: 80 + Math.floor(random() * 160),
      }));
      for (const mode of ["quadrant", "radial"] as const) {
        const ids = packSides(cards, makeSpace(), mode, { autoBalance: true })
          .map((placement) => placement.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(ids).size).toBe(cards.length);
      }
    }
  });
});
