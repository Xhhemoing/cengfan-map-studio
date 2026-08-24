/**
 * Pins the Round 16 simplification of the optimizer's `repairPlacement`: the
 * `side: space.sideOf(...)` wrappers it used to put around {@link containFree}
 * are no-ops, because every containFree exit — free-spot fast path, lattice
 * scan, stack fallback — re-derives the side from the rectangle the card lands
 * on and never reads the side it was handed. `repairPlacement` is
 * module-private, so these tests rebuild its probe verbatim and compare the
 * bare call against the wrapped expression it replaced.
 *
 * Deliberately not asserted: concrete stacked seats (the stacking scan is
 * owned by `card-layout-pack` and its tests) and `side === sideOf` over
 * `optimizedLayout` output as a whole — candidate-based placements keep the
 * side they were generated for, so that invariant only holds for repairs.
 */
import { describe, expect, it } from "vitest";
import { containFree } from "./card-layout-pack";
import { LayoutSpace, PlacementIndex } from "./card-layout-space";
import {
  SIDE_ORDER,
  type CardArea,
  type CardLayoutInput,
  type CardPlacement,
} from "./card-layout-types";

const map: CardArea = { x: 300, y: 220, width: 300, height: 260 };

function makeSpace(occupiedAreas: CardArea[] = [map]): LayoutSpace {
  return new LayoutSpace({ width: 900, height: 700, map, occupiedAreas, margin: 20, gap: 12 });
}

/** A canvas with every pixel protected, so only the stack fallback can seat a card. */
function saturatedSpace(): LayoutSpace {
  return makeSpace([{ x: 0, y: 0, width: 900, height: 700 }]);
}

/** The probe exactly as `repairPlacement` builds it, placeholder side included. */
function repairProbe(card: CardLayoutInput, space: LayoutSpace): CardPlacement {
  return {
    ...card,
    x: space.clampX(card.anchorX - card.width / 2, card.width),
    y: space.clampY(card.anchorY - card.height / 2, card.height),
    side: "right",
  };
}

/** What `repairPlacement` computed before Round 16 dropped the wrappers. */
function wrappedRepair(card: CardLayoutInput, space: LayoutSpace, placed: PlacementIndex): CardPlacement {
  const probe = repairProbe(card, space);
  const repaired = containFree({ ...probe, side: space.sideOf(probe) }, space, placed);
  return { ...repaired, side: space.sideOf(repaired) };
}

/** What it computes now. */
function bareRepair(card: CardLayoutInput, space: LayoutSpace, placed: PlacementIndex): CardPlacement {
  return containFree(repairProbe(card, space), space, placed);
}

describe("repairPlacement's bare containFree call", () => {
  it("equals the old wrapped expression wherever the repair lands on an open board", () => {
    const space = makeSpace();
    const placed = PlacementIndex.forSpace(space);
    // Cards parked against the map frame, so a scanned repair has to dodge
    // placed cards as well as the map and `placed.hits` earns its keep.
    placed.add({ id: "p-west", anchorX: 250, anchorY: 350, width: 140, height: 110, x: 150, y: 290, side: "left" });
    placed.add({ id: "p-north", anchorX: 450, anchorY: 180, width: 160, height: 90, x: 380, y: 110, side: "top" });
    placed.add({ id: "p-east", anchorX: 660, anchorY: 350, width: 140, height: 110, x: 615, y: 300, side: "right" });

    let kept = 0;
    let moved = 0;
    for (const anchorX of [40, 260, 450, 640, 860]) {
      for (const anchorY of [40, 230, 350, 470, 660]) {
        const card: CardLayoutInput = { id: `probe-${anchorX}-${anchorY}`, anchorX, anchorY, width: 130, height: 90 };
        const probe = repairProbe(card, space);
        const bare = bareRepair(card, space, placed);

        expect(bare).toEqual(wrappedRepair(card, space, placed));
        // The invariant both wrappers were defending.
        expect(bare.side).toBe(space.sideOf(bare));
        if (bare.x === probe.x && bare.y === probe.y) kept += 1;
        else moved += 1;
      }
    }
    // The sweep must keep exercising both exits — probes already in a free
    // spot and probes the lattice scan had to move — or it proves nothing.
    expect(kept).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(0);
  });

  it("equals the old wrapped expression when saturation falls through to margin stacking", () => {
    const space = saturatedSpace();
    const placed = PlacementIndex.forSpace(space);
    for (let index = 0; index < 3; index += 1) {
      const card: CardLayoutInput = { id: `sat-${index}`, anchorX: 700, anchorY: 350, width: 120, height: 100 };
      const bare = bareRepair(card, space, placed);

      expect(bare).toEqual(wrappedRepair(card, space, placed));
      expect(bare.side).toBe(space.sideOf(bare));
      placed.add(bare);
    }
  });

  it("ignores the probe's incoming side, so pre-seeding it with sideOf changed nothing", () => {
    const open = makeSpace();
    // One card per containFree exit: already free west of the map, blocked on
    // the map center so the scan runs, and nowhere legal at all.
    const cases: Array<{ card: CardLayoutInput; space: LayoutSpace }> = [
      { card: { id: "free", anchorX: 120, anchorY: 350, width: 120, height: 100 }, space: open },
      { card: { id: "scanned", anchorX: 450, anchorY: 350, width: 120, height: 100 }, space: open },
      { card: { id: "stacked", anchorX: 450, anchorY: 350, width: 120, height: 100 }, space: saturatedSpace() },
    ];
    for (const { card, space } of cases) {
      const placed = PlacementIndex.forSpace(space);
      const results = SIDE_ORDER.map((side) =>
        containFree({ ...repairProbe(card, space), side }, space, placed));
      for (const result of results.slice(1)) expect(result).toEqual(results[0]);
    }
  });
});
