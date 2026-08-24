import { describe, expect, it } from "vitest";
import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  resolveConnectorPort,
  segmentIntersectsRect,
  type ConnectorGeometry,
  type ConnectorSegment,
  type Point,
  type Rect,
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

// ----- Naive reference implementations -----
//
// Object-allocating transcriptions of the pre-broad-phase predicates. They are
// the oracle for the bounding-box rejects added to the fast paths: a reject that
// discards a real hit shows up as a disagreement.

const REF_EPSILON = 1e-7;

function refOrientation(first: Point, second: Point, third: Point): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function refPointOnSegment(point: Point, segment: ConnectorSegment): boolean {
  return Math.abs(refOrientation(segment.start, segment.end, point)) <= REF_EPSILON
    && point.x >= Math.min(segment.start.x, segment.end.x) - REF_EPSILON
    && point.x <= Math.max(segment.start.x, segment.end.x) + REF_EPSILON
    && point.y >= Math.min(segment.start.y, segment.end.y) - REF_EPSILON
    && point.y <= Math.max(segment.start.y, segment.end.y) + REF_EPSILON;
}

function refSegmentsIntersect(left: ConnectorSegment, right: ConnectorSegment): boolean {
  const a = refOrientation(left.start, left.end, right.start);
  const b = refOrientation(left.start, left.end, right.end);
  const c = refOrientation(right.start, right.end, left.start);
  const d = refOrientation(right.start, right.end, left.end);
  if (((a > REF_EPSILON && b < -REF_EPSILON) || (a < -REF_EPSILON && b > REF_EPSILON))
    && ((c > REF_EPSILON && d < -REF_EPSILON) || (c < -REF_EPSILON && d > REF_EPSILON))) return true;
  return refPointOnSegment(right.start, left)
    || refPointOnSegment(right.end, left)
    || refPointOnSegment(left.start, right)
    || refPointOnSegment(left.end, right);
}

function refDistanceSquared(left: Point, right: Point): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function refPointSegmentDistance(point: Point, segment: ConnectorSegment): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= REF_EPSILON) return Math.sqrt(refDistanceSquared(point, segment.start));
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (segment.start.x + t * dx), point.y - (segment.start.y + t * dy));
}

function refSegmentDistance(left: ConnectorSegment, right: ConnectorSegment): number {
  if (refSegmentsIntersect(left, right)) return 0;
  return Math.min(
    refPointSegmentDistance(left.start, right),
    refPointSegmentDistance(left.end, right),
    refPointSegmentDistance(right.start, left),
    refPointSegmentDistance(right.end, left),
  );
}

function refGeometriesIntersect(left: ConnectorGeometry, right: ConnectorGeometry, clearance = 0): boolean {
  const leftTail = left.segments[left.segments.length - 1];
  const rightTail = right.segments[right.segments.length - 1];
  const sharedAnchor = Boolean(leftTail && rightTail)
    && refDistanceSquared(leftTail!.end, rightTail!.end) <= (clearance + REF_EPSILON) ** 2;
  const anchorRadius = Math.max(clearance * 4, 10, 24);
  const nearAnchorEnd = (segment: ConnectorSegment, tail: ConnectorSegment) =>
    refDistanceSquared(segment.end, tail.end) <= anchorRadius * anchorRadius
    && refDistanceSquared(segment.start, tail.end) <= anchorRadius * anchorRadius;
  return left.segments.some((first) => right.segments.some((second) => {
    if (sharedAnchor && leftTail && rightTail
      && nearAnchorEnd(first, leftTail) && nearAnchorEnd(second, rightTail)) return false;
    return refSegmentDistance(first, second) <= clearance + REF_EPSILON;
  }));
}

function refSegmentIntersectsRect(segment: ConnectorSegment, rect: Rect, clearance = 0): boolean {
  const expanded = {
    x: rect.x - clearance,
    y: rect.y - clearance,
    width: rect.width + clearance * 2,
    height: rect.height + clearance * 2,
  };
  const contains = (point: Point) => point.x >= expanded.x - REF_EPSILON
    && point.x <= expanded.x + expanded.width + REF_EPSILON
    && point.y >= expanded.y - REF_EPSILON
    && point.y <= expanded.y + expanded.height + REF_EPSILON;
  if (contains(segment.start) || contains(segment.end)) return true;
  const topLeft = { x: expanded.x, y: expanded.y };
  const topRight = { x: expanded.x + expanded.width, y: expanded.y };
  const bottomRight = { x: expanded.x + expanded.width, y: expanded.y + expanded.height };
  const bottomLeft = { x: expanded.x, y: expanded.y + expanded.height };
  return [
    { start: topLeft, end: topRight },
    { start: topRight, end: bottomRight },
    { start: bottomRight, end: bottomLeft },
    { start: bottomLeft, end: topLeft },
  ].some((edge) => refSegmentsIntersect(segment, edge));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("connector geometry broad-phase equivalence", () => {
  it("matches the naive rectangle test on random and lattice-aligned segments", () => {
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 4000; seed += 1) {
      const random = seededRandom(seed * 2654435761);
      // Half the cases snap to a 10px lattice shared with the rectangle so that
      // exact edge contact — the case a bounding-box reject gets wrong — is common.
      const snap = seed % 2 === 0 ? (value: number) => Math.round(value / 10) * 10 : (value: number) => value;
      const segment: ConnectorSegment = {
        start: { x: snap(random() * 400), y: snap(random() * 300) },
        end: { x: snap(random() * 400), y: snap(random() * 300) },
      };
      const rect: Rect = {
        x: snap(50 + random() * 200),
        y: snap(40 + random() * 150),
        width: snap(10 + random() * 120) || 10,
        height: snap(10 + random() * 100) || 10,
      };
      const clearance = seed % 3 === 0 ? 0 : random() * 6;
      const expected = refSegmentIntersectsRect(segment, rect, clearance);
      const actual = segmentIntersectsRect(segment, rect, clearance);
      expect(actual, `seed=${seed} segment=${JSON.stringify(segment)} rect=${JSON.stringify(rect)} clearance=${clearance}`)
        .toBe(expected);
      if (expected) hits += 1; else misses += 1;
    }
    expect(hits).toBeGreaterThan(500);
    expect(misses).toBeGreaterThan(500);
  });

  it("matches the naive connector test on random curve, elbow and straight pairs", () => {
    const styles = ["straight", "elbow", "curve"] as const;
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 900; seed += 1) {
      const random = seededRandom(seed * 40503 + 11);
      const clearance = seed % 4 === 0 ? 0 : random() * 5;
      const sharedAnchor = seed % 5 === 0;
      const anchor = { x: 200 + random() * 400, y: 150 + random() * 300 };
      const build = (index: number) => buildConnectorGeometry({
        card: {
          x: random() * 700,
          y: random() * 500,
          width: 60 + random() * 180,
          height: 40 + random() * 110,
        },
        anchor: sharedAnchor ? anchor : { x: 150 + random() * 500, y: 100 + random() * 400 },
        preferredSide: (["left", "right", "top", "bottom"] as const)[index % 4],
        style: styles[Math.floor(random() * styles.length)]!,
      });
      const left = build(seed);
      const right = build(seed + 1);
      const expected = refGeometriesIntersect(left, right, clearance);
      const actual = connectorGeometriesIntersect(left, right, clearance);
      expect(actual, `seed=${seed} clearance=${clearance} sharedAnchor=${sharedAnchor}`).toBe(expected);
      if (expected) hits += 1; else misses += 1;
    }
    expect(hits).toBeGreaterThan(100);
    expect(misses).toBeGreaterThan(100);
  });

  it("keeps clearance-only contact that no bounding box may discard", () => {
    const horizontal: ConnectorGeometry = {
      port: { x: 0, y: 0, side: "right" },
      pathData: "",
      segments: [{ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }],
    };
    const below = (y: number): ConnectorGeometry => ({
      port: { x: 0, y, side: "right" },
      pathData: "",
      segments: [{ start: { x: 0, y }, end: { x: 100, y } }],
    });
    // Parallel lines never intersect, so only the clearance band can join them:
    // a reject that inflates by less than `clearance` would report false here.
    expect(connectorGeometriesIntersect(horizontal, below(3), 3)).toBe(true);
    expect(connectorGeometriesIntersect(horizontal, below(3), 2.999)).toBe(false);
    expect(segmentIntersectsRect(
      { start: { x: -50, y: 0 }, end: { x: 150, y: 0 } },
      { x: 0, y: 5, width: 40, height: 40 },
      5,
    )).toBe(true);
    expect(segmentIntersectsRect(
      { start: { x: -50, y: 0 }, end: { x: 150, y: 0 } },
      { x: 0, y: 5, width: 40, height: 40 },
      4.999,
    )).toBe(false);
  });

  it("tolerates empty, single-point and non-finite geometry without throwing", () => {
    const empty: ConnectorGeometry = { port: { x: 0, y: 0, side: "right" }, pathData: "", segments: [] };
    const point: ConnectorGeometry = {
      port: { x: 10, y: 10, side: "right" },
      pathData: "",
      segments: [{ start: { x: 10, y: 10 }, end: { x: 10, y: 10 } }],
    };
    const broken: ConnectorGeometry = {
      port: { x: Number.NaN, y: Number.NaN, side: "top" },
      pathData: "",
      segments: [{ start: { x: Number.NaN, y: 0 }, end: { x: Number.POSITIVE_INFINITY, y: Number.NaN } }],
    };
    expect(connectorGeometriesIntersect(empty, point, 2)).toBe(false);
    expect(connectorGeometriesIntersect(point, empty, 2)).toBe(false);
    expect(connectorGeometriesIntersect(empty, empty, 2)).toBe(false);
    // Two coincident degenerate connectors share an anchor, so the bouquet
    // exemption applies before any distance test — same as the naive reference.
    expect(connectorGeometriesIntersect(point, point, 2)).toBe(refGeometriesIntersect(point, point, 2));
    expect(connectorGeometriesIntersect(point, point, 2)).toBe(false);
    expect(() => connectorGeometriesIntersect(broken, point, 2)).not.toThrow();
    expect(() => connectorGeometriesIntersect(point, broken, 2)).not.toThrow();
    expect(() => segmentIntersectsRect(broken.segments[0]!, { x: 0, y: 0, width: 10, height: 10 }, 1)).not.toThrow();
    expect(() => buildConnectorGeometry({
      card: { x: Number.NaN, y: 0, width: Number.NaN, height: 10 },
      anchor: { x: Number.POSITIVE_INFINITY, y: Number.NaN },
      style: "curve",
    })).not.toThrow();
  });
});
