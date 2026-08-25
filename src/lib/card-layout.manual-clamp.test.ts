import { describe, expect, it } from "vitest";
import { clampCardPosition } from "./card-layout";
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
});
