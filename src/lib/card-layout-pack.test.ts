import { describe, expect, it } from "vitest";
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
});
