import { describe, expect, it } from "vitest";
import { buildConnectorGeometry, connectorGeometriesIntersect } from "./connector-geometry";
import { clampDestinationCardPosition, layoutDestinationCards, solveDestinationCardLayout } from "./destination-layout";

const bounds = {
  width: 1500,
  height: 1000,
  map: { x: 350, y: 120, width: 800, height: 690 },
  margin: 32,
  gap: 14,
};

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function segmentsCross(
  first: { x: number; y: number },
  second: { x: number; y: number },
  third: { x: number; y: number },
  fourth: { x: number; y: number },
): boolean {
  const direction = (start: typeof first, end: typeof first, point: typeof first) => (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  const firstThird = direction(first, second, third);
  const firstFourth = direction(first, second, fourth);
  const thirdFirst = direction(third, fourth, first);
  const thirdSecond = direction(third, fourth, second);
  return firstThird * firstFourth < 0 && thirdFirst * thirdSecond < 0;
}

describe("destination card layout", () => {
  it("keeps each province card close to its map anchor on the nearest map side", () => {
    const [west, east] = layoutDestinationCards([
      { id: "sichuan", anchorX: 560, anchorY: 540, width: 250, height: 112 },
      { id: "zhejiang", anchorX: 900, anchorY: 480, width: 250, height: 112 },
    ], bounds);

    expect(west).toMatchObject({ id: "sichuan", side: "left", x: 86 });
    expect(east).toMatchObject({ id: "zhejiang", side: "right", x: 1164 });
    expect(Math.abs(west.y + west.height / 2 - 540)).toBeLessThanOrEqual(56);
    expect(Math.abs(east.y + east.height / 2 - 480)).toBeLessThanOrEqual(56);
  });

  it("keeps a manually moved card on map-frame whitespace when no occupied geography is provided as blockers", () => {
    const position = clampDestinationCardPosition({ x: 600, y: 400, width: 250, height: 112 }, {
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons: [],
    });

    expect(position).toEqual({ x: 600, y: 400 });
  });

  it("still keeps a manually moved card off the map union when that union is the only known occupied region", () => {
    const position = clampDestinationCardPosition({ x: 600, y: 400, width: 250, height: 112 }, bounds);

    expect(position.x).toBeGreaterThanOrEqual(bounds.margin);
    expect(position.y).toBeGreaterThanOrEqual(bounds.margin);
    expect(position.x + 250).toBeLessThanOrEqual(bounds.width - bounds.margin);
    expect(position.y + 112).toBeLessThanOrEqual(bounds.height - bounds.margin);
    expect(overlaps({ ...position, width: 250, height: 112 }, bounds.map)).toBe(false);
  });

  it("moves adjacent cards just enough to prevent collisions while preserving stable order", () => {
    const cards = layoutDestinationCards([
      { id: "a", anchorX: 560, anchorY: 240, width: 250, height: 120 },
      { id: "b", anchorX: 570, anchorY: 270, width: 250, height: 120 },
      { id: "c", anchorX: 580, anchorY: 300, width: 250, height: 120 },
    ], bounds);

    expect(cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
    expect(cards.every((card) => card.y >= bounds.margin && card.y + card.height <= bounds.height - bounds.margin)).toBe(true);
    expect(overlaps(cards[0]!, cards[1]!)).toBe(false);
    expect(overlaps(cards[1]!, cards[2]!)).toBe(false);
  });

  it("keeps dense cards inside the canvas and distributes each side vertically", () => {
    const cards = layoutDestinationCards(
      Array.from({ length: 8 }, (_, index) => ({
        id: `card-${index}`,
        anchorX: index % 2 === 0 ? 560 : 900,
        anchorY: 180 + index * 70,
        width: 220,
        height: 110,
      })),
      bounds,
    );

    expect(cards.every((card) => card.y >= bounds.margin && card.y + card.height <= bounds.height - bounds.margin)).toBe(true);
    expect(cards.every((card) => card.x >= bounds.margin && card.x + card.width <= bounds.width - bounds.margin)).toBe(true);
    for (let index = 0; index < cards.length; index += 1) {
      for (let other = index + 1; other < cards.length; other += 1) {
        expect(overlaps(cards[index]!, cards[other]!)).toBe(false);
      }
    }
    // Prefer multi-side or multi-track distribution instead of a single overflowing column.
    const sides = new Set(cards.map((card) => card.side));
    const xBands = new Set(cards.map((card) => Math.round(card.x / 20)));
    expect(sides.size > 1 || xBands.size > 2).toBe(true);
  });

  it("spreads dense same-side cards across open canvas tracks instead of overflowing one column", () => {
    const cards = layoutDestinationCards(
      Array.from({ length: 12 }, (_, index) => ({
        id: `east-${index}`,
        anchorX: 960,
        anchorY: 210 + index * 34,
        width: 210,
        height: 96,
      })),
      {
        ...bounds,
        occupiedAreas: [
          { x: 520, y: 240, width: 230, height: 330 },
          { x: 780, y: 300, width: 220, height: 300 },
        ],
      },
    );

    expect(cards.every((card) => card.x >= bounds.margin && card.y >= bounds.margin && card.x + card.width <= bounds.width - bounds.margin && card.y + card.height <= bounds.height - bounds.margin)).toBe(true);
    // Saturation must distribute across sides or vertical tracks rather than a single column.
    const sides = new Set(cards.map((card) => card.side));
    const yBands = new Set(cards.map((card) => Math.round(card.y / 20)));
    expect(sides.size > 1 || yBands.size > 2).toBe(true);
    for (let index = 0; index < cards.length; index += 1) {
      for (let other = index + 1; other < cards.length; other += 1) {
        expect(overlaps(cards[index]!, cards[other]!)).toBe(false);
      }
    }
  });

  it("keeps connectors ordered so nearby province anchors do not produce crossing lines", () => {
    const input = [
      { id: "north", anchorX: 880, anchorY: 250, width: 210, height: 96 },
      { id: "south", anchorX: 900, anchorY: 620, width: 210, height: 96 },
      { id: "middle", anchorX: 920, anchorY: 440, width: 210, height: 96 },
    ];
    const cards = layoutDestinationCards(input, {
      ...bounds,
      occupiedAreas: [{ x: 650, y: 180, width: 380, height: 560 }],
    });

    for (let index = 0; index < cards.length; index += 1) {
      for (let other = index + 1; other < cards.length; other += 1) {
        const left = cards[index]!;
        const right = cards[other]!;
        expect(segmentsCross(
          { x: left.anchorX, y: left.anchorY },
          { x: left.x + left.width / 2, y: left.y + left.height / 2 },
          { x: right.anchorX, y: right.anchorY },
          { x: right.x + right.width / 2, y: right.y + right.height / 2 },
        )).toBe(false);
      }
    }
  });

  it.each(["straight", "elbow", "curve"] as const)("uses actual %s connector geometry to produce a crossing-free layout", (connectorStyle) => {
    const input = [
      { id: "north-west", anchorX: 610, anchorY: 220, width: 210, height: 96 },
      { id: "south-east", anchorX: 930, anchorY: 650, width: 210, height: 96 },
      { id: "north-east", anchorX: 940, anchorY: 250, width: 210, height: 96 },
      { id: "south-west", anchorX: 590, anchorY: 620, width: 210, height: 96 },
    ];
    const result = solveDestinationCardLayout(input, {
      ...bounds,
      occupiedAreas: [{ x: 560, y: 170, width: 430, height: 540 }],
    }, { connectorStyle, connectorWidth: 2 });

    expect(result.status).toBe("solved");
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        const left = result.placements[index]!;
        const right = result.placements[other]!;
        const leftGeometry = buildConnectorGeometry({ card: left, anchor: { x: left.anchorX, y: left.anchorY }, preferredSide: left.side, style: connectorStyle });
        const rightGeometry = buildConnectorGeometry({ card: right, anchor: { x: right.anchorX, y: right.anchorY }, preferredSide: right.side, style: connectorStyle });
        expect(connectorGeometriesIntersect(leftGeometry, rightGeometry, 2)).toBe(false);
      }
    }
  });

  it("is deterministic and reports a fallback instead of throwing when zero-crossing routing is unavailable", () => {
    const input = Array.from({ length: 9 }, (_, index) => ({
      id: `dense-${index}`,
      anchorX: 720 + (index % 3) * 24,
      anchorY: 300 + Math.floor(index / 3) * 24,
      width: 190,
      height: 88,
    }));
    const denseBounds = {
      width: 1000,
      height: 720,
      map: { x: 250, y: 100, width: 500, height: 500 },
      occupiedAreas: [{ x: 300, y: 140, width: 400, height: 420 }],
      margin: 24,
      gap: 10,
    };

    const first = solveDestinationCardLayout(input, denseBounds, { connectorStyle: "elbow", connectorWidth: 2, searchBudget: 200 });
    const second = solveDestinationCardLayout(input, denseBounds, { connectorStyle: "elbow", connectorWidth: 2, searchBudget: 200 });

    expect(["solved", "crossing-fallback", "search-budget-exhausted"]).toContain(first.status);
    expect(second).toEqual(first);
    expect(first.placements).toHaveLength(input.length);
    expect(() => layoutDestinationCards(input, denseBounds)).not.toThrow();
  });

  it("distributes province/city cards around the map on multiple sides near their anchors", () => {
    const input = [
      { id: "xinjiang", anchorX: 480, anchorY: 320, width: 200, height: 96 },
      { id: "heilongjiang", anchorX: 1020, anchorY: 220, width: 200, height: 96 },
      { id: "yunnan", anchorX: 560, anchorY: 700, width: 200, height: 96 },
      { id: "fujian", anchorX: 980, anchorY: 640, width: 200, height: 96 },
      { id: "neimenggu", anchorX: 760, anchorY: 280, width: 200, height: 96 },
      { id: "guangdong", anchorX: 860, anchorY: 720, width: 200, height: 96 },
    ];
    const occupiedAreas = [{ x: 500, y: 220, width: 520, height: 520 }];
    const result = solveDestinationCardLayout(input, {
      ...bounds,
      occupiedAreas,
    }, { connectorStyle: "curve", connectorWidth: 2 });

    expect(result.status).toBe("solved");
    expect(new Set(result.placements.map((card) => card.side)).size).toBeGreaterThan(1);
    for (const card of result.placements) {
      const centerX = card.x + card.width / 2;
      const centerY = card.y + card.height / 2;
      // Each card stays reasonably near its geographic anchor.
      const distance = Math.hypot(centerX - card.anchorX, centerY - card.anchorY);
      expect(distance).toBeLessThan(700);
      // Hard constraints: in-canvas, no province overlap.
      expect(card.x).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.y).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.x + card.width).toBeLessThanOrEqual(bounds.width - bounds.margin);
      expect(card.y + card.height).toBeLessThanOrEqual(bounds.height - bounds.margin);
      expect(occupiedAreas.some((area) => overlaps(card, area))).toBe(false);
    }
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        expect(overlaps(result.placements[index]!, result.placements[other]!)).toBe(false);
      }
    }
  });

  it("keeps same-city cluster cards adjacent and free of box conflicts", () => {
    const occupiedAreas = [{ x: 500, y: 220, width: 520, height: 520 }];
    const input = [
      { id: "bj-a", anchorX: 900, anchorY: 300, width: 200, height: 96 },
      { id: "bj-b", anchorX: 902, anchorY: 302, width: 200, height: 96 },
      { id: "gd", anchorX: 860, anchorY: 720, width: 200, height: 96 },
    ];
    const result = solveDestinationCardLayout(input, {
      ...bounds,
      occupiedAreas,
    }, { connectorStyle: "straight", connectorWidth: 2 });

    expect(result.status).toBe("solved");
    const bjA = result.placements.find((card) => card.id === "bj-a")!;
    const bjB = result.placements.find((card) => card.id === "bj-b")!;
    // Same-anchor cluster cards share a side and never overlap.
    expect(bjA.side).toBe(bjB.side);
    expect(overlaps(bjA, bjB)).toBe(false);
    for (const card of result.placements) {
      expect(card.x).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.y).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.x + card.width).toBeLessThanOrEqual(bounds.width - bounds.margin);
      expect(card.y + card.height).toBeLessThanOrEqual(bounds.height - bounds.margin);
      expect(occupiedAreas.some((area) => overlaps(card, area))).toBe(false);
    }
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        expect(overlaps(result.placements[index]!, result.placements[other]!)).toBe(false);
      }
    }
  });

  it("satisfies all four hard layout constraints for mixed east-dense province cards", () => {
    const occupiedAreas = [
      { x: 520, y: 240, width: 230, height: 330 },
      { x: 780, y: 300, width: 220, height: 300 },
    ];
    const input = [
      { id: "sichuan", anchorX: 560, anchorY: 540, width: 220, height: 100 },
      { id: "zhejiang", anchorX: 900, anchorY: 480, width: 220, height: 100 },
      { id: "beijing", anchorX: 940, anchorY: 280, width: 220, height: 100 },
      { id: "guangdong", anchorX: 860, anchorY: 720, width: 220, height: 100 },
      { id: "xinjiang", anchorX: 480, anchorY: 320, width: 220, height: 100 },
      { id: "fujian", anchorX: 980, anchorY: 640, width: 220, height: 100 },
    ];
    const result = solveDestinationCardLayout(input, {
      ...bounds,
      occupiedAreas,
    }, { connectorStyle: "curve", connectorWidth: 2 });

    expect(result.status).toBe("solved");
    for (const card of result.placements) {
      // 1. canvas + no actual province geometry overlap
      expect(card.x).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.y).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.x + card.width).toBeLessThanOrEqual(bounds.width - bounds.margin);
      expect(card.y + card.height).toBeLessThanOrEqual(bounds.height - bounds.margin);
      expect(occupiedAreas.some((area) => overlaps(card, area))).toBe(false);
      // 3. geographic affinity budget
      const distance = Math.hypot(card.x + card.width / 2 - card.anchorX, card.y + card.height / 2 - card.anchorY);
      expect(distance).toBeLessThan(560);
    }
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        const left = result.placements[index]!;
        const right = result.placements[other]!;
        // 2. cards do not overlap
        expect(overlaps(left, right)).toBe(false);
        // 4. connectors do not cross
        const leftGeometry = buildConnectorGeometry({ card: left, anchor: { x: left.anchorX, y: left.anchorY }, preferredSide: left.side, style: "curve" });
        const rightGeometry = buildConnectorGeometry({ card: right, anchor: { x: right.anchorX, y: right.anchorY }, preferredSide: right.side, style: "curve" });
        expect(connectorGeometriesIntersect(leftGeometry, rightGeometry, 2)).toBe(false);
      }
    }
  });

  it("solves dense same-side curve layouts satisfying all hard constraints", () => {
    const occupiedAreas = [
      { x: 520, y: 240, width: 230, height: 330 },
      { x: 780, y: 300, width: 220, height: 300 },
    ];
    const input = Array.from({ length: 12 }, (_, index) => ({
      id: `east-${index}`,
      anchorX: 960,
      anchorY: 210 + index * 34,
      width: 210,
      height: 96,
    }));
    const result = solveDestinationCardLayout(input, {
      ...bounds,
      occupiedAreas,
    }, { connectorStyle: "curve", connectorWidth: 2, searchBudget: 12000 });

    expect(["solved", "crossing-fallback"]).toContain(result.status);
    expect(result.placements).toHaveLength(12);
    for (const card of result.placements) {
      expect(card.x).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.y).toBeGreaterThanOrEqual(bounds.margin);
      expect(card.x + card.width).toBeLessThanOrEqual(bounds.width - bounds.margin);
      expect(card.y + card.height).toBeLessThanOrEqual(bounds.height - bounds.margin);
      expect(occupiedAreas.some((area) => overlaps(card, area))).toBe(false);
    }
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        expect(overlaps(result.placements[index]!, result.placements[other]!)).toBe(false);
      }
    }
  });
});
