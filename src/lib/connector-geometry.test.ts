import { describe, expect, it } from "vitest";
import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  resolveConnectorPort,
  segmentIntersectsRect,
  type ConnectorGeometry,
} from "./connector-geometry";

const card = { x: 100, y: 80, width: 120, height: 60 };

describe("connector geometry", () => {
  it("uses the card edge facing the geographic anchor", () => {
    expect(buildConnectorGeometry({ card, anchor: { x: 300, y: 110 }, style: "straight" }).port)
      .toEqual({ x: 220, y: 110, side: "right" });
    expect(buildConnectorGeometry({ card, anchor: { x: 40, y: 110 }, style: "straight" }).port)
      .toEqual({ x: 100, y: 110, side: "left" });
    expect(buildConnectorGeometry({ card, anchor: { x: 160, y: 20 }, style: "straight" }).port)
      .toEqual({ x: 160, y: 80, side: "top" });
    expect(buildConnectorGeometry({ card, anchor: { x: 160, y: 220 }, style: "straight" }).port)
      .toEqual({ x: 160, y: 140, side: "bottom" });
  });

  it("clips the anchor-to-center line at the first card edge", () => {
    // The visible line ends where the direct anchor-to-center ray enters the card.
    // It no longer projects the anchor onto a fixed track edge, which could be farther away.
    const rightColumn = { x: 1164, y: 760, width: 210, height: 96 };
    const anchor = { x: 960, y: 400 };
    const rightPort = resolveConnectorPort(rightColumn, anchor);
    expect(rightPort.x).toBeCloseTo(1232.647059);
    expect(rightPort.y).toBe(760);
    expect(rightPort.side).toBe("top");
    const straight = buildConnectorGeometry({ card: rightColumn, anchor, style: "straight" });
    expect(straight.segments[0]!.start).toEqual({ x: rightPort.x, y: rightPort.y });
    expect(straight.segments[0]!.end).toEqual(anchor);

    const leftColumn = { x: 120, y: 200, width: 210, height: 96 };
    const leftPort = resolveConnectorPort(leftColumn, { x: 560, y: 700 });
    expect(leftPort.x).toBeCloseTo(260.571429);
    expect(leftPort.y).toBe(296);
    expect(leftPort.side).toBe("bottom");
  });

  it("uses the center-ray boundary instead of the nearest point projection", () => {
    const diagonal = buildConnectorGeometry({
      card: { x: 100, y: 100, width: 120, height: 80 },
      anchor: { x: 20, y: 20 },
      style: "straight",
    });

    expect(diagonal.port).toEqual({ x: 113.33333333333334, y: 100, side: "top" });
    expect(diagonal.pathData).toBe("M113.333 100 L20 20");
  });

  it("returns the exact path and collision segments used by straight and elbow rendering", () => {
    const straight = buildConnectorGeometry({ card, anchor: { x: 300, y: 110 }, style: "straight" });
    expect(straight.pathData).toBe("M220 110 L300 110");
    expect(straight.segments).toEqual([{ start: { x: 220, y: 110 }, end: { x: 300, y: 110 } }]);

    const elbow = buildConnectorGeometry({ card, anchor: { x: 300, y: 180 }, style: "elbow" });
    // Map-facing port clamps y toward the anchor on the right edge.
    expect(elbow.pathData).toBe("M220 140 L260 140 L260 180 L300 180");
    expect(elbow.segments).toHaveLength(3);
  });

  it("flattens curve rendering into deterministic short collision segments", () => {
    const first = buildConnectorGeometry({ card, anchor: { x: 340, y: 220 }, style: "curve" });
    const second = buildConnectorGeometry({ card, anchor: { x: 340, y: 220 }, style: "curve" });

    expect(first.pathData).toContain(" C");
    expect(first.segments.length).toBeGreaterThan(4);
    expect(second).toEqual(first);
  });

  it("detects proper crossings, endpoint contact and collinear overlap", () => {
    const geometry = (start: { x: number; y: number }, end: { x: number; y: number }): ConnectorGeometry => ({
      port: { ...start, side: "right" },
      pathData: "",
      segments: [{ start, end }],
    });

    expect(connectorGeometriesIntersect(geometry({ x: 0, y: 0 }, { x: 10, y: 10 }), geometry({ x: 0, y: 10 }, { x: 10, y: 0 }))).toBe(true);
    expect(connectorGeometriesIntersect(geometry({ x: 0, y: 0 }, { x: 10, y: 0 }), geometry({ x: 10, y: 0 }, { x: 15, y: 5 }))).toBe(true);
    expect(connectorGeometriesIntersect(geometry({ x: 0, y: 0 }, { x: 10, y: 0 }), geometry({ x: 5, y: 0 }, { x: 15, y: 0 }))).toBe(true);
    expect(connectorGeometriesIntersect(geometry({ x: 0, y: 0 }, { x: 10, y: 0 }), geometry({ x: 0, y: 4 }, { x: 10, y: 4 }), 1)).toBe(false);
  });

  it("detects a connector entering an expanded card rectangle", () => {
    expect(segmentIntersectsRect(
      { start: { x: 20, y: 50 }, end: { x: 180, y: 50 } },
      { x: 80, y: 20, width: 40, height: 60 },
      2,
    )).toBe(true);
    expect(segmentIntersectsRect(
      { start: { x: 20, y: 10 }, end: { x: 180, y: 10 } },
      { x: 80, y: 20, width: 40, height: 60 },
      2,
    )).toBe(false);
  });
});
