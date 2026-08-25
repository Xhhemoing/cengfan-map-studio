import { describe, expect, it } from "vitest";
import {
  clampCardPosition,
  type CardArea,
  type CardLayoutBounds,
  type CardPolygon,
} from "./card-layout";
import { oracleRectHitsPolygon, overlaps } from "./card-layout-test-fixtures";

const requestedElementPosition = { x: 60, y: 60, width: 100, height: 60 };
const elementArea: CardArea = { x: 40, y: 40, width: 150, height: 120 };
const elementProbeBounds: CardLayoutBounds = {
  width: 640,
  height: 440,
  map: { x: 250, y: 140, width: 200, height: 180 },
  margin: 20,
  gap: 8,
  elementAreas: [elementArea],
  allowMapOverlap: false,
};

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

    const blocked = clampCardPosition(requested, {
      ...bounds,
      allowMapOverlap: false,
    });
    const allowed = clampCardPosition(requested, {
      ...bounds,
      allowMapOverlap: true,
    });

    expect(oracleRectHitsPolygon({ ...requested, ...blocked }, mapPolygon, 0)).toBe(false);
    expect(allowed).toEqual({ x: requested.x, y: requested.y });
    expect(oracleRectHitsPolygon({ ...requested, ...allowed }, mapPolygon, 0)).toBe(true);
  });

  it(
    "separates element overlap permission from map overlap permission",
    () => {
      const blockedByElement = clampCardPosition(requestedElementPosition, {
        ...elementProbeBounds,
        allowElementOverlap: false,
      });
      const allowedOverElement = clampCardPosition(requestedElementPosition, {
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
      const stillBlockedByMap = clampCardPosition(requestedMapPosition, {
        ...elementProbeBounds,
        allowElementOverlap: true,
        allowMapOverlap: false,
      });
      expect(overlaps({ ...requestedMapPosition, ...stillBlockedByMap }, elementProbeBounds.map)).toBe(false);
    },
  );
});
