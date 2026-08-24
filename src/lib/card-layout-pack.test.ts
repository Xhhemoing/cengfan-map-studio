import { describe, expect, it } from "vitest";
import { overlaps } from "./card-layout-geometry";
import { containFree, layoutGrid, marginSeat, orderResult, repackAll, stackAtMargin, sweepPack } from "./card-layout-pack";
import { LayoutSpace, PlacementIndex, validateHard } from "./card-layout-space";
import type { CardArea, CardLayoutInput, CardPlacement } from "./card-layout-types";

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
 * column, so whatever `side` arrives on the probe is meaningless. These tests
 * feed the stale value in to prove it never survives, because `side` steers
 * the leader line's exit edge.
 */
const placeholderSide = "right" as const;

/** Round numbers for the stacking scan: no margin to add, no gap to add. */
function plainSpace(): LayoutSpace {
  return new LayoutSpace({ width: 900, height: 700, map, occupiedAreas: [map], margin: 0, gap: 0 });
}

/** The same round numbers with a gap, so clearance and pixels differ. */
function gappedSpace(): LayoutSpace {
  return new LayoutSpace({ width: 900, height: 700, map, occupiedAreas: [map], margin: 0, gap: 20 });
}

/**
 * A seat is only legal if it misses the column *and* keeps the full gap from
 * it: everywhere else in the pack a candidate is rejected by
 * `placed.hits(card, space.gap)`, so a seat this fallback hands back has to
 * survive the same test.
 */
function expectSeatClear(seat: CardArea, placed: PlacementIndex, gap: number): void {
  for (const other of placed.items) {
    expect(overlaps(seat, other)).toBe(false);
    expect(overlaps(seat, other, gap)).toBe(false);
  }
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
    expectSeatClear(stacked, placed, space.gap);
    expect(stacked.side).toBe(space.sideOf(stacked));
  });

  it("skips a card whose top sits in the gap band instead of tucking in behind it", () => {
    // 110 clears the probe's 100px of height but not the 20px behind it. A hit
    // test that only counts pixels writes that card off as "below", seats the
    // probe at the top of the column and leaves the two 10px apart — half the
    // clearance `placed.hits(card, space.gap)` demands everywhere else.
    const space = gappedSpace();
    const placed = PlacementIndex.forSpace(space);
    const other = columnCard("in-gap-band", 110);
    placed.add(other);

    const stacked = stackAtMargin(probeAtMargin(), space, placed);

    expect(stacked.y).toBe(other.y + other.height + space.gap);
    expectSeatClear(stacked, placed, space.gap);
    expect(stacked.side).toBe(space.sideOf(stacked));
  });

  it("counts a card in the column's side gap as occupancy rather than parked clear", () => {
    // The same band on the other axis: 10px right of the seat's right edge is
    // no pixel overlap, but it is closer than the gap, so the column has to
    // include it and the seat has to drop below it.
    const space = gappedSpace();
    const placed = PlacementIndex.forSpace(space);
    const other = { ...columnCard("beside", 0), x: 130 };
    placed.add(other);

    const stacked = stackAtMargin(probeAtMargin(), space, placed);

    expect(stacked.y).toBe(other.y + other.height + space.gap);
    expectSeatClear(stacked, placed, space.gap);
  });

  it("finds a free seat whatever order the column was inserted in", () => {
    // Every permutation of the same column has to seat the card in the same
    // place: the stack is a property of the geometry, not of the insert order.
    // The gapped column is spaced at its own clearance, so its seat lands a
    // full gap below the last card instead of merely missing it.
    const columns = [
      { space: plainSpace(), rows: [0, 100, 200, 300, 400], seat: 500 },
      { space: gappedSpace(), rows: [0, 120, 240], seat: 360 },
    ];
    for (const { space, rows, seat } of columns) {
      for (const order of permutations(rows)) {
        const placed = PlacementIndex.forSpace(space);
        for (const y of order) placed.add(columnCard(`at${y}`, y));

        const stacked = stackAtMargin(probeAtMargin(), space, placed);

        expect(stacked.y).toBe(seat);
        expectSeatClear(stacked, placed, space.gap);
      }
    }
  });

  it("never seats a card on an occupied row while the column still has room", () => {
    // The column is built at random and shuffled, so the scan meets its cards
    // in an order it cannot predict. Spacing runs past the probe's own height,
    // so some rows sit clear of the cursor, some overlap it and some land in
    // the narrow band between the two that only the gap covers. While the seat
    // stays inside the canvas it has to clear the whole column by the gap;
    // crowding is only allowed once the column has run off the bottom and the
    // seat gets clamped back up.
    const space = new LayoutSpace({ width: 900, height: 4000, map, occupiedAreas: [map], margin: 12, gap: 10 });
    const random = seededRandom(20260824);
    for (let round = 0; round < 300; round += 1) {
      const placed = PlacementIndex.forSpace(space);
      const rows: CardPlacement[] = [];
      let cursor = space.margin;
      for (let index = 0; index < 12; index += 1) {
        cursor += Math.floor(random() * 130);
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
      expectSeatClear(stacked, placed, space.gap);
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

function inputCard(id: string, overrides: Partial<CardLayoutInput> = {}): CardLayoutInput {
  return { id, anchorX: 700, anchorY: 600, width: 120, height: 100, ...overrides };
}

function placementFor(card: CardLayoutInput, x: number, y: number): CardPlacement {
  return { ...card, x, y, side: placeholderSide };
}

describe("marginSeat", () => {
  it("seats the card at the margin with the side that seat actually lands on", () => {
    // A wide, shallow map turns the top-left margin corner into the map's *top*.
    const wideMap: CardArea = { x: 100, y: 300, width: 700, height: 100 };
    const space = makeSpace([wideMap], wideMap);

    const seat = marginSeat(inputCard("seated"), space);

    expect(seat.x).toBe(space.margin);
    expect(seat.y).toBe(space.margin);
    expect(seat.side).toBe("top");
    expect(seat.side).toBe(space.sideOf(seat));
  });

  it("keeps a card too large for the canvas at the margin instead of past it", () => {
    // `maxX`/`maxY` fall below the margin here, so the clamp has to resolve to
    // the margin rather than to a negative upper bound.
    const space = makeSpace();

    const seat = marginSeat(inputCard("huge", { width: 2000, height: 1800 }), space);

    expect(seat.x).toBe(space.margin);
    expect(seat.y).toBe(space.margin);
    expect(seat.side).toBe(space.sideOf(seat));
  });
});

describe("orderResult", () => {
  it("seats a card the solver dropped inside the padded canvas, not at the origin", () => {
    const space = makeSpace();
    const cards = [inputCard("kept"), inputCard("dropped")];

    const ordered = orderResult(cards, [placementFor(cards[0]!, 700, 500)], space);

    expect(ordered.map((card) => card.id)).toEqual(["kept", "dropped"]);
    const dropped = ordered[1]!;
    expect(dropped.x).toBe(space.margin);
    expect(dropped.y).toBe(space.margin);
    expect(space.inside(dropped)).toBe(true);
  });

  it("sides the dropped card by its seat rather than stamping the placeholder", () => {
    const space = makeSpace();

    const [dropped] = orderResult([inputCard("dropped")], [], space);

    // The seat is west of the map, so a card labelled "right" would draw its
    // leader line out of the edge facing away from the anchor.
    expect(dropped!.side).toBe("left");
    expect(dropped!.side).not.toBe(placeholderSide);
    expect(dropped!.side).toBe(space.sideOf(dropped!));
  });

  it("reads the seat's side off the map, so the margin column is not always left", () => {
    // A wide, shallow map turns the top-left margin corner into the map's *top*.
    const wideMap: CardArea = { x: 100, y: 300, width: 700, height: 100 };
    const space = makeSpace([wideMap], wideMap);

    const [dropped] = orderResult([inputCard("dropped")], [], space);

    expect(dropped!.side).toBe("top");
    expect(dropped!.side).toBe(space.sideOf(dropped!));
  });

  it("still seats a card too large for the canvas at the margin", () => {
    const space = makeSpace();

    const [oversized] = orderResult([inputCard("huge", { width: 2000, height: 1800 })], [], space);

    expect(oversized!.x).toBe(space.margin);
    expect(oversized!.y).toBe(space.margin);
    expect(oversized!.side).toBe(space.sideOf(oversized!));
  });

  it("fills only the gaps and keeps duplicate ids paired one to one", () => {
    const space = makeSpace();
    const cards = [inputCard("twin"), inputCard("twin"), inputCard("solo")];
    const placements = [placementFor(cards[0]!, 700, 100), placementFor(cards[1]!, 700, 300)];

    const ordered = orderResult(cards, placements, space);

    expect(ordered.map((card) => [card.x, card.y])).toEqual([[700, 100], [700, 300], [space.margin, space.margin]]);
    // Cards the solver did place keep whatever side it decided on.
    expect(ordered.slice(0, 2).map((card) => card.side)).toEqual([placeholderSide, placeholderSide]);
  });
});

describe("layoutGrid", () => {
  /** A wide, shallow map: the whole top band of the grid is its *top* edge. */
  const wideMap: CardArea = { x: 100, y: 300, width: 700, height: 100 };

  function gridCards(count: number): CardLayoutInput[] {
    return Array.from({ length: count }, (_, index) => inputCard(`g${index}`));
  }

  it("sides a cell above a wide, shallow map by its geometry, not by a left/right split", () => {
    const space = makeSpace([wideMap], wideMap);

    // Six 120px cells fit across the 900px canvas, so all six land in the top
    // row, clear of the map band below them.
    const placements = layoutGrid(gridCards(6), space);

    expect(placements).toHaveLength(6);
    for (const placement of placements) {
      expect(placement.y).toBe(space.margin);
      // A midline split on the raw cell called the first three "left" and the
      // last three "right", and pointed six leader lines out of an edge none
      // of these cards sit against.
      expect(placement.side).toBe("top");
      expect(placement.side).toBe(space.sideOf(placement));
    }
  });

  it("sides a cell below the same map by its geometry too", () => {
    const space = makeSpace([wideMap], wideMap);
    // Two rows fit above the band and the rows crossing it are all blocked, so
    // the last six cards are the first ones the grid seats underneath it.
    const placements = layoutGrid(gridCards(18), space).slice(12);

    expect(placements).toHaveLength(6);
    for (const placement of placements) {
      expect(placement.y).toBeGreaterThan(wideMap.y + wideMap.height);
      expect(placement.side).toBe("bottom");
      expect(placement.side).toBe(space.sideOf(placement));
    }
  });

  it("still labels the flanks of a tall map left and right", () => {
    const space = makeSpace();

    const placements = layoutGrid(gridCards(18), space);

    for (const placement of placements) {
      expect(placement.side).toBe(space.sideOf(placement));
    }
    const sides = [...new Set(placements.map((placement) => placement.side))];
    expect(sides).toContain("left");
    expect(sides).toContain("right");
  });

  it("sides the margin seat it falls back to when no cell is free", () => {
    // Nothing is placeable, so every cell is rejected and the fallback runs.
    const space = makeSpace([{ x: 0, y: 0, width: 900, height: 700 }], wideMap);

    const [seated] = layoutGrid(gridCards(1), space);

    expect(seated!.x).toBe(space.margin);
    expect(seated!.y).toBe(space.margin);
    expect(seated!.side).toBe("top");
    expect(seated!.side).toBe(space.sideOf(seated!));
  });

  it("stacks the leftovers down the margin column instead of piling them on one seat", () => {
    // Nothing is placeable, so all five cards fall through to the fallback.
    const space = makeSpace([{ x: 0, y: 0, width: 900, height: 700 }], wideMap);

    const placements = layoutGrid(gridCards(5), space);

    expect(placements.map((placement) => placement.id)).toEqual(["g0", "g1", "g2", "g3", "g4"]);
    // A single shared margin seat stacked five cards into one pixel.
    const seats = new Set(placements.map((placement) => `${placement.x},${placement.y}`));
    expect(seats.size).toBe(5);
    for (const placement of placements) {
      expect(placement.x).toBe(space.margin);
      expect(space.inside(placement)).toBe(true);
      expect(placement.side).toBe(space.sideOf(placement));
    }
    // The column runs from the margin past the map, so the sides follow the seat.
    const sides = placements.map((placement) => placement.side);
    expect(sides[0]).toBe("top");
    expect(sides).not.toContain("left");
  });

  it("keeps a full margin column in one column, piling the overflow at the bottom", () => {
    const space = makeSpace([{ x: 0, y: 0, width: 900, height: 700 }], wideMap);
    // Six 100px cards plus their gaps fill the column; the rest have nowhere left.
    const bottom = space.maxY(100);

    const placements = layoutGrid(gridCards(9), space);

    for (const placement of placements) {
      expect(placement.x).toBe(space.margin);
      expect(placement.y).toBeLessThanOrEqual(bottom);
      expect(placement.side).toBe(space.sideOf(placement));
    }
    expect(placements.slice(6).map((placement) => placement.y)).toEqual([bottom, bottom, bottom]);
  });

  it("hands back the caller's order even when most of the cards were fallbacks", () => {
    // Nothing is placeable, so every card past the first few is a leftover the
    // grid stacked rather than a cell it found.
    const space = makeSpace([{ x: 0, y: 0, width: 900, height: 700 }], wideMap);
    const cards = gridCards(9);

    const placements = layoutGrid(cards, space);

    expect(placements.map((placement) => placement.id)).toEqual(cards.map((card) => card.id));
  });

  it("returns one seat per card, so nothing the loop drops goes missing", () => {
    for (const space of [makeSpace(), makeSpace([wideMap], wideMap), makeSpace([{ x: 0, y: 0, width: 900, height: 700 }], wideMap)]) {
      for (const count of [1, 5, 18]) {
        const cards = gridCards(count);

        const placements = layoutGrid(cards, space);

        // A card the loop never emitted would come back from `orderResult` as a
        // margin seat, so the length matches the input either way.
        expect(placements).toHaveLength(cards.length);
        expect(placements.map((placement) => placement.id)).toEqual(cards.map((card) => card.id));
        for (const placement of placements) expect(placement.side).toBe(space.sideOf(placement));
      }
    }
  });

  it("still returns nothing for an empty card list", () => {
    expect(layoutGrid([], makeSpace())).toEqual([]);
  });
});

describe("sweepPack", () => {
  /** A wide, shallow map: the margin column runs along its *top* edge. */
  const wideMap: CardArea = { x: 100, y: 300, width: 700, height: 100 };
  const fullyOccupied: CardArea = { x: 0, y: 0, width: 900, height: 700 };

  function sweepCards(count: number): CardLayoutInput[] {
    return Array.from({ length: count }, (_, index) => inputCard(`s${index}`));
  }

  it("sides a leftover the sweep could not fit by the seat it was stacked into", () => {
    // The whole canvas is protected, so every row of the sweep is rejected and
    // all four cards fall through to the margin stack.
    const space = makeSpace([fullyOccupied]);

    const placements = sweepPack(sweepCards(4), space);

    expect(placements.map((placement) => placement.id)).toEqual(["s0", "s1", "s2", "s3"]);
    for (const placement of placements) {
      expect(placement.x).toBe(space.margin);
      expect(space.inside(placement)).toBe(true);
      expect(placement.side).toBe(space.sideOf(placement));
    }
  });

  it("does not label a stacked leftover left when its seat sits above the map", () => {
    // Same saturated canvas, but the map is wide and shallow, so the column the
    // leftovers stack into is north of it rather than west. A probe that stamps
    // "left" before the seat exists points every leader line out of an edge
    // none of these cards sit against.
    const space = makeSpace([fullyOccupied], wideMap);

    const placements = sweepPack(sweepCards(4), space);

    const sides = placements.map((placement) => placement.side);
    for (const placement of placements) {
      expect(placement.x).toBe(space.margin);
      expect(placement.side).toBe(space.sideOf(placement));
    }
    expect(sides).toContain("top");
    expect(sides).not.toContain("left");
    // The column runs past the map, so the tail of it is genuinely below.
    expect(sides).toContain("bottom");
  });

  it("still packs a dense board into a legal layout", () => {
    const space = makeSpace();

    const placements = sweepPack(sweepCards(12), space);

    expect(placements.map((placement) => placement.id)).toEqual(sweepCards(12).map((card) => card.id));
    expect(validateHard(placements, space)).toBe(true);
    for (const placement of placements) {
      expect(placement.side).toBe(space.sideOf(placement));
    }
  });
});

describe("repackAll", () => {
  /** An unobstructed 200x200 board the three cards below fill exactly. */
  function tightSpace(): LayoutSpace {
    const board: CardArea = { x: 0, y: 0, width: 200, height: 200 };
    return new LayoutSpace({ width: 200, height: 200, map: board, occupiedAreas: [], margin: 0, gap: 0 });
  }

  it("hands back the caller's order even when a later candidate order solved the board", () => {
    const space = tightSpace();
    // The two squares take a corner each in input order, which leaves no
    // 200-wide band for the third card, so the board is only solved once the
    // area-sorted retry seats the band first.
    const cards = [
      inputCard("square-nw", { width: 100, height: 100, anchorX: 50, anchorY: 50 }),
      inputCard("square-se", { width: 100, height: 100, anchorX: 150, anchorY: 150 }),
      inputCard("band", { width: 200, height: 100, anchorX: 100, anchorY: 50 }),
    ];

    const placements = repackAll(cards, space);

    expect(placements).not.toBeNull();
    // The winning order seated the band first, so handing back the solver's own
    // sequence would answer band, square-nw, square-se.
    expect(placements!.map((placement) => placement.id)).toEqual(["square-nw", "square-se", "band"]);
    expect(placements!.map((placement) => [placement.x, placement.y])).toEqual([[0, 100], [100, 100], [0, 0]]);
    expect(validateHard(placements!, space)).toBe(true);
  });

  it("returns null when the canvas is fully occupied and no order can complete", () => {
    const space = makeSpace([{ x: 0, y: 0, width: 900, height: 700 }]);

    expect(repackAll([inputCard("a"), inputCard("b")], space)).toBeNull();
  });
});
