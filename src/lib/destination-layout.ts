/**
 * @deprecated This module is kept only for backward-compatible imports.
 * The card auto-layout implementation now lives in {@link ./card-layout},
 * which provides the same public API plus selectable layout modes and
 * content-bounds-aware packing. Import from `./card-layout` directly.
 *
 * The legacy `solve`/`layout` wrappers below map the new status vocabulary
 * (`solved` | `fallback`) back to the legacy one
 * (`solved` | `crossing-fallback` | `search-budget-exhausted`) and accept the
 * old `connectorStyle` / `connectorWidth` / `searchBudget` option fields.
 */
import {
  clampCardPosition,
  layoutCards,
  solveCardLayout,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardLayoutOptions,
  type CardLayoutResult,
  type CardLayoutStatus,
  type CardPlacement,
  type CardSide,
} from "./card-layout";

export type DestinationCardInput = CardLayoutInput;
export type DestinationCardArea = CardArea;
export type DestinationCardBounds = CardLayoutBounds;
export type DestinationCardSide = CardSide;
export type DestinationCardPlacement = CardPlacement;
export type DestinationLayoutStatus = "solved" | "crossing-fallback" | "search-budget-exhausted";
export type DestinationLayoutOptions = CardLayoutOptions;
export type DestinationLayoutResult = CardLayoutResult & { status: DestinationLayoutStatus };

function legacyStatus(status: CardLayoutStatus): DestinationLayoutStatus {
  return status === "solved" ? "solved" : "crossing-fallback";
}

export function solveDestinationCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): DestinationLayoutResult {
  const result = solveCardLayout(cards, bounds, { ...options, mode: options.mode ?? "quadrant" });
  return { status: legacyStatus(result.status), placements: result.placements, mode: result.mode } as DestinationLayoutResult;
}

export function layoutDestinationCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): CardPlacement[] {
  return layoutCards(cards, bounds, { ...options, mode: (options.mode as CardLayoutMode | undefined) ?? "quadrant" });
}

export function clampDestinationCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  return clampCardPosition(position, bounds);
}
