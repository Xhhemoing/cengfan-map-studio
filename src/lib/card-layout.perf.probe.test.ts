import { describe, expect, it } from "vitest";
import {
  adaptCardLayout,
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
  type CardPolygon,
} from "./card-layout";
import { bounds, seededRandom } from "./card-layout-test-fixtures";
import { buildConnectorGeometry, connectorGeometriesIntersect } from "./connector-geometry";
import { CARD_LAYOUT_MODES } from "./scene-document";

const EXPECTED_MODES = [
  "proximity",
  "columns",
  "quadrant",
  "radial",
  "right-stack",
  "grid",
] as const;
const CARD_COUNTS = [8, 24, 48] as const;
const SAMPLE_COUNT = 8;

type ExpectedMode = (typeof EXPECTED_MODES)[number];

function rectanglePolygon(x: number, y: number, width: number, height: number): CardPolygon {
  return {
    bounds: { x, y, width, height },
    rings: [[
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]],
  };
}

const occupiedPolygons: CardPolygon[] = [
  rectanglePolygon(430, 210, 190, 150),
  rectanglePolygon(680, 410, 220, 160),
  rectanglePolygon(930, 250, 150, 210),
];

const probeBounds: CardLayoutBounds = {
  ...bounds,
  map: { ...bounds.map },
  occupiedPolygons,
};

function makeCards(count: number, seed = 0x5eed_2026): CardLayoutInput[] {
  const random = seededRandom(seed + count);
  return Array.from({ length: count }, (_, index) => ({
    id: `perf-${count}-${index}`,
    anchorX: bounds.map.x + 30 + random() * (bounds.map.width - 60),
    anchorY: bounds.map.y + 30 + random() * (bounds.map.height - 60),
    width: 108 + Math.round(random() * 42),
    height: 48 + Math.round(random() * 24),
  }));
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function measureSolve(mode: ExpectedMode, cards: CardLayoutInput[]): {
  medianMs: number;
  sampleMs: number[];
} {
  const sampleMs: number[] = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const startedAt = performance.now();
    const result = solveCardLayout(cards, probeBounds, {
      mode: mode as CardLayoutMode,
      connectorStyle: "straight",
      connectorWidth: 1.5,
    });
    sampleMs.push(performance.now() - startedAt);
    expect(result.mode).toBe(mode);
    expect(result.placements).toHaveLength(cards.length);
  }
  return { medianMs: median(sampleMs), sampleMs };
}

function sameLayout(left: CardPlacement[], right: CardPlacement[]): boolean {
  return left.length === right.length && left.every((placement, index) => {
    const counterpart = right[index];
    return counterpart !== undefined
      && placement.id === counterpart.id
      && placement.x === counterpart.x
      && placement.y === counterpart.y
      && placement.side === counterpart.side;
  });
}

function countStraightConnectorCrossings(placements: CardPlacement[]): number {
  const geometries = placements.map((placement) => buildConnectorGeometry({
    card: placement,
    anchor: { x: placement.anchorX, y: placement.anchorY },
    preferredSide: placement.side,
    style: "straight",
  }));
  let crossings = 0;
  for (let left = 0; left < geometries.length; left += 1) {
    for (let right = left + 1; right < geometries.length; right += 1) {
      if (connectorGeometriesIntersect(geometries[left]!, geometries[right]!, 1.5)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

describe("card layout repeatable performance probe", () => {
  it("keeps the probe mode list aligned with the production mode list", () => {
    expect(CARD_LAYOUT_MODES).toEqual(EXPECTED_MODES);
  });

  for (const mode of ["proximity", "columns"] as const) {
    it(`detects ${mode} from a real 24-card solve instead of an empty-layout feature check`, () => {
      const cards = makeCards(24, 0xc205_524);
      const options = {
        connectorStyle: "straight" as const,
        connectorWidth: 1.5,
      };
      const actual = solveCardLayout(cards, probeBounds, { ...options, mode });
      const quadrant = solveCardLayout(cards, probeBounds, { ...options, mode: "quadrant" });
      const matchesQuadrant = sameLayout(actual.placements, quadrant.placements);
      console.info(
        `[card-layout-perf] mode-detection mode=${mode} cards=24`
          + ` resultMode=${actual.mode} matchesQuadrant=${matchesQuadrant}`,
      );
      expect(actual.mode).toBe(mode);
      expect(actual.placements).toHaveLength(cards.length);
      expect(matchesQuadrant).toBe(false);
    });
  }

  for (const mode of EXPECTED_MODES) {
    describe(mode, () => {
      for (const count of CARD_COUNTS) {
        it(`records the ${count}-card median across ${SAMPLE_COUNT} solves`, () => {
          const measurement = measureSolve(mode, makeCards(count));
          console.info(
            `[card-layout-perf] solve mode=${mode} cards=${count} median=${measurement.medianMs.toFixed(3)}ms`
              + ` samples=${measurement.sampleMs.map((sample) => sample.toFixed(3)).join(",")}`,
          );
          expect(Number.isFinite(measurement.medianMs)).toBe(true);
          expect(measurement.medianMs).toBeGreaterThanOrEqual(0);
          expect(measurement.medianMs).toBeLessThan(1_000);
          if (count === 24 && measurement.medianMs >= 200) {
            console.warn(
              `[card-layout-perf] soft-threshold mode=${mode} cards=24 median=${measurement.medianMs.toFixed(3)}ms >= 200ms`,
            );
          }
        });
      }

      it("counts straight-connector crossings for 24 seeded random cards", () => {
        const cards = makeCards(24, 0xc205_524);
        const result = solveCardLayout(cards, probeBounds, {
          mode: mode as CardLayoutMode,
          connectorStyle: "straight",
          connectorWidth: 1.5,
        });
        const crossings = countStraightConnectorCrossings(result.placements);
        console.info(`[card-layout-perf] crossings mode=${mode} cards=24 style=straight count=${crossings}`);
        expect(Number.isFinite(crossings)).toBe(true);
        expect(crossings).toBeGreaterThanOrEqual(0);
      });
    });
  }

  it(
    `records the 24-card adaptCardLayout median across ${SAMPLE_COUNT} moves`,
    () => {
      const cards = makeCards(24, 0xada9_2026);
      const initial = solveCardLayout(cards, probeBounds, {
        mode: "quadrant",
        connectorStyle: "straight",
      }).placements;
      const moved = initial[0]!;
      const sampleMs: number[] = [];
      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        const placements = initial.map((placement) => ({ ...placement }));
        const startedAt = performance.now();
        adaptCardLayout(
          placements,
          moved.id,
          { x: moved.x + 24, y: moved.y + 12 },
          probeBounds,
        );
        sampleMs.push(performance.now() - startedAt);
      }
      const medianMs = median(sampleMs);
      console.info(
        `[card-layout-perf] adapt cards=24 median=${medianMs.toFixed(3)}ms`
          + ` samples=${sampleMs.map((sample) => sample.toFixed(3)).join(",")}`,
      );
      expect(Number.isFinite(medianMs)).toBe(true);
      expect(medianMs).toBeGreaterThanOrEqual(0);
      expect(medianMs).toBeLessThan(1_000);
    },
  );
});
