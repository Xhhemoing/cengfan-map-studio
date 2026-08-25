/**
 * Shared vocabulary for the card auto-layout modules.
 *
 * Every `card-layout-*` implementation module depends on this one, so it holds
 * the public types plus the handful of scalar primitives (`clamp`, `overlaps`,
 * `centerOf`) that all of them need. Keeping those here rather than in
 * `card-layout-collision.ts` is what keeps the module graph acyclic.
 */

import type { ConnectorStyle } from "./connector-geometry";

export type CardSide = "left" | "right" | "top" | "bottom";
export type CardLayoutMode =
  | "proximity"
  | "columns"
  | "quadrant"
  | "radial"
  | "right-stack"
  | "grid";

export interface CardLayoutInput {
  id: string;
  /** Anchor in canvas pixels (projected province center). */
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

export interface CardArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardPoint {
  x: number;
  y: number;
}

/** One projected geographic polygon. The first ring is the shell; later rings are holes. */
export interface CardPolygon {
  rings: CardPoint[][];
  bounds?: CardArea;
}

export interface CardLayoutBounds {
  width: number;
  height: number;
  /** Actual geographic content rect in canvas pixels (province union or image alignment). */
  map: CardArea;
  margin: number;
  gap: number;
  /** Protected canvas areas. Falls back to the map frame when absent. */
  occupiedAreas?: CardArea[];
  /**
   * Non-map obstacles (guest panels, text blocks, decoration assets). Kept apart
   * from {@link occupiedAreas} so the two overlap switches stay independent:
   * these are the only areas `allowElementOverlap` relaxes.
   */
  elementAreas?: CardArea[];
  /** Projected province geometry used for pixel-accurate vector-map avoidance. */
  occupiedPolygons?: CardPolygon[];
  /** Allow cards to overlap map geometry while preserving other occupied areas. */
  allowMapOverlap?: boolean;
  /** Allow cards to overlap {@link elementAreas} while preserving map avoidance. */
  allowElementOverlap?: boolean;
}

export interface CardPlacement extends CardLayoutInput {
  x: number;
  y: number;
  side: CardSide;
}

export type CardLayoutStatus = "solved" | "fallback";

export interface CardLayoutOptions {
  mode?: CardLayoutMode;
  /** Optimize the left/right split line to equalize column heights (quadrant only). */
  autoBalance?: boolean;
  /** Override the vertical band that routes cards to top/bottom instead of left/right. */
  topBottomBandRatio?: number;
  /** Connector geometry used by both layout scoring and the renderer. */
  connectorStyle?: ConnectorStyle;
  /** Clearance used while comparing connector geometry. */
  connectorWidth?: number;
  /**
   * Treat two connectors crossing mid-span as a hard failure. Defaults to true;
   * enforcement needs a {@link connectorStyle} to build the geometry from.
   */
  forbidConnectorCrossing?: boolean;
  /** @deprecated no backtracking budget anymore; accepted for back-compat. */
  searchBudget?: number;
}

export interface CardLayoutResult {
  status: CardLayoutStatus;
  placements: CardPlacement[];
  mode: CardLayoutMode;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EPSILON = 1e-7;
export const MIN_GAP = 4;

export const SIDE_ORDER: CardSide[] = ["top", "right", "bottom", "left"];

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function overlaps(a: CardArea, b: CardArea, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

export function centerOf(area: CardArea): { x: number; y: number } {
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}
