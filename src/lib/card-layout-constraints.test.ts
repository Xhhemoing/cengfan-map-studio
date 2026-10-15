import { describe, expect, it } from "vitest";
import { solveConstrainedCardLayout } from "./card-layout-constraints";
import { validateCardLayout, type CardLayoutBounds, type CardLayoutInput } from "./card-layout";

const bounds: CardLayoutBounds = { width: 800, height: 600, margin: 20, gap: 10, map: { x: 320, y: 200, width: 160, height: 200 }, occupiedAreas: [] };
const cards: CardLayoutInput[] = [
  { id: "fixed", anchorX: 380, anchorY: 250, width: 120, height: 80 },
  { id: "edited", anchorX: 400, anchorY: 300, width: 120, height: 80 },
  { id: "unchanged", anchorX: 420, anchorY: 350, width: 120, height: 80 },
];
const previousPositions = { fixed: { x: 30, y: 30 }, edited: { x: 200, y: 30 }, unchanged: { x: 400, y: 30 } };

describe("constrained card layout", () => {
  it("keeps a feasible previous layout byte stable", () => {
    const result = solveConstrainedCardLayout(cards, bounds, {}, { previousPositions });
    expect(result.status).toBe("feasible");
    expect(result.movedIds).toEqual([]);
    expect(Object.fromEntries(result.placements.map(({ id, x, y }) => [id, { x, y }]))).toEqual(previousPositions);
  });

  it("repairs only an explicit scope and respects a lock within that scope", () => {
    const input = cards.map((card) => card.id === "edited" ? { ...card, width: 250 } : card);
    const result = solveConstrainedCardLayout(input, bounds, {}, { previousPositions, lockedIds: ["fixed"], scopeIds: ["fixed", "edited"] });
    expect(result.status).toBe("feasible");
    expect(result.placements.find((card) => card.id === "fixed")).toMatchObject(previousPositions.fixed);
    expect(result.placements.find((card) => card.id === "unchanged")).toMatchObject(previousPositions.unchanged);
    expect(result.movedIds).toEqual(["edited"]);
    expect(validateCardLayout(result.placements, bounds)).toBe(true);
  });

  it("proves oversized content and conflicting fixed positions impossible without unlocking them", () => {
    expect(solveConstrainedCardLayout([{ ...cards[0]!, height: 1000 }], bounds).status).toBe("proven-infeasible");
    const result = solveConstrainedCardLayout(cards, bounds, {}, { previousPositions: { ...previousPositions, edited: previousPositions.fixed }, lockedIds: ["fixed", "edited"] });
    expect(result.status).toBe("proven-infeasible");
    expect(result.diagnostics[0]?.id).toBe("fixed-conflict");
  });

  it("does not turn a search failure into a mathematical impossibility claim", () => {
    const result = solveConstrainedCardLayout(cards, { ...bounds, occupiedAreas: [{ x: 0, y: 0, width: bounds.width, height: bounds.height }] });
    expect(result.status).toBe("no-candidate-found");
    expect(result.diagnostics[0]?.detail).toContain("不代表不存在");
  });
});
