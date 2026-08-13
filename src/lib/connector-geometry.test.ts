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

  it("does not count a shared geographic anchor as a crossing (bouquet fan-out)", () => {
    const anchor = { x: 515.9, y: 605.4 };
    const first = buildConnectorGeometry({
      card: { x: 376, y: 560.4, width: 170, height: 90 },
      anchor,
      preferredSide: "left",
      style: "curve",
    });
    const second = buildConnectorGeometry({
      card: { x: 376, y: 327.4, width: 170, height: 90 },
      anchor,
      preferredSide: "left",
      style: "curve",
    });
    // 同锚点双卡：两条曲线在锚点处会合，但中间段不交叉。
    expect(connectorGeometriesIntersect(first, second, 2)).toBe(false);
    // 中间段真正交叉的仍要检出：一条从上方斜穿 first 水平曲线中段的直线。
    const crossing: ConnectorGeometry = {
      port: { x: 540, y: 585, side: "top" },
      pathData: "",
      segments: [{ start: { x: 540, y: 585 }, end: { x: 520, y: 625 } }],
    };
    expect(connectorGeometriesIntersect(first, crossing, 2)).toBe(true);
  });

  it("detects a real crossing whose segment enters the shared-anchor zone from afar", () => {
    // 两条线尾端相距约 0.7px（触发 sharedAnchor 豁免检查），但 B 的长段
    // 从远处（start 距锚点 >10px）斜穿 A 的水平中段——必须仍然判交叉。
    const horizontal: ConnectorGeometry = {
      port: { x: 500, y: 600, side: "right" },
      pathData: "",
      segments: [{ start: { x: 500, y: 600 }, end: { x: 540, y: 600 } }],
    };
    const longSegment: ConnectorGeometry = {
      port: { x: 520, y: 630, side: "top" },
      pathData: "",
      segments: [{ start: { x: 520, y: 630 }, end: { x: 539.5, y: 599.5 } }],
    };
    expect(connectorGeometriesIntersect(horizontal, longSegment, 2)).toBe(true);
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
