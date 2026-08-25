import { describe, expect, it } from "vitest";
import { marginSeat } from "./card-layout-pack";
import { layeredPack, slotPlacements } from "./card-layout-saturation";
import { LayoutSpace } from "./card-layout-space";
import type { CardLayoutInput } from "./card-layout-types";

function card(id: string, overrides: Partial<CardLayoutInput> = {}): CardLayoutInput {
  return { id, anchorX: 500, anchorY: 350, width: 100, height: 60, ...overrides };
}

/** Standard China-map-like board: map centered, margin corner left of it. */
const standardBoard = new LayoutSpace({
  width: 1000,
  height: 800,
  map: { x: 300, y: 200, width: 400, height: 300 },
  margin: 20,
  gap: 10,
});

describe("slotPlacements fallback", () => {
  it("derives a slotless card's connector side from its seat geometry", () => {
    const orphan = card("orphan");
    const [placement] = slotPlacements([], [orphan], standardBoard);
    const seat = {
      x: standardBoard.clampX(standardBoard.margin, orphan.width),
      y: standardBoard.clampY(standardBoard.margin, orphan.height),
      width: orphan.width,
      height: orphan.height,
    };
    expect(placement).toMatchObject({ x: seat.x, y: seat.y });
    expect(placement!.side).toBe(standardBoard.sideOf(seat));
    // The margin-corner seat sits left of the map center, so the leader must
    // point right toward the map — the old hardcoded "right" pointed away.
    expect(placement!.side).toBe("left");
  });

  it("seats a slotless card exactly where every other leftover path seats it", () => {
    const orphan = card("orphan", { width: 2000, height: 1800 });
    const [placement] = slotPlacements([], [orphan], standardBoard);
    expect(placement).toEqual(marginSeat(orphan, standardBoard));
  });

  it("points the leader up when a wide, shallow map sits below the seat", () => {
    const space = new LayoutSpace({
      width: 1000,
      height: 800,
      map: { x: 50, y: 500, width: 900, height: 200 },
      margin: 20,
      gap: 10,
    });
    const orphan = card("orphan");
    const [placement] = slotPlacements([], [orphan], space);
    const seat = { x: placement!.x, y: placement!.y, width: orphan.width, height: orphan.height };
    expect(placement!.side).toBe(space.sideOf(seat));
    expect(placement!.side).toBe("top");
  });

  it("leaves slotted cards untouched and only reseats the missing one", () => {
    const seated = card("seated");
    const orphan = card("orphan");
    const slot = { x: 720, y: 300, members: [seated], stepX: 0, stepY: 0 };
    const placements = slotPlacements([slot], [seated, orphan], standardBoard);
    const seatedPlacement = placements.find((placement) => placement.id === "seated")!;
    expect(seatedPlacement).toMatchObject({ x: 720, y: 300 });
    expect(seatedPlacement.side)
      .toBe(standardBoard.sideOf({ x: 720, y: 300, width: seated.width, height: seated.height }));
    const orphanPlacement = placements.find((placement) => placement.id === "orphan")!;
    expect(orphanPlacement.side).toBe(standardBoard.sideOf(orphanPlacement));
    expect(orphanPlacement.side).toBe("left");
  });
});

describe("layeredPack", () => {
  it("keeps every slotted card's side consistent with its geometry", () => {
    const cards = [
      card("a", { anchorX: 320, anchorY: 220 }),
      card("b", { anchorX: 500, anchorY: 350, width: 120, height: 80 }),
      card("c", { anchorX: 680, anchorY: 480, width: 90, height: 50 }),
    ];
    const placements = layeredPack(cards, standardBoard);
    expect(placements).toHaveLength(cards.length);
    for (const placement of placements) {
      expect(standardBoard.inside(placement)).toBe(true);
      expect(placement.side).toBe(standardBoard.sideOf(placement));
    }
  });
});
