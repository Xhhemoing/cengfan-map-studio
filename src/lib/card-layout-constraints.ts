import { solveCardLayout, validateCardLayout, type CardLayoutBounds, type CardLayoutInput, type CardLayoutOptions, type CardPlacement } from "./card-layout";
import type { LayoutHealthIssue } from "./layout-health";
import { placementSide } from "./resolved-scene-geometry";
import type { CardPositions } from "./scene-layout-request";

export type ConstrainedLayoutStatus = "feasible" | "proven-infeasible" | "no-candidate-found";
export interface CardLayoutConstraints {
  previousPositions?: CardPositions;
  lockedIds?: readonly string[];
  /** Every object outside this explicit scope is immovable. */
  scopeIds?: readonly string[];
  preservePositions?: boolean;
}
export interface ConstrainedCardLayoutResult {
  status: ConstrainedLayoutStatus;
  placements: CardPlacement[];
  diagnostics: LayoutHealthIssue[];
  movedIds: string[];
}

function issue(id: string, detail: string): LayoutHealthIssue {
  return { id, kind: "layout-unresolved", severity: "warning", detail };
}

function previousPlacement(card: CardLayoutInput, position: { x: number; y: number }, bounds: CardLayoutBounds): CardPlacement {
  const box = { ...card, ...position };
  return { ...box, side: placementSide(box, bounds.map) };
}

/** Deterministic local repair. Exhausting the existing heuristic is never a proof of no solution. */
export function solveConstrainedCardLayout(
  cards: CardLayoutInput[], bounds: CardLayoutBounds, options: CardLayoutOptions = {}, constraints: CardLayoutConstraints = {},
): ConstrainedCardLayoutResult {
  const previous = constraints.previousPositions ?? {};
  const locked = new Set(constraints.lockedIds ?? []);
  const scope = constraints.scopeIds ? new Set(constraints.scopeIds) : null;
  const fixedIds = new Set(cards.filter((card) => locked.has(card.id) || (scope && !scope.has(card.id))).map((card) => card.id));
  const fixed = cards.filter((card) => fixedIds.has(card.id) && previous[card.id]).map((card) => previousPlacement(card, previous[card.id]!, bounds));
  const complete = (status: ConstrainedLayoutStatus, placements: CardPlacement[], diagnostics: LayoutHealthIssue[] = []): ConstrainedCardLayoutResult => ({
    status, placements, diagnostics,
    movedIds: placements.filter((placement) => {
      const position = previous[placement.id];
      return !position || Math.hypot(position.x - placement.x, position.y - placement.y) > 0.001;
    }).map((placement) => placement.id),
  });
  if (fixed.length !== fixedIds.size) return complete("no-candidate-found", fixed, [issue("missing-fixed-position", "部分范围外或锁定展示框尚无已解析位置，请等待画布完成排布后重试")]);
  const tooLarge = cards.find((card) => card.width > bounds.width - bounds.margin * 2 || card.height > bounds.height - bounds.margin * 2);
  if (tooLarge) return complete("proven-infeasible", fixed, [issue(tooLarge.id, "展示框尺寸超过画布可用空间，请增宽画布、允许换行或使用续框")]);
  const availableArea = Math.max(0, bounds.width - bounds.margin * 2) * Math.max(0, bounds.height - bounds.margin * 2);
  if (cards.reduce((area, card) => area + card.width * card.height, 0) > availableArea + 0.000001) {
    return complete("proven-infeasible", fixed, [issue("insufficient-area", "展示框总面积超过画布可用面积，请扩大画布或分成多页")]);
  }
  if (!validateCardLayout(fixed, bounds)) return complete("proven-infeasible", fixed, [issue("fixed-conflict", "锁定或范围外展示框与当前边界、保护区或彼此冲突；需要明确调整约束")]);
  const movable = cards.filter((card) => !fixedIds.has(card.id));
  const keep: CardPlacement[] = [];
  if (constraints.preservePositions !== false) {
    for (const card of movable) {
      const position = previous[card.id];
      if (!position) continue;
      const placement = previousPlacement(card, position, bounds);
      if (validateCardLayout([...fixed, ...keep, placement], bounds)) keep.push(placement);
    }
  }
  const attempt = (preserved: CardPlacement[]) => {
    const fixedPositions = [...fixed, ...preserved];
    const preservedIds = new Set(fixedPositions.map((card) => card.id));
    const inputs = cards.filter((card) => !preservedIds.has(card.id));
    if (inputs.length === 0) return fixedPositions;
    const obstacles = bounds.occupiedAreas ?? (bounds.occupiedPolygons?.length || bounds.allowMapOverlap ? [] : [bounds.map]);
    const result = solveCardLayout(inputs, { ...bounds, occupiedAreas: [...obstacles, ...fixedPositions] }, options);
    return [...fixedPositions, ...result.placements];
  };
  let placements = attempt(keep);
  if (!validateCardLayout(placements, bounds) && keep.length > 0) placements = attempt([]);
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  const ordered = cards.flatMap((card) => byId.has(card.id) ? [byId.get(card.id)!] : []);
  return ordered.length === cards.length && validateCardLayout(ordered, bounds)
    ? complete("feasible", ordered)
    : complete("no-candidate-found", ordered, [issue("search-exhausted", "当前搜索未找到满足约束的方案；这不代表不存在可行排布，可尝试其他版式或调整范围")]);
}
