import { describe, expect, it } from "vitest";
import {
  adaptCardLayout,
  clampCardPosition,
  type CardArea,
  type CardLayoutBounds,
  type CardPlacement,
} from "./card-layout";
import { bounds, overlaps } from "./card-layout-test-fixtures";

describe("card layout", () => {
  it("keeps a manually placed card when it does not intersect any occupied geography, regardless of layout style", () => {
    const occupied = [
      { x: 400, y: 200, width: 180, height: 180 },
      { x: 920, y: 200, width: 180, height: 180 },
    ];
    const position = { x: 740, y: 400, width: 80, height: 60 };

    const clamped = clampCardPosition(position, { ...bounds, occupiedAreas: occupied });

    expect(clamped).toEqual({ x: position.x, y: position.y });
  });

  it("keeps a manually placed card in any non-overlapping location, including scattered positions around the map", () => {
    const occupiedPolygons = [{
      rings: [[
        { x: 500, y: 200 },
        { x: 900, y: 200 },
        { x: 900, y: 400 },
        { x: 700, y: 400 },
        { x: 700, y: 600 },
        { x: 500, y: 600 },
      ]],
    }];
    const position = { x: 720, y: 420, width: 80, height: 80 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons,
    });

    expect(clamped).toEqual({ x: position.x, y: position.y });
  });

  it("still rejects a manual card that intersects actual map polygons", () => {
    const occupiedPolygons = [{
      rings: [[
        { x: 500, y: 200 },
        { x: 900, y: 200 },
        { x: 900, y: 600 },
        { x: 500, y: 600 },
      ]],
    }];
    const position = { x: 600, y: 300, width: 220, height: 110 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons,
    });

    expect(clamped).not.toEqual({ x: position.x, y: position.y });
    const card = { ...clamped, width: position.width, height: position.height };
    expect(overlaps(card, { x: 500, y: 200, width: 400, height: 400 })).toBe(false);
  });

  it("pushes a covered manual position off the real occupied AABBs, not the map union", () => {
    const occupied = Array.from({ length: 20 }, (_, index) => ({
      x: 500 + index * 5,
      y: 300 + index * 3,
      width: 180,
      height: 140,
    }));
    const position = { x: 600, y: 400, width: 220, height: 110 };

    const clamped = clampCardPosition(position, { ...bounds, occupiedAreas: occupied });
    const card = { ...clamped, width: position.width, height: position.height };

    expect(occupied.some((area) => overlaps(card, area))).toBe(false);
  });

  it("finds a free position against fixed obstacles while still allowing map-frame whitespace", () => {
    const fixedObstacle = { x: 500, y: 885, width: 500, height: 45 };
    const position = { x: 600, y: 400, width: 220, height: 116 };

    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [fixedObstacle],
    });

    expect(clamped).toEqual({ x: position.x, y: position.y });
    expect(overlaps({ ...clamped, width: position.width, height: position.height }, fixedObstacle)).toBe(false);
  });

  it("keeps a manual position on the map when map overlap is allowed", () => {
    const position = { x: 600, y: 400, width: 220, height: 110 };
    const permissiveBounds = {
      ...bounds,
      occupiedAreas: [{ x: 40, y: 40, width: 120, height: 60 }],
      allowMapOverlap: true,
    };

    expect(clampCardPosition(position, permissiveBounds)).toEqual({ x: position.x, y: position.y });
  });

  it("still clamps against non-map obstacles when map overlap is allowed", () => {
    const obstacle = { x: 560, y: 360, width: 300, height: 240 };
    const position = { x: 600, y: 400, width: 220, height: 110 };
    const clamped = clampCardPosition(position, {
      ...bounds,
      occupiedAreas: [obstacle],
      allowMapOverlap: true,
    });
    expect(overlaps({ ...clamped, width: position.width, height: position.height }, obstacle)).toBe(false);
  });

  it("keeps a manual card off element areas until element overlap is allowed", () => {
    const elementArea: CardArea = { x: 120, y: 620, width: 420, height: 260 };
    const elementBounds: CardLayoutBounds = { ...bounds, occupiedAreas: [], elementAreas: [elementArea] };
    const position = { x: 200, y: 700, width: 200, height: 100 };

    const blocked = clampCardPosition(position, elementBounds);
    const allowed = clampCardPosition(position, { ...elementBounds, allowElementOverlap: true });

    expect(overlaps({ ...blocked, width: position.width, height: position.height }, elementArea)).toBe(false);
    expect(allowed).toEqual({ x: position.x, y: position.y });
  });

  it("keeps avoiding elements when only map overlap is allowed, and vice versa", () => {
    const elementArea: CardArea = { x: 120, y: 620, width: 420, height: 260 };
    const mapPolygon = {
      rings: [[
        { x: 500, y: 200 },
        { x: 900, y: 200 },
        { x: 900, y: 600 },
        { x: 500, y: 600 },
      ]],
    };
    const bothBounds: CardLayoutBounds = {
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons: [mapPolygon],
      elementAreas: [elementArea],
    };
    const overElement = { x: 200, y: 700, width: 200, height: 100 };
    const overMap = { x: 600, y: 300, width: 200, height: 100 };

    const mapRelaxed = clampCardPosition(overElement, { ...bothBounds, allowMapOverlap: true });
    expect(overlaps({ ...mapRelaxed, width: 200, height: 100 }, elementArea)).toBe(false);

    const elementRelaxed = clampCardPosition(overMap, { ...bothBounds, allowElementOverlap: true });
    expect(overlaps({ ...elementRelaxed, width: 200, height: 100 }, { x: 500, y: 200, width: 400, height: 400 }))
      .toBe(false);
  });
});

describe("card layout drag adaptation", () => {
  const adaptBounds: CardLayoutBounds = {
    width: 1200,
    height: 800,
    map: { x: 420, y: 160, width: 320, height: 420 },
    margin: 24,
    gap: 12,
  };

  function stackCard(id: string, y: number): CardPlacement {
    return { id, anchorX: 580, anchorY: y + 45, width: 200, height: 90, x: 860, y, side: "right" };
  }

  it("pins the dragged card at its clamped target and pushes the neighbour chain apart", () => {
    const initial = [stackCard("a", 100), stackCard("b", 210), stackCard("c", 320), stackCard("d", 600)];
    const target = { x: 860, y: 180 };

    const adapted = adaptCardLayout(initial, "a", target, adaptBounds);

    expect(adapted.map((card) => card.id)).toEqual(["a", "b", "c", "d"]);
    expect({ x: adapted[0]!.x, y: adapted[0]!.y })
      .toEqual(clampCardPosition({ ...initial[0]!, ...target }, adaptBounds));
    // b was covered and had to move; the push propagated into c.
    expect(adapted[1]!.y).toBeGreaterThan(initial[1]!.y);
    expect(adapted[2]!.y).toBeGreaterThan(initial[2]!.y);
    for (let left = 0; left < adapted.length; left += 1) {
      for (let right = left + 1; right < adapted.length; right += 1) {
        expect(overlaps(adapted[left]!, adapted[right]!), `${left}/${right}`).toBe(false);
      }
    }
  });

  it("leaves every card alone when the drop covers nothing", () => {
    const initial = [stackCard("a", 100), stackCard("b", 300), stackCard("c", 500)];

    const adapted = adaptCardLayout(initial, "a", { x: 860, y: 120 }, adaptBounds);

    expect(adapted[0]!.y).toBe(120);
    expect(adapted.slice(1).map((card) => ({ x: card.x, y: card.y })))
      .toEqual(initial.slice(1).map((card) => ({ x: card.x, y: card.y })));
  });

  it("pushes neighbours onto free canvas rather than onto protected geography", () => {
    const obstacle: CardArea = { x: 820, y: 320, width: 300, height: 200 };
    const obstacleBounds: CardLayoutBounds = { ...adaptBounds, occupiedAreas: [obstacle] };
    const initial = [stackCard("a", 100), stackCard("b", 210)];

    const adapted = adaptCardLayout(initial, "a", { x: 860, y: 180 }, obstacleBounds);
    const neighbour = adapted[1]!;

    expect(overlaps(adapted[0]!, neighbour)).toBe(false);
    expect(overlaps(neighbour, obstacle)).toBe(false);
    expect(neighbour.x).toBeGreaterThanOrEqual(obstacleBounds.margin);
    expect(neighbour.y + neighbour.height)
      .toBeLessThanOrEqual(obstacleBounds.height - obstacleBounds.margin);
  });

  it("returns the placements unchanged when the moved id is unknown", () => {
    const initial = [stackCard("a", 100), stackCard("b", 300)];

    const adapted = adaptCardLayout(initial, "missing", { x: 0, y: 0 }, adaptBounds);

    expect(adapted).toEqual(initial);
    expect(adapted).not.toBe(initial);
  });
});
