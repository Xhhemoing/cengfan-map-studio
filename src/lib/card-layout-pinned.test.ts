/**
 * A pinned card gets its seat from the canvas model rather than from a private
 * call into the geometry helpers, so the side a hand-placed card reports is the
 * side every solved card would have been given at the same coordinate.
 */
import { describe, expect, it } from "vitest";
import { mergePinnedCards, planPinnedCards } from "./card-layout-pinned";
import { LayoutSpace } from "./card-layout-space";
import type { CardArea, CardLayoutBounds, CardLayoutInput, CardPlacement, CardPoint } from "./card-layout-types";

const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 350, y: 120, width: 800, height: 690 },
  margin: 32,
  gap: 14,
};

function cardInput(id: string): CardLayoutInput {
  return { id, anchorX: 750, anchorY: 465, width: 220, height: 110 };
}

function areaAt(card: CardLayoutInput, point: CardPoint): CardArea {
  return { x: point.x, y: point.y, width: card.width, height: card.height };
}

describe("pinned card plan", () => {
  /** One pin per side of the map, plus one dropped off the canvas margin. */
  const pins: Record<string, CardPoint> = {
    west: { x: 60, y: 420 },
    east: { x: 1220, y: 420 },
    north: { x: 640, y: 40 },
    south: { x: 640, y: 880 },
    outside: { x: -40, y: 12 },
  };
  const roster = Object.keys(pins).map(cardInput);

  it("gives a pinned card the side the shared layout space reports", () => {
    const space = new LayoutSpace(bounds);
    const plan = planPinnedCards(roster, bounds, pins)!;

    const sides = plan.slots.map((slot) => slot!.side);
    expect(sides).toEqual(roster.map((card) => space.sideOf(areaAt(card, pins[card.id]!))));
    // Four distinct sides, so the agreement above is not one entrance winning
    // every case by accident.
    expect(new Set(sides.slice(0, 4))).toEqual(new Set(["left", "right", "top", "bottom"]));
  });

  it("keeps the caller's coordinates, including a pin outside the margin", () => {
    const plan = planPinnedCards(roster, bounds, pins)!;

    expect(plan.slots.map((slot) => ({ id: slot!.id, x: slot!.x, y: slot!.y })))
      .toEqual(roster.map((card) => ({ id: card.id, ...pins[card.id]! })));
    expect(plan.free).toEqual([]);
  });

  it("reads the side off province geometry the same way with polygons present", () => {
    const vector: CardLayoutBounds = {
      ...bounds,
      occupiedPolygons: [{
        rings: [[
          { x: 350, y: 120 },
          { x: 1150, y: 120 },
          { x: 1150, y: 810 },
          { x: 350, y: 810 },
        ]],
      }],
    };
    const space = new LayoutSpace(vector);
    const plan = planPinnedCards(roster, vector, pins)!;

    expect(plan.slots.map((slot) => slot!.side))
      .toEqual(roster.map((card) => space.sideOf(areaAt(card, pins[card.id]!))));
  });

  it("stays out of the way when no card is pinned", () => {
    expect(planPinnedCards(roster, bounds, undefined)).toBeNull();
    expect(planPinnedCards(roster, bounds, {})).toBeNull();
    expect(planPinnedCards(roster, bounds, { absent: { x: 10, y: 10 } })).toBeNull();
    expect(planPinnedCards(roster, bounds, { west: { x: Number.NaN, y: 10 } })).toBeNull();
  });
});

describe("merging pinned cards back", () => {
  /** A wide, shallow map, so the margin seat a dropped card falls back to is
   * the map's *top* rather than its left flank. */
  const wide: CardLayoutBounds = { ...bounds, map: { x: 200, y: 420, width: 1100, height: 160 } };
  const pins: Record<string, CardPoint> = { pinned: { x: 60, y: 620 } };
  const roster = ["free-a", "pinned", "free-b"].map(cardInput);

  function planFor(): { plan: NonNullable<ReturnType<typeof planPinnedCards>>; space: LayoutSpace } {
    const plan = planPinnedCards(roster, wide, pins)!;
    return { plan, space: new LayoutSpace(plan.bounds) };
  }

  it("returns one placement per slot, in input order, with the pins untouched", () => {
    const { plan, space } = planFor();
    // The solve hands its cards back in pack order, not the caller's.
    const seat = (card: CardLayoutInput, x: number, y: number): CardPlacement => {
      const area = { x, y, width: card.width, height: card.height };
      return { ...card, x, y, side: space.sideOf(area) };
    };
    const solved = [seat(plan.free[1]!, 900, 60), seat(plan.free[0]!, 300, 860)];

    const merged = mergePinnedCards(plan, solved);

    expect(merged.map((placement) => placement.id)).toEqual(["free-a", "pinned", "free-b"]);
    expect(merged.map((placement) => [placement.x, placement.y]))
      .toEqual([[300, 860], [60, 620], [900, 60]]);
    for (const placement of [merged[0]!, merged[2]!]) {
      expect(placement.side).toBe(space.sideOf(placement));
    }
  });

  it("seats a free card the solve never returned at the margin, sided by that seat", () => {
    const { plan, space } = planFor();

    const merged = mergePinnedCards(plan, []);

    expect(merged.map((placement) => placement.id)).toEqual(["free-a", "pinned", "free-b"]);
    expect({ x: merged[1]!.x, y: merged[1]!.y }).toEqual(pins.pinned);
    for (const placement of [merged[0]!, merged[2]!]) {
      expect(placement.x).toBe(space.margin);
      expect(placement.y).toBe(space.margin);
      // North of a wide, shallow map: a leftover labelled "left" would draw its
      // leader line out of an edge the card does not sit against.
      expect(placement.side).toBe("top");
      expect(placement.side).toBe(space.sideOf(placement));
    }
  });
});
