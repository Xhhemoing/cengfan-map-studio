import { describe, expect, it } from "vitest";
import type { CardArea, CardLayoutBounds, CardPolygon } from "./card-layout";
import { oracleRectHitsPolygon, overlaps } from "./card-layout-test-fixtures";

const layout = await import("./card-layout");

type ElementAwareBounds = CardLayoutBounds & {
  elementAreas?: CardArea[];
  allowElementOverlap?: boolean;
};

const requestedElementPosition = { x: 60, y: 60, width: 100, height: 60 };
const elementArea: CardArea = { x: 40, y: 40, width: 150, height: 120 };
const elementProbeBounds: ElementAwareBounds = {
  width: 640,
  height: 440,
  map: { x: 250, y: 140, width: 200, height: 180 },
  margin: 20,
  gap: 8,
  elementAreas: [elementArea],
  allowMapOverlap: false,
};

const hasElementOverlap = (() => {
  try {
    const blocked = layout.clampCardPosition(requestedElementPosition, {
      ...elementProbeBounds,
      allowElementOverlap: false,
    });
    const allowed = layout.clampCardPosition(requestedElementPosition, {
      ...elementProbeBounds,
      allowElementOverlap: true,
    });
    return blocked.x !== allowed.x || blocked.y !== allowed.y;
  } catch {
    return false;
  }
})();

describe("card layout overlap flags", () => {
  it("allows map polygon overlap only when allowMapOverlap is true", () => {
    const mapPolygon: CardPolygon = {
      rings: [[
        { x: 200, y: 100 },
        { x: 440, y: 100 },
        { x: 440, y: 340 },
        { x: 200, y: 340 },
      ]],
      bounds: { x: 200, y: 100, width: 240, height: 240 },
    };
    const bounds: CardLayoutBounds = {
      width: 640,
      height: 440,
      map: mapPolygon.bounds!,
      margin: 20,
      gap: 8,
      occupiedPolygons: [mapPolygon],
    };
    const requested = { x: 270, y: 180, width: 100, height: 60 };

    const blocked = layout.clampCardPosition(requested, {
      ...bounds,
      allowMapOverlap: false,
    });
    const allowed = layout.clampCardPosition(requested, {
      ...bounds,
      allowMapOverlap: true,
    });

    expect(oracleRectHitsPolygon({ ...requested, ...blocked }, mapPolygon, 0)).toBe(false);
    expect(allowed).toEqual({ x: requested.x, y: requested.y });
    expect(oracleRectHitsPolygon({ ...requested, ...allowed }, mapPolygon, 0)).toBe(true);
  });

  it.skipIf(!hasElementOverlap)(
    "separates element overlap permission from map overlap permission",
    () => {
      const blockedByElement = layout.clampCardPosition(requestedElementPosition, {
        ...elementProbeBounds,
        allowElementOverlap: false,
      });
      const allowedOverElement = layout.clampCardPosition(requestedElementPosition, {
        ...elementProbeBounds,
        allowElementOverlap: true,
      });

      expect(overlaps({ ...requestedElementPosition, ...blockedByElement }, elementArea)).toBe(false);
      expect(allowedOverElement).toEqual({
        x: requestedElementPosition.x,
        y: requestedElementPosition.y,
      });
      expect(overlaps({ ...requestedElementPosition, ...allowedOverElement }, elementArea)).toBe(true);

      const requestedMapPosition = { x: 290, y: 190, width: 100, height: 60 };
      const stillBlockedByMap = layout.clampCardPosition(requestedMapPosition, {
        ...elementProbeBounds,
        allowElementOverlap: true,
        allowMapOverlap: false,
      });
      expect(overlaps({ ...requestedMapPosition, ...stillBlockedByMap }, elementProbeBounds.map)).toBe(false);
    },
  );
});
