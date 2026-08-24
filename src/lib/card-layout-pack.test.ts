import { describe, expect, it } from "vitest";
import { overlaps } from "./card-layout-geometry";
import { containFree, stackAtMargin } from "./card-layout-pack";
import { LayoutSpace, PlacementIndex } from "./card-layout-space";
import type { CardArea, CardPlacement } from "./card-layout-types";

const map: CardArea = { x: 300, y: 220, width: 300, height: 260 };

function makeSpace(occupiedAreas: CardArea[] = [map], mapArea: CardArea = map): LayoutSpace {
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
 * Both fallbacks are reached with a leftover card, and a leftover card has no
 * column: `packSides` stamps `"right"` on it before it has any position. The
 * placeholder must not survive, because `side` steers the leader line's exit
 * edge.
 */
const placeholderSide = "right" as const;

/** Round numbers for the stacking scan: no margin to add, no gap to add. */
function plainSpace(): LayoutSpace {
  return new LayoutSpace({ width: 900, height: 700, map, occupiedAreas: [map], margin: 0, gap: 0 });
}

/** A card sitting in the margin column, so it contests the stacked seat. */
function columnCard(id: string, y: number): CardPlacement {
  return { id, anchorX: 60, anchorY: y, width: 120, height: 100, x: 0, y, side: "left" };
}

function probeAtMargin(): CardPlacement {
  return { id: "stacked", anchorX: 700, anchorY: 600, width: 120, height: 100, x: 0, y: 0, side: placeholderSide };
}

/** Deterministic LCG: the fuzz below has to fail the same way twice. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]));
}

describe("containFree", () => {
  it("re-derives the side when the probe is already in a free spot", () => {
    const space = makeSpace();
    // West of the map and clear of every obstacle, so the scan never runs.
    const probe: CardPlacement = {
      id: "west",
      anchorX: 120,
      anchorY: 350,
      width: 120,
      height: 100,
      x: 20,
      y: 300,
      side: placeholderSide,
    };

    const repaired = containFree(probe, space, PlacementIndex.forSpace(space));

    expect(repaired.x).toBe(20);
    expect(repaired.y).toBe(300);
    expect(repaired.side).toBe("left");
    expect(repaired.side).toBe(space.sideOf(repaired));
  });

  it("re-derives the side when the scan has to move the probe", () => {
    const space = makeSpace();
    // Straddling the map: the probe is blocked, so the lattice scan picks the
    // nearest free seat and the side has to follow it there.
    const probe: CardPlacement = {
      id: "onto-map",
      anchorX: 450,
      anchorY: 350,
      width: 120,
      height: 100,
      x: 400,
      y: 300,
      side: placeholderSide,
    };

    const repaired = containFree(probe, space, PlacementIndex.forSpace(space));

    expect(space.blocked(repaired)).toBe(false);
    expect(repaired.side).toBe(space.sideOf(repaired));
  });

  it("re-derives the side when no free spot exists and it falls through to stacking", () => {
    // The whole canvas is protected, so the lattice scan finds nothing and
    // `stackAtMargin` decides where the card goes.
    const space = makeSpace([{ x: 0, y: 0, width: 900, height: 700 }]);
    const probe: CardPlacement = {
      id: "nowhere",
      anchorX: 700,
      anchorY: 350,
      width: 120,
      height: 100,
      x: 400,
      y: 300,
      side: placeholderSide,
    };

    const repaired = containFree(probe, space, PlacementIndex.forSpace(space));

    expect(repaired.x).toBe(space.margin);
    expect(repaired.side).toBe(space.sideOf(repaired));
    expect(repaired.side).not.toBe(placeholderSide);
  });
});

describe("stackAtMargin", () => {
  it("labels the stacked card by the seat it took, not by the caller's placeholder", () => {
    const space = makeSpace();
    const probe: CardPlacement = {
      id: "stacked",
      anchorX: 700,
      anchorY: 600,
      width: 120,
      height: 100,
      x: space.margin,
      y: space.margin,
      side: placeholderSide,
    };

    const stacked = stackAtMargin(probe, space, PlacementIndex.forSpace(space));

    expect(stacked.x).toBe(space.margin);
    expect(stacked.side).toBe("left");
    expect(stacked.side).toBe(space.sideOf(stacked));
  });

  it("reads the side off the geometry rather than assuming the left margin means left", () => {
    // A wide, shallow map turns the left margin strip into the map's *top*.
    const wideMap: CardArea = { x: 100, y: 300, width: 700, height: 100 };
    const space = makeSpace([wideMap], wideMap);
    const probe: CardPlacement = {
      id: "above",
      anchorX: 120,
      anchorY: 60,
      width: 120,
      height: 100,
      x: space.margin,
      y: space.margin,
      side: placeholderSide,
    };

    const stacked = stackAtMargin(probe, space, PlacementIndex.forSpace(space));

    expect(stacked.side).toBe("top");
    expect(stacked.side).toBe(space.sideOf(stacked));
  });

  it("keeps re-deriving the side as earlier cards push the stack down the margin", () => {
    const space = makeSpace();
    const placed = PlacementIndex.forSpace(space);
    const sides: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const probe: CardPlacement = {
        id: `c${index}`,
        anchorX: 700,
        anchorY: 350,
        width: 120,
        height: 150,
        x: space.margin,
        y: space.margin,
        side: placeholderSide,
      };
      const stacked = stackAtMargin(probe, space, placed);
      placed.add(stacked);
      sides.push(stacked.side);
      expect(stacked.side).toBe(space.sideOf(stacked));
    }
    // The column runs the height of the canvas, so the seats differ — and none
    // of them may report the placeholder.
    expect(sides).not.toContain(placeholderSide);
  });

  it("clears a card it already scanned past when a later one pushes the stack down onto it", () => {
    // Insertion order matters here: the bottom card is scanned while the cursor
    // is still at the top of the column, so a single insertion-order pass writes
    // it off as "below" and never looks again — then the two cards above push
    // the cursor exactly onto it.
    const space = plainSpace();
    const placed = PlacementIndex.forSpace(space);
    for (const y of [200, 0, 100]) placed.add(columnCard(`at${y}`, y));

    const stacked = stackAtMargin(probeAtMargin(), space, placed);

    expect(stacked.y).toBe(300);
    for (const other of placed.items) expect(overlaps(stacked, other)).toBe(false);
    expect(stacked.side).toBe(space.sideOf(stacked));
  });

  it("finds a free seat whatever order the column was inserted in", () => {
    const space = plainSpace();
    const rows = [0, 100, 200, 300, 400];
    // Every permutation of the same column has to seat the card in the same
    // place: the stack is a property of the geometry, not of the insert order.
    for (const order of permutations(rows)) {
      const placed = PlacementIndex.forSpace(space);
      for (const y of order) placed.add(columnCard(`at${y}`, y));

      const stacked = stackAtMargin(probeAtMargin(), space, placed);

      expect(stacked.y).toBe(500);
      for (const other of placed.items) expect(overlaps(stacked, other)).toBe(false);
    }
  });

  it("never seats a card on an occupied row while the column still has room", () => {
    // The column is built at random and shuffled, so the scan meets its cards
    // in an order it cannot predict. As long as the seat stays inside the
    // canvas, it has to be clear — an overlap is only allowed once the column
    // has run off the bottom and the seat gets clamped back up.
    const space = new LayoutSpace({ width: 900, height: 4000, map, occupiedAreas: [map], margin: 12, gap: 10 });
    const random = seededRandom(20260824);
    for (let round = 0; round < 300; round += 1) {
      const placed = PlacementIndex.forSpace(space);
      const rows: CardPlacement[] = [];
      let cursor = space.margin;
      for (let index = 0; index < 12; index += 1) {
        cursor += Math.floor(random() * 60);
        rows.push({ ...columnCard(`r${index}`, cursor), x: space.margin, height: 40 + Math.floor(random() * 120) });
        cursor += rows[index]!.height;
      }
      // Shuffle so insertion order carries no information about height.
      for (let index = rows.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [rows[index], rows[swap]] = [rows[swap]!, rows[index]!];
      }
      for (const row of rows) placed.add(row);

      const stacked = stackAtMargin(probeAtMargin(), space, placed);

      expect(space.inside(stacked)).toBe(true);
      for (const other of placed.items) expect(overlaps(stacked, other)).toBe(false);
    }
  });

  it("ignores cards parked clear of the margin column", () => {
    const space = plainSpace();
    const placed = PlacementIndex.forSpace(space);
    // Right of the new card's right edge, so it never contests the seat.
    placed.add({ ...columnCard("aside", 0), x: 200 });

    expect(stackAtMargin(probeAtMargin(), space, placed).y).toBe(space.margin);
  });
});
