/**
 * Public value types shared by every card-layout module.
 *
 * The facade (`card-layout.ts`), the geometry helpers, the placement
 * strategies and the worker protocol all import from here, so this module only
 * ever depends on the leaf `connector-geometry` module.
 */
import type { ConnectorStyle } from "./connector-geometry";

export type CardSide = "left" | "right" | "top" | "bottom";
export type CardLayoutMode = "quadrant" | "radial" | "right-stack" | "grid";

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
  /** Projected province geometry used for pixel-accurate vector-map avoidance. */
  occupiedPolygons?: CardPolygon[];
  /** Allow cards to overlap map geometry while preserving other occupied areas. */
  allowMapOverlap?: boolean;
}

export interface CardPlacement extends CardLayoutInput {
  x: number;
  y: number;
  side: CardSide;
}

export type CardLayoutStatus = "solved" | "fallback";

export interface CardLayoutOptions {
  mode?: CardLayoutMode;
  /**
   * Cards the user has already placed by hand, keyed by card id.
   *
   * They keep the given coordinates and become obstacles the rest of the layout
   * has to pack around, so a later solve cannot drop a card onto one.
   * `createCardLayoutCacheKey` includes this field so a drag invalidates the
   * previous auto-layout cache entry.
   */
  fixedPositions?: Readonly<Record<string, CardPoint>>;
  /** Optimize the left/right split line to equalize column heights (quadrant only). */
  autoBalance?: boolean;
  /** Override the vertical band that routes cards to top/bottom instead of left/right. */
  topBottomBandRatio?: number;
  /** Connector geometry used by both layout scoring and the renderer. */
  connectorStyle?: ConnectorStyle;
  /** Clearance used while comparing connector geometry. */
  connectorWidth?: number;
  /** @deprecated no backtracking budget anymore; accepted for back-compat. */
  searchBudget?: number;
}

export interface CardLayoutResult {
  status: CardLayoutStatus;
  placements: CardPlacement[];
  mode: CardLayoutMode;
}

export const EPSILON = 1e-7;
export const MIN_GAP = 4;

/** Cyclic side order; neighbouring entries are adjacent sides of the map. */
export const SIDE_ORDER: CardSide[] = ["top", "right", "bottom", "left"];
