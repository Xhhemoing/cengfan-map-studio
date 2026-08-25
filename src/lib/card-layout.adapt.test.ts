import { describe, expect, it } from "vitest";
import {
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardLayoutResult,
  type CardPlacement,
} from "./card-layout";
import { overlapsWithGap } from "./card-layout-test-fixtures";
import { CARD_LAYOUT_MODES } from "./scene-document";

const layout = await import("./card-layout");

type AdaptCardLayout = (
  placements: CardPlacement[],
  movedId: string,
  nextPosition: { x: number; y: number },
  bounds: CardLayoutBounds,
  options?: CardLayoutOptions,
) => CardPlacement[];

type CompatibleSolve = (
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options?: CardLayoutOptions & { mode?: string },
) => CardLayoutResult;

const adaptCardLayout = (layout as Record<string, unknown>).adaptCardLayout as AdaptCardLayout | undefined;
const hasAdaptCardLayout = typeof adaptCardLayout === "function";
const solveCardLayout = layout.solveCardLayout as unknown as CompatibleSolve;

const adaptBounds: CardLayoutBounds = {
  width: 900,
  height: 620,
  map: { x: 260, y: 120, width: 280, height: 360 },
  margin: 20,
  gap: 8,
};

const determinismCards: CardLayoutInput[] = [
  { id: "north", anchorX: 450, anchorY: 145, width: 150, height: 72 },
  { id: "south", anchorX: 450, anchorY: 475, width: 150, height: 72 },
  { id: "west", anchorX: 300, anchorY: 300, width: 150, height: 72 },
  { id: "east", anchorX: 600, anchorY: 300, width: 150, height: 72 },
];
const determinismBounds: CardLayoutBounds = {
  ...adaptBounds,
  allowMapOverlap: true,
};

function solverSupportsMode(mode: "proximity" | "columns"): boolean {
  if (!(CARD_LAYOUT_MODES as readonly string[]).includes(mode)) return false;
  const requested = solveCardLayout(determinismCards, determinismBounds, { mode });
  const quadrant = solveCardLayout(determinismCards, determinismBounds, { mode: "quadrant" });
  return JSON.stringify(requested.placements) !== JSON.stringify(quadrant.placements);
}

function placement(
  id: string,
  x: number,
  y: number,
  side: CardPlacement["side"] = "right",
): CardPlacement {
  return {
    id,
    anchorX: 450,
    anchorY: y + 35,
    width: 120,
    height: 70,
    x,
    y,
    side,
  };
}

describe("adaptCardLayout drag boundaries", () => {
  it.skipIf(!hasAdaptCardLayout)(
    "keeps the moved card at its clamped target and pushes an overlapping neighbour away",
    () => {
      const initial = [
        placement("moved", 600, 80),
        placement("neighbour", 600, 210),
        placement("far", 600, 430),
      ];
      const target = { x: 600, y: 190 };
      const expectedMoved = layout.clampCardPosition({
        ...initial[0]!,
        ...target,
      }, adaptBounds);
      const result = adaptCardLayout!(initial, "moved", target, adaptBounds);
      const moved = result.find((card) => card.id === "moved")!;
      const neighbour = result.find((card) => card.id === "neighbour")!;

      expect(result).toHaveLength(initial.length);
      expect({ x: moved.x, y: moved.y }).toEqual(expectedMoved);
      expect({ x: neighbour.x, y: neighbour.y }).not.toEqual({
        x: initial[1]!.x,
        y: initial[1]!.y,
      });
      expect(overlapsWithGap(moved, neighbour, adaptBounds.gap)).toBe(false);
    },
  );

  it.skipIf(!hasAdaptCardLayout)("clamps an off-canvas drag target", () => {
    const initial = [placement("moved", 600, 80)];
    const target = { x: -500, y: 9_999 };
    const expected = layout.clampCardPosition({
      ...initial[0]!,
      ...target,
    }, adaptBounds);
    const result = adaptCardLayout!(initial, "moved", target, adaptBounds);

    expect(result).toHaveLength(1);
    expect({ x: result[0]!.x, y: result[0]!.y }).toEqual(expected);
    expect(expected).toEqual({
      x: adaptBounds.margin,
      y: adaptBounds.height - adaptBounds.margin - initial[0]!.height,
    });
  });
});

describe("card layout saturation and new-mode determinism", () => {
  it("returns every card without throwing on a saturated small canvas", () => {
    const cards: CardLayoutInput[] = Array.from({ length: 48 }, (_, index) => ({
      id: `saturated-${index}`,
      anchorX: 180 + (index % 6) * 28,
      anchorY: 110 + Math.floor(index / 6) * 20,
      width: 105,
      height: 52,
    }));
    const bounds: CardLayoutBounds = {
      width: 520,
      height: 360,
      map: { x: 170, y: 100, width: 180, height: 140 },
      margin: 12,
      gap: 6,
      allowMapOverlap: true,
    };
    let result: CardLayoutResult | undefined;

    expect(() => {
      result = solveCardLayout(cards, bounds, { mode: "grid" });
    }).not.toThrow();
    expect(result!.placements).toHaveLength(cards.length);
  });

  describe.each(["proximity", "columns"] as const)("%s mode", (mode) => {
    const hasMode = solverSupportsMode(mode);

    it.skipIf(!hasMode)("is deterministic for repeated solves of identical inputs", () => {
      const first = solveCardLayout(determinismCards, determinismBounds, {
        mode,
        connectorStyle: "straight",
      });
      const second = solveCardLayout(determinismCards, determinismBounds, {
        mode,
        connectorStyle: "straight",
      });

      expect(second).toEqual(first);
    });
  });
});
