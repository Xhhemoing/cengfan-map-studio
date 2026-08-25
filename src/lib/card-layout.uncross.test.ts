import { describe, expect, it } from "vitest";
import {
  repairConnectorCrossings,
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
} from "./card-layout";
import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  type ConnectorStyle,
} from "./connector-geometry";
import { assertHardConstraints, bounds } from "./card-layout-test-fixtures";

const STRAIGHT: CardLayoutOptions = {
  connectorStyle: "straight",
  connectorWidth: 1,
};

function countCrossings(
  placements: CardPlacement[],
  clearance = 1,
  style: ConnectorStyle = "straight",
): number {
  const geometries = placements.map((placement) => buildConnectorGeometry({
    card: placement,
    anchor: { x: placement.anchorX, y: placement.anchorY },
    preferredSide: placement.side,
    style,
  }));
  let crossings = 0;
  for (let left = 0; left < geometries.length; left += 1) {
    for (let right = left + 1; right < geometries.length; right += 1) {
      if (connectorGeometriesIntersect(geometries[left]!, geometries[right]!, clearance)) crossings += 1;
    }
  }
  return crossings;
}

/**
 * Two anchors close enough in x to share the left column, but ordered so the
 * isotonic pack parks the lower-anchored card above the higher-anchored one.
 * Packing alone crosses the two connectors; only a repair can untangle it.
 */
const tangledColumn: CardLayoutInput[] = [
  { id: "south", anchorX: 380, anchorY: 190, width: 220, height: 110 },
  { id: "north", anchorX: 420, anchorY: 150, width: 220, height: 110 },
];

/** The arrangement side packing produces for {@link tangledColumn}. */
const tangledPacked: CardPlacement[] = [
  { ...tangledColumn[0]!, x: 116, y: 507, side: "left" },
  { ...tangledColumn[1]!, x: 116, y: 383, side: "left" },
];

const diagonal: CardLayoutInput[] = [
  { id: "north-west", anchorX: 470, anchorY: 250, width: 220, height: 110 },
  { id: "south-east", anchorX: 1030, anchorY: 690, width: 220, height: 110 },
];

describe("card layout connector uncrossing", () => {
  it.each(["columns", "quadrant"] as const)(
    "ships two diagonally opposed anchors crossing-free with room to spare: %s",
    (mode) => {
      const result = solveCardLayout(diagonal, bounds, { ...STRAIGHT, mode });

      expect(result.status).toBe("solved");
      expect(countCrossings(result.placements)).toBe(0);
      assertHardConstraints(result.placements, bounds);
    },
  );

  it("packs a column whose slot order forces a crossing before any repair runs", () => {
    // Guards the two mode assertions below from passing vacuously: the board
    // the packer hands over really does cross.
    expect(countCrossings(tangledPacked)).toBeGreaterThan(0);
  });

  it.each(["columns", "quadrant"] as const)(
    "untangles a packed column instead of shipping it as a fallback: %s",
    (mode) => {
      const result = solveCardLayout(tangledColumn, bounds, { ...STRAIGHT, mode });

      expect(result.status).toBe("solved");
      expect(countCrossings(result.placements)).toBe(0);
      assertHardConstraints(result.placements, bounds);
      // The cards keep the column they were packed into; only their order changed.
      expect(result.placements.map((placement) => placement.side)).toEqual(["left", "left"]);
      expect(result.placements.map((placement) => placement.x)).toEqual([116, 116]);
    },
  );

  it("repairs a placed board in isolation without breaking hard constraints", () => {
    const repaired = repairConnectorCrossings(tangledPacked, bounds, STRAIGHT);

    expect(countCrossings(repaired)).toBe(0);
    expect(repaired.map((placement) => placement.id)).toEqual(tangledPacked.map((placement) => placement.id));
    assertHardConstraints(repaired, bounds);
  });

  it("leaves an already crossing-free board untouched", () => {
    const clean = solveCardLayout(diagonal, bounds, { ...STRAIGHT, mode: "columns" }).placements;

    expect(repairConnectorCrossings(clean, bounds, STRAIGHT)).toBe(clean);
  });

  it("does not untangle or fall back when crossings are allowed", () => {
    const relaxed: CardLayoutOptions = { ...STRAIGHT, mode: "columns", forbidConnectorCrossing: false };

    expect(repairConnectorCrossings(tangledPacked, bounds, relaxed)).toBe(tangledPacked);

    const result = solveCardLayout(tangledColumn, bounds, relaxed);
    expect(result.status).toBe("solved");
    expect(countCrossings(result.placements)).toBeGreaterThan(0);
    expect(result.placements.map((placement) => [placement.x, placement.y]))
      .toEqual(tangledPacked.map((placement) => [placement.x, placement.y]));
  });

  it("ignores a board with no connector style, where nothing can cross", () => {
    expect(repairConnectorCrossings(tangledPacked, bounds, { mode: "columns" })).toBe(tangledPacked);
  });

  describe("shared-anchor bouquet", () => {
    const bouquetBounds: CardLayoutBounds = {
      width: 1000,
      height: 700,
      map: { x: 310, y: 160, width: 380, height: 380 },
      margin: 24,
      gap: 12,
      occupiedAreas: [{ x: 350, y: 190, width: 300, height: 320 }],
    };
    const bouquet: CardLayoutInput[] = [
      { id: "bouquet-a", anchorX: 500, anchorY: 350, width: 180, height: 82 },
      { id: "bouquet-b", anchorX: 500.5, anchorY: 350.5, width: 180, height: 82 },
    ];

    it.each(["columns", "quadrant"] as const)(
      "keeps a curve bouquet on one rail and counts no crossing: %s",
      (mode) => {
        const result = solveCardLayout(bouquet, bouquetBounds, {
          mode,
          connectorStyle: "curve",
          connectorWidth: 2,
        });

        expect(result.status).toBe("solved");
        expect(countCrossings(result.placements, 2, "curve")).toBe(0);
        expect(new Set(result.placements.map((placement) => placement.side)).size).toBe(1);
        assertHardConstraints(result.placements, bouquetBounds, bouquetBounds.occupiedAreas);
      },
    );

    it("does not scatter a straight bouquet whose crossing is unavoidable", () => {
      // Two straight connectors ending on the same pixel always meet, so the
      // repair must not tear the pair apart chasing a crossing it cannot remove.
      const result = solveCardLayout(bouquet, bouquetBounds, { ...STRAIGHT, mode: "columns" });

      expect(result.placements).toHaveLength(bouquet.length);
      expect(new Set(result.placements.map((placement) => placement.side)).size).toBe(1);
      assertHardConstraints(result.placements, bouquetBounds, bouquetBounds.occupiedAreas);
    });
  });
});
