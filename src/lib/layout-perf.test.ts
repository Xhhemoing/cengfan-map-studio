import { describe, expect, it } from "vitest";
import type { CardLayoutBounds, CardPlacement } from "./card-layout";
import {
  assertLayoutInvariants,
  makeLayoutHealthBenchmarkFixture,
} from "./layout-perf";

const bounds: CardLayoutBounds = {
  width: 500,
  height: 300,
  map: { x: 150, y: 60, width: 200, height: 180 },
  margin: 20,
  gap: 10,
};

function placement(id: string, x: number, y: number): CardPlacement {
  return {
    id,
    anchorX: 250,
    anchorY: 150,
    width: 80,
    height: 40,
    x,
    y,
    side: "left",
  };
}

describe("assertLayoutInvariants", () => {
  it("accepts finite, contained placements separated by the configured gap", () => {
    expect(() => assertLayoutInvariants([
      placement("left", 20, 20),
      placement("right", 110, 20),
    ], bounds, { checkOverlaps: true })).not.toThrow();
  });

  it("rejects non-finite geometry and placements outside the safe margin", () => {
    expect(() => assertLayoutInvariants([
      { ...placement("nan", 20, 20), x: Number.NaN },
    ], bounds)).toThrow(/must be finite/);

    expect(() => assertLayoutInvariants([
      placement("outside", 19, 20),
    ], bounds)).toThrow(/outside the canvas margin/);
  });

  it("checks card overlap only when requested", () => {
    const overlapping = [
      placement("first", 20, 20),
      placement("second", 90, 20),
    ];

    expect(() => assertLayoutInvariants(overlapping, bounds)).not.toThrow();
    expect(() => assertLayoutInvariants(overlapping, bounds, { checkOverlaps: true }))
      .toThrow(/first and second/);
  });

  it("keeps a same-anchor cluster on one side when requested", () => {
    const cohesive = [
      placement("cluster-a", 20, 20),
      { ...placement("cluster-b", 110, 20), anchorX: 260, anchorY: 155 },
    ];
    const split = [
      cohesive[0]!,
      { ...cohesive[1]!, side: "right" as const },
    ];

    expect(() => assertLayoutInvariants(cohesive, bounds, {
      checkSameAnchorClusters: true,
    })).not.toThrow();
    expect(() => assertLayoutInvariants(split, bounds)).not.toThrow();
    expect(() => assertLayoutInvariants(split, bounds, {
      checkSameAnchorClusters: true,
    })).toThrow(/same-anchor cluster split.*cluster-a and cluster-b/);
  });
});

describe("layout health benchmark fixture", () => {
  it("builds scalable card rectangles and three-segment polylines", () => {
    const fixture = makeLayoutHealthBenchmarkFixture(3);

    expect(fixture).toMatchObject({
      laneCount: 3,
      cardCount: 6,
      connectorCount: 3,
      segmentsPerConnector: 3,
      input: {
        canvas: {
          width: expect.any(Number),
          height: expect.any(Number),
          safeMargin: expect.any(Number),
        },
        objects: expect.any(Array),
        connectors: expect.any(Array),
      },
    });
    expect(fixture.input.objects).toHaveLength(6);
    expect(fixture.input.connectors).toHaveLength(3);
    expect(fixture.input.connectors?.[0]).toMatchObject({
      id: expect.any(String),
      cardId: expect.any(String),
      anchor: { x: expect.any(Number), y: expect.any(Number) },
      segments: [
        { start: { x: expect.any(Number), y: expect.any(Number) }, end: { x: expect.any(Number), y: expect.any(Number) } },
        { start: { x: expect.any(Number), y: expect.any(Number) }, end: { x: expect.any(Number), y: expect.any(Number) } },
        { start: { x: expect.any(Number), y: expect.any(Number) }, end: { x: expect.any(Number), y: expect.any(Number) } },
      ],
    });
  });
});
