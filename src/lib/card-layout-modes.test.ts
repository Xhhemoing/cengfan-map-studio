import { describe, expect, it } from "vitest";
import { solveCardLayout } from "./card-layout";
import {
  classifyQuadrant,
  isotonicPack,
  packSideCards,
  packSides,
} from "./card-layout-modes";
import { LayoutSpace, PlacementIndex } from "./card-layout-space";
import type { CardArea, CardLayoutBounds, CardLayoutInput } from "./card-layout-types";

const occupied = { x: 300, y: 220, width: 300, height: 260 };
/** Takes the bottom of the left column away, leaving room for three cards. */
const lowerLeftZone = { x: 20, y: 500, width: 280, height: 180 };

function makeSpace(occupiedAreas: CardArea[] = [occupied], mapArea: CardArea = occupied): LayoutSpace {
  return new LayoutSpace({
    width: 900,
    height: 700,
    map: mapArea,
    occupiedAreas,
    margin: 20,
    gap: 12,
  });
}

/**
 * Seven cards on a 900×700 canvas. The left assignment order (c0, c1, c2, c3)
 * differs from the order the cards pack in along the side axis (c3, c2, c0,
 * c1), which is what makes the overflow bookkeeping observable — but only on
 * {@link lowerLeftZone}, where the column has room for three of the four.
 */
const leftColumnBoard: CardLayoutInput[] = [
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

  it("slides a chain of low targets up as a block instead of stacking its tail", () => {
    // Three 200px cards need 624px of the 660px span, so the span has room —
    // but every target sits near its bottom, which pushes the forward pass
    // past `span.end`.
    const positions = isotonicPack([460, 480, 500], [200, 200, 200], 12, { start: 20, end: 680 });

    expect(positions[1]! - positions[0]!).toBeGreaterThanOrEqual(212 - 1e-6);
    expect(positions[2]! - positions[1]!).toBeGreaterThanOrEqual(212 - 1e-6);
    expect(positions[0]!).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(positions[2]! + 200).toBeLessThanOrEqual(680 + 1e-6);
  });

  it("separates every card whenever the span has room for the chain", () => {
    let seed = 987;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 400; trial += 1) {
      const count = 2 + Math.floor(random() * 5);
      const gap = Math.floor(random() * 20);
      const sizes = Array.from({ length: count }, () => 40 + Math.floor(random() * 120));
      const needed = sizes.reduce((sum, size) => sum + size, 0) + gap * (count - 1);
      // Give the span room for the chain, then aim every target at a random
      // point in it — including the tail, which is where the chain overhangs.
      const span = { start: 20, end: 20 + needed + Math.floor(random() * 200) };
      const targets = Array.from({ length: count }, () => span.start + random() * (span.end - span.start))
        .sort((left, right) => left - right);

      const positions = isotonicPack(targets, sizes, gap, span);

      for (let index = 1; index < count; index += 1) {
        expect(positions[index]! - positions[index - 1]!).toBeGreaterThanOrEqual(sizes[index - 1]! + gap - 1e-6);
      }
      expect(positions[0]!).toBeGreaterThanOrEqual(span.start - 1e-6);
      expect(positions[count - 1]! + sizes[count - 1]!).toBeLessThanOrEqual(span.end + 1e-6);
    }
  });
});

describe("packSideCards", () => {
  it("pairs every placement with the input it came from, in side-axis order", () => {
    const space = makeSpace();
    const assignment = classifyQuadrant(leftColumnBoard, space, {}).find((entry) => entry.side === "left")!;

    const packed = packSideCards(assignment, space, PlacementIndex.forSpace(space));

    // The pairing is the contract: index order follows the packing axis, not
    // the assignment, so callers must read `card` instead of indexing back.
    expect(packed.every((entry) => entry.card.id === entry.placement.id)).toBe(true);
    expect(packed.map((entry) => entry.card.id)).toEqual(["c3", "c2", "c0", "c1"]);
    expect(packed.map((entry) => entry.card.id)).not.toEqual(assignment.cards.map((card) => card.id));
  });
});

describe("packSides", () => {
  /** Leaves no legal spot anywhere, so every card falls out of side packing. */
  const fullyOccupied: CardArea = { x: 0, y: 0, width: 900, height: 700 };
  /** A wide, shallow map: the margin column runs along its *top* edge. */
  const wideMap: CardArea = { x: 100, y: 300, width: 700, height: 100 };

  function strandedCards(count: number): CardLayoutInput[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `c${index}`,
      anchorX: 700,
      anchorY: 300,
      width: 120,
      height: 100,
    }));
  }

  it("overflows the card that broke the block, not the one at its index", () => {
    const placements = packSides(leftColumnBoard, makeSpace([occupied, lowerLeftZone]), "quadrant", {});
    const byId = new Map(placements.map((placement) => [placement.id, placement]));

    // The left column fits c3, c2 and c0; c1 is last along the side axis and
    // the blocked zone takes its spot, so it is the card that overflows.
    expect(byId.get("c3")!.side).toBe("left");
    expect(byId.get("c2")!.side).toBe("left");
    expect(byId.get("c0")!.side).toBe("left");
    // "top" is the neighbour side "left" overflows to. c3 sits at c1's index in
    // the *assignment* order, so reading the rejected card off the index
    // instead of the pairing would overflow c3 — which is already placed.
    expect(byId.get("c1")!.side).toBe("top");
  });

  it("places every card exactly once when a side rejects part of its block", () => {
    const placements = packSides(leftColumnBoard, makeSpace([occupied, lowerLeftZone]), "quadrant", {});

    expect(placements.map((placement) => placement.id).sort())
      .toEqual(leftColumnBoard.map((card) => card.id).sort());
  });

  it("keeps a column that has room for its cards whole", () => {
    // 173 + 91 + 165 + 175 with three gaps is 640px of the 660px side axis, so
    // no card has to leave the left column for the canvas to stay legal.
    const placements = packSides(leftColumnBoard, makeSpace(), "quadrant", {});
    const byId = new Map(placements.map((placement) => [placement.id, placement]));

    for (const id of ["c0", "c1", "c2", "c3"]) expect(byId.get(id)!.side).toBe("left");
  });

  it("labels a leftover card by where it lands, not by the placeholder side", () => {
    // The east column and the bottom band are both walled off, so the one card
    // bounces right → bottom → right for every overflow round and drops out of
    // side packing entirely. It is seated by `containFree`, which is reached
    // with a `side` that was never assigned.
    const eastWall = { x: 600, y: 20, width: 280, height: 660 };
    const bottomWall = { x: 20, y: 480, width: 580, height: 200 };
    const space = makeSpace([occupied, eastWall, bottomWall]);
    const east: CardLayoutInput = { id: "east", anchorX: 700, anchorY: 300, width: 150, height: 120 };

    const [placement] = packSides([east], space, "quadrant", {});

    expect(placement!.x).toBeLessThan(occupied.x);
    expect(placement!.side).toBe("left");
    expect(placement!.side).toBe(space.sideOf(placement!));
  });

  it("labels stacked leftovers by their seat once the canvas is saturated", () => {
    // Nothing can be placed anywhere, so the first card exhausts the free-spot
    // scan, latches `saturated`, and the rest go straight to the margin stack.
    const space = makeSpace([fullyOccupied]);
    const placements = packSides(strandedCards(3), space, "quadrant", {});

    expect(placements).toHaveLength(3);
    for (const placement of placements) {
      expect(placement.x).toBe(space.margin);
      expect(placement.side).toBe(space.sideOf(placement));
      expect(placement.side).not.toBe("right");
    }
  });

  it("sides stacked leftovers above a wide, shallow map by their seats", () => {
    // The same saturated canvas with the map as a band across the middle: the
    // margin column the leftovers stack into runs north of it, not west of it.
    // Seeding the probe with a side before it has a seat pointed every one of
    // these leader lines out of an edge the card does not sit against.
    const space = makeSpace([fullyOccupied], wideMap);

    const placements = packSides(strandedCards(4), space, "quadrant", {});

    expect(placements).toHaveLength(4);
    for (const placement of placements) {
      expect(placement.x).toBe(space.margin);
      expect(placement.side).toBe(space.sideOf(placement));
    }
    const sides = placements.map((placement) => placement.side);
    expect(sides).toContain("top");
    // The column runs past the map, so its tail is genuinely below it.
    expect(sides).toContain("bottom");
    expect(sides).not.toContain("right");
    expect(sides).not.toContain("left");
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

const roomyBounds: CardLayoutBounds = {
  width: 900,
  height: 700,
  map: { x: 300, y: 160, width: 300, height: 380 },
  occupiedAreas: [{ x: 300, y: 160, width: 300, height: 380 }],
  margin: 20,
  gap: 12,
};

function rectsOverlap(left: CardArea, right: CardArea): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

describe("side packing through the solver", () => {
  it("keeps a cluster of southern anchors in the column they belong to", () => {
    // All three anchors sit low on the east flank and the right column has
    // 660px for 624px of card, so the whole cluster belongs on the right.
    const southern: CardLayoutInput[] = [
      { id: "guangdong", anchorX: 700, anchorY: 560, width: 180, height: 200 },
      { id: "guangxi", anchorX: 720, anchorY: 580, width: 180, height: 200 },
      { id: "hainan", anchorX: 740, anchorY: 600, width: 180, height: 200 },
    ];

    const result = solveCardLayout(southern, roomyBounds, { mode: "quadrant" });

    expect(result.status).toBe("solved");
    for (const placement of result.placements) {
      expect(placement.side).toBe("right");
      // Anything flung to the far margin has to drag its leader line back
      // across the whole map.
      expect(placement.x).toBeGreaterThan(roomyBounds.map.x);
    }
  });

  it("never overlaps cards while the canvas still has room for them", () => {
    let seed = 4242;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let board = 0; board < 60; board += 1) {
      const cards: CardLayoutInput[] = Array.from({ length: 2 + Math.floor(random() * 6) }, (_, index) => ({
        id: `c${index}`,
        // Anchors clustered into one corner are what drives a side's chain
        // past the end of its span; the canvas still has ample room.
        anchorX: 320 + random() * 260,
        anchorY: 380 + random() * 150,
        width: 110 + Math.floor(random() * 70),
        height: 90 + Math.floor(random() * 90),
      }));

      for (const mode of ["quadrant", "radial"] as const) {
        const { status, placements } = solveCardLayout(cards, roomyBounds, { mode });

        expect(status).toBe("solved");
        for (let left = 0; left < placements.length; left += 1) {
          for (let right = left + 1; right < placements.length; right += 1) {
            expect(rectsOverlap(placements[left]!, placements[right]!)).toBe(false);
          }
        }
      }
    }
  });
});
