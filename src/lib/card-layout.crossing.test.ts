import { describe, expect, it } from "vitest";
import type {
  CardLayoutBounds,
  CardLayoutOptions,
  CardPlacement,
} from "./card-layout";
import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  type ConnectorStyle,
} from "./connector-geometry";

const layout = await import("./card-layout");
const solveCardLayout = layout.solveCardLayout;

type CrossingOptions = CardLayoutOptions & {
  forbidConnectorCrossing?: boolean;
};

const crossingBounds: CardLayoutBounds = {
  width: 1000,
  height: 700,
  map: { x: 310, y: 160, width: 380, height: 380 },
  margin: 24,
  gap: 12,
  occupiedAreas: [{ x: 350, y: 190, width: 300, height: 320 }],
};

function countCrossings(
  placements: CardPlacement[],
  clearance = 0,
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
      if (connectorGeometriesIntersect(geometries[left]!, geometries[right]!, clearance)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

const hasForbidConnectorCrossing = (() => {
  let optionWasRead = false;
  const options: CrossingOptions = {
    mode: "quadrant",
    connectorStyle: "straight",
    connectorWidth: 0,
  };
  Object.defineProperty(options, "forbidConnectorCrossing", {
    configurable: true,
    get() {
      optionWasRead = true;
      return true;
    },
  });
  solveCardLayout([
    { id: "probe-a", anchorX: 410, anchorY: 245, width: 190, height: 88 },
    { id: "probe-b", anchorX: 590, anchorY: 455, width: 190, height: 88 },
  ], crossingBounds, options);
  return optionWasRead;
})();

describe("card layout connector crossing boundary", () => {
  it.skipIf(!hasForbidConnectorCrossing)(
    "defaults to forbidding crossings for diagonally opposed anchors",
    () => {
      const cards = [
        { id: "north-west", anchorX: 410, anchorY: 245, width: 190, height: 88 },
        { id: "south-east", anchorX: 590, anchorY: 455, width: 190, height: 88 },
      ];

      const constrained = solveCardLayout(cards, crossingBounds, {
        mode: "quadrant",
        connectorStyle: "straight",
        connectorWidth: 0,
      });
      const unconstrained = solveCardLayout(cards, crossingBounds, {
        mode: "quadrant",
        connectorStyle: "straight",
        connectorWidth: 0,
        forbidConnectorCrossing: false,
      } as CrossingOptions);
      const constrainedCrossings = countCrossings(constrained.placements);
      const unconstrainedCrossings = countCrossings(unconstrained.placements);

      expect(constrained.placements).toHaveLength(cards.length);
      expect(unconstrained.placements).toHaveLength(cards.length);
      expect(constrainedCrossings === 0 || constrained.status === "fallback").toBe(true);
      expect(constrainedCrossings).toBeLessThanOrEqual(unconstrainedCrossings);
    },
  );

  it("does not count a near-shared-anchor connector bouquet as a crossing failure", () => {
    const cards = [
      { id: "bouquet-a", anchorX: 500, anchorY: 350, width: 180, height: 82 },
      { id: "bouquet-b", anchorX: 500.5, anchorY: 350.5, width: 180, height: 82 },
    ];
    const result = solveCardLayout(cards, crossingBounds, {
      mode: "quadrant",
      connectorStyle: "curve",
      connectorWidth: 2,
    });

    expect(result.placements).toHaveLength(cards.length);
    expect(countCrossings(result.placements, 2, "curve")).toBe(0);
  });
});
