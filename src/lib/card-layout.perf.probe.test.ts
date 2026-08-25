import { describe, expect, it } from "vitest";
import * as cardLayoutModule from "./card-layout";
import {
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
type AdaptCardLayout = (
  placements: CardPlacement[],
  movedId: string,
  nextPosition: { x: number; y: number },
  bounds: CardLayoutBounds,
  options?: unknown,
) => unknown;

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

function supportsMode(mode: ExpectedMode): boolean {
  if (!(CARD_LAYOUT_MODES as readonly string[]).includes(mode)) return false;
  try {
    const result = solveCardLayout([], probeBounds, { mode: mode as CardLayoutMode });
    return result.mode === mode;
  } catch {
    return false;
  }
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
    expect(result.placements).toHaveLength(cards.length);
  }
  return { medianMs: median(sampleMs), sampleMs };
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
  for (const mode of EXPECTED_MODES) {
    const supported = supportsMode(mode);
    describe(mode, () => {
      for (const count of CARD_COUNTS) {
        it.skipIf(!supported)(`records the ${count}-card median across ${SAMPLE_COUNT} solves`, () => {
          const measurement = measureSolve(mode, makeCards(count));
          console.info(
            `[card-layout-perf] solve mode=${mode} cards=${count} median=${measurement.medianMs.toFixed(3)}ms`
              + ` samples=${measurement.sampleMs.map((sample) => sample.toFixed(3)).join(",")}`,
          );
          expect(Number.isFinite(measurement.medianMs)).toBe(true);
          expect(measurement.medianMs).toBeGreaterThanOrEqual(0);
          if (count === 24 && measurement.medianMs >= 200) {
            console.warn(
              `[card-layout-perf] soft-threshold mode=${mode} cards=24 median=${measurement.medianMs.toFixed(3)}ms >= 200ms`,
            );
          }
        });
      }

      it.skipIf(!supported)("counts straight-connector crossings for 24 seeded random cards", () => {
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

  const adaptCardLayout = (
    cardLayoutModule as unknown as { adaptCardLayout?: AdaptCardLayout }
  ).adaptCardLayout;

  it.skipIf(typeof adaptCardLayout !== "function")(
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
        adaptCardLayout!(
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
    },
  );
});
