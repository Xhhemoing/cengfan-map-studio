import { describe, expect, it } from "vitest";
import {
  clampCardPosition,
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardPoint,
  type CardPolygon,
} from "./card-layout";
import {
  clamp,
  fuzzScenario,
  oracleRectHitsPolygon,
  overlapsWithGap,
  seededRandom,
} from "./card-layout-test-fixtures";

describe("card layout hard-constraint properties", () => {
  it("never violates margin, card spacing or polygon obstacles on any solved layout", () => {
    for (let seed = 1; seed <= 180; seed += 1) {
      const { cards, bounds: layoutBounds, options } = fuzzScenario(seed);
      const context = `seed=${seed} mode=${options.mode} cards=${cards.length}`;
      const result = solveCardLayout(cards, layoutBounds, options);

      expect(result.placements, context).toHaveLength(cards.length);
      expect(result.placements.map((placement) => placement.id), context)
        .toEqual(cards.map((card) => card.id));
      if (result.status !== "solved") continue;

      const gap = layoutBounds.gap;
      for (const placement of result.placements) {
        expect(placement.x, `${context} left margin`).toBeGreaterThanOrEqual(layoutBounds.margin - 1e-6);
        expect(placement.y, `${context} top margin`).toBeGreaterThanOrEqual(layoutBounds.margin - 1e-6);
        expect(placement.x + placement.width, `${context} right margin`)
          .toBeLessThanOrEqual(layoutBounds.width - layoutBounds.margin + 1e-6);
        expect(placement.y + placement.height, `${context} bottom margin`)
          .toBeLessThanOrEqual(layoutBounds.height - layoutBounds.margin + 1e-6);
        for (const zone of layoutBounds.occupiedAreas ?? []) {
          expect(overlapsWithGap(placement, zone, gap), `${context} zone ${JSON.stringify(zone)}`).toBe(false);
        }
        for (const polygon of layoutBounds.occupiedPolygons ?? []) {
          expect(oracleRectHitsPolygon(placement, polygon, gap), `${context} polygon`).toBe(false);
        }
      }
      for (let left = 0; left < result.placements.length; left += 1) {
        for (let right = left + 1; right < result.placements.length; right += 1) {
          expect(
            overlapsWithGap(result.placements[left]!, result.placements[right]!, gap),
            `${context} pair ${left}/${right}`,
          ).toBe(false);
        }
      }
    }
  });

  it("matches the naive oracle on every rectangle/polygon obstacle decision", () => {
    // `clampCardPosition` returns the requested position unchanged exactly when
    // the polygon test says it is free, so it is a direct probe of the broad-
    // phase predicate. The canvas is far larger than the polygon, so a free
    // rail always exists and the "nothing fits" fallback never masks a result.
    const spacious: Omit<CardLayoutBounds, "occupiedPolygons"> = {
      width: 2000,
      height: 1400,
      map: { x: 700, y: 500, width: 400, height: 300 },
      margin: 20,
      gap: 0,
      occupiedAreas: [],
    };
    let blocked = 0;
    let free = 0;
    for (let seed = 1; seed <= 1400; seed += 1) {
      const random = seededRandom(seed * 7919 + 13);
      const cx = 500 + random() * 900;
      const cy = 400 + random() * 600;
      const radiusX = 20 + random() * 200;
      const radiusY = 20 + random() * 200;
      const vertices = 3 + Math.floor(random() * 26);
      const ring: CardPoint[] = [];
      for (let step = 0; step < vertices; step += 1) {
        const angle = (step / vertices) * Math.PI * 2;
        // Strong radial wobble produces concave rings whose edges cut the card
        // rectangle without ever putting a vertex or a corner inside it.
        const wobble = 0.25 + random() * 1.4;
        ring.push({ x: cx + Math.cos(angle) * radiusX * wobble, y: cy + Math.sin(angle) * radiusY * wobble });
      }
      const polygon: CardPolygon = random() < 0.5
        ? { rings: [ring] }
        : { rings: [ring], bounds: undefined };
      const layoutBounds: CardLayoutBounds = { ...spacious, occupiedPolygons: [polygon] };
      const position = {
        x: 400 + random() * 1100,
        y: 300 + random() * 800,
        width: 40 + Math.round(random() * 320),
        height: 30 + Math.round(random() * 220),
      };
      const origin = {
        x: clamp(position.x, layoutBounds.margin, layoutBounds.width - layoutBounds.margin - position.width),
        y: clamp(position.y, layoutBounds.margin, layoutBounds.height - layoutBounds.margin - position.height),
        width: position.width,
        height: position.height,
      };
      const expectedFree = !oracleRectHitsPolygon(origin, polygon, 0);
      const clamped = clampCardPosition(position, layoutBounds);
      const actualFree = clamped.x === origin.x && clamped.y === origin.y;
      expect(actualFree, `seed=${seed} vertices=${vertices} rect=${JSON.stringify(origin)}`).toBe(expectedFree);
      if (expectedFree) free += 1; else blocked += 1;
    }
    // Guard the guard: both outcomes must be well represented.
    expect(free).toBeGreaterThan(200);
    expect(blocked).toBeGreaterThan(200);
  });

  it("matches the naive oracle on lattice-aligned tangency, where rejects touch exactly", () => {
    // Integer polygons swept by an integer rectangle make edge-on-edge and
    // vertex-on-corner contact common instead of measure-zero, which is where a
    // bounding-box reject that forgets its epsilon slack starts lying.
    const shapes: CardPoint[][] = [
      [{ x: 600, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 600 }, { x: 600, y: 600 }],
      [{ x: 700, y: 380 }, { x: 820, y: 500 }, { x: 700, y: 620 }, { x: 580, y: 500 }],
      // Concave comb: long thin teeth that slice a card without ever putting a
      // vertex inside it or a card corner inside the polygon.
      [
        { x: 560, y: 400 }, { x: 860, y: 400 }, { x: 860, y: 420 }, { x: 600, y: 420 },
        { x: 600, y: 480 }, { x: 860, y: 480 }, { x: 860, y: 500 }, { x: 600, y: 500 },
        { x: 600, y: 560 }, { x: 860, y: 560 }, { x: 860, y: 580 }, { x: 560, y: 580 },
      ],
    ];
    const spacious: Omit<CardLayoutBounds, "occupiedPolygons"> = {
      width: 2000,
      height: 1200,
      map: { x: 900, y: 900, width: 200, height: 150 },
      margin: 20,
      gap: 0,
      occupiedAreas: [],
    };
    let blocked = 0;
    let free = 0;
    for (const rings of shapes) {
      for (const size of [{ width: 40, height: 20 }, { width: 120, height: 60 }, { width: 260, height: 40 }]) {
        const polygon: CardPolygon = { rings: [rings] };
        const layoutBounds: CardLayoutBounds = { ...spacious, occupiedPolygons: [polygon] };
        for (let x = 500; x <= 900; x += 20) {
          for (let y = 340; y <= 660; y += 20) {
            const origin = { x, y, width: size.width, height: size.height };
            const expectedFree = !oracleRectHitsPolygon(origin, polygon, 0);
            const clamped = clampCardPosition({ ...origin }, layoutBounds);
            const actualFree = clamped.x === x && clamped.y === y;
            expect(actualFree, `rect=${JSON.stringify(origin)} shape=${rings.length}`).toBe(expectedFree);
            if (expectedFree) free += 1; else blocked += 1;
          }
        }
      }
    }
    expect(free).toBeGreaterThan(100);
    expect(blocked).toBeGreaterThan(100);
  });

  it("keeps the full gap between cards placed by the containment repair scan", () => {
    // Every card shares one anchor, so side packing overflows and the repair
    // scan places most of them against an already-dense canvas. That is the
    // only path that uses the placed-card grid index, so it is where a query
    // box that forgets to grow by `gap` would let neighbours touch.
    for (const gap of [0, 6, 14, 24, 40]) {
      for (const cardCount of [14, 26, 38]) {
        const layoutBounds: CardLayoutBounds = {
          width: 2200,
          height: 1500,
          map: { x: 900, y: 600, width: 400, height: 300 },
          margin: 30,
          gap,
          occupiedAreas: [{ x: 880, y: 580, width: 440, height: 340 }],
        };
        const cards: CardLayoutInput[] = Array.from({ length: cardCount }, (_, index) => ({
          id: `cf-${index}`,
          anchorX: 1100,
          anchorY: 750,
          width: 150 + (index % 5) * 12,
          height: 70 + (index % 3) * 10,
        }));
        const result = solveCardLayout(cards, layoutBounds, { mode: "quadrant" });
        const context = `gap=${gap} cards=${cardCount} status=${result.status}`;
        expect(result.placements, context).toHaveLength(cardCount);
        if (result.status !== "solved") continue;
        for (let left = 0; left < result.placements.length; left += 1) {
          for (let right = left + 1; right < result.placements.length; right += 1) {
            expect(
              overlapsWithGap(result.placements[left]!, result.placements[right]!, gap),
              `${context} pair ${left}/${right}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("agrees with the naive obstacle oracle for every manual clamp result", () => {
    for (let seed = 500; seed <= 620; seed += 1) {
      const { bounds: layoutBounds } = fuzzScenario(seed);
      const polygons = layoutBounds.occupiedPolygons ?? [];
      if (polygons.length === 0 || layoutBounds.allowMapOverlap) continue;
      const random = seededRandom(seed * 31 + 7);
      const position = {
        x: random() * layoutBounds.width,
        y: random() * layoutBounds.height,
        width: 60 + Math.round(random() * 160),
        height: 40 + Math.round(random() * 90),
      };
      const clamped = clampCardPosition(position, layoutBounds);
      const card = { ...clamped, width: position.width, height: position.height };
      const blocked = polygons.some((polygon) => oracleRectHitsPolygon(card, polygon, 0))
        || (layoutBounds.occupiedAreas ?? []).some((zone) => overlapsWithGap(card, zone, 0));
      // The clamp only reports a blocked result when no free rail existed at all.
      if (!blocked) continue;
      const originBlocked = polygons.some((polygon) => oracleRectHitsPolygon(
        { x: clamp(position.x, layoutBounds.margin, layoutBounds.width - layoutBounds.margin - position.width),
          y: clamp(position.y, layoutBounds.margin, layoutBounds.height - layoutBounds.margin - position.height),
          width: position.width,
          height: position.height },
        polygon,
        0,
      ));
      expect(originBlocked, `seed=${seed}`).toBe(true);
    }
  });
});
