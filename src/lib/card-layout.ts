/**
 * Card auto-layout for the 蹭饭图 poster — public entry point.
 *
 * A compact, deterministic replacement for the previous OPRL backtracking
 * solver. Inspired by uni.utities.online/map-creator's four-quadrant isotonic
 * packing, extended with our province-AABB obstacle avoidance and six
 * selectable layout modes.
 *
 * Hard constraints (every mode, every result):
 *   1. Every card stays inside the canvas margin.
 *   2. Cards never overlap (with `gap`).
 *   3. Cards never overlap protected `occupiedAreas`; map overlap is opt-in.
 *   4. The solver never throws; saturation degrades to a contained grid.
 *
 * Soft goals: keep each card near its geographic anchor; deterministic output.
 *
 * This file is the façade: types, mode dispatch, attempt ranking and the
 * manual-drag clamp. The layout algorithms themselves live in the sibling
 * `card-layout-*` modules:
 *   - `card-layout-polygons`  province geometry preprocessing and hit tests
 *   - `card-layout-collision` obstacle sets, containment repair, validation
 *   - `card-layout-connectors` connector predicates and scoring primitives
 *   - `card-layout-pack`      isotonic side packing (quadrant/radial/columns/…)
 *   - `card-layout-fallback`  grid mode and the whole-board repack
 *   - `card-layout-candidates`/`card-layout-optimize` the optimizing solver
 *   - `card-layout-proximity` proximity mode
 *   - `card-layout-uncross`   connector crossing repair
 */

import {
  clamp,
  overlaps,
  EPSILON,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardLayoutOptions,
  type CardLayoutResult,
  type CardLayoutStatus,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";
import { polygonBounds, rectangleIntersectsPolygon } from "./card-layout-polygons";
import {
  elementZones,
  orderResult,
  protectedZones,
  validateGeometry,
} from "./card-layout-collision";
import {
  connectorClearance,
  countConnectorCrossings,
  crossingsEnforced,
} from "./card-layout-connectors";
import { sidePackLayout } from "./card-layout-pack";
import { layoutGrid, repackAll } from "./card-layout-fallback";
import { MAX_OPTIMIZED_CARDS } from "./card-layout-candidates";
import { optimizedLayout } from "./card-layout-optimize";
import { layoutProximity } from "./card-layout-proximity";
import { repairConnectorCrossings } from "./card-layout-uncross";

export type {
  CardArea,
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutMode,
  CardLayoutOptions,
  CardLayoutResult,
  CardLayoutStatus,
  CardPlacement,
  CardPoint,
  CardPolygon,
  CardSide,
  Rect,
} from "./card-layout-types";

export { repairConnectorCrossings } from "./card-layout-uncross";

interface HardCheck {
  /** Geometry and, when enforced, the no-crossing rule are both satisfied. */
  feasible: boolean;
  /** Crossing count, or `Infinity` when the geometry itself already failed. */
  crossings: number;
}

/**
 * Full hard-constraint check. Crossings are reported alongside the verdict so a
 * caller with no crossing-free layout can still rank its options by them.
 */
function validateHard(
  placements: CardPlacement[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): HardCheck {
  if (!validateGeometry(placements, bounds)) return { feasible: false, crossings: Infinity };
  if (!crossingsEnforced(options)) return { feasible: true, crossings: 0 };
  const crossings = countConnectorCrossings(
    placements,
    options.connectorStyle!,
    connectorClearance(options),
  );
  return { feasible: crossings === 0, crossings };
}

interface LayoutAttempt {
  produce: () => CardPlacement[] | null;
  /**
   * Mode-independent saturation recovery. It repacks the whole board from
   * scratch, so it discards the mode's visual identity and is only consulted
   * when the mode's own attempts cannot produce a valid board at all.
   */
  recovery?: boolean;
}

/**
 * Run the attempts the mode offers and ship the best one.
 *
 * A crossing-free, geometrically valid layout wins immediately (`solved`). When
 * none is crossing-free the attempts are ranked by crossing count and the
 * lowest ships as `fallback`, so a later attempt that untangles two connectors
 * is never discarded just because an earlier one was already contained.
 */
function chooseLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions,
  mode: CardLayoutMode,
  attempts: LayoutAttempt[],
): CardLayoutResult {
  let firstProduced: CardPlacement[] | null = null;
  let best: CardPlacement[] | null = null;
  let bestCrossings = Infinity;
  for (const { produce, recovery } of attempts) {
    if (recovery && best) continue;
    const placements = produce();
    if (!placements || placements.length !== cards.length) continue;
    firstProduced ??= placements;
    const check = validateHard(placements, bounds, options);
    if (check.feasible) return { status: "solved", placements, mode };
    if (check.crossings < bestCrossings) {
      best = placements;
      bestCrossings = check.crossings;
    }
  }
  return { status: "fallback", placements: best ?? firstProduced ?? [], mode };
}

export function solveCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardLayoutResult {
  const mode: CardLayoutMode = options.mode ?? "quadrant";
  if (cards.length === 0) return { status: "solved", placements: [], mode };

  // Every attempt goes through the crossing repair before it is scored, so a
  // side-packed or grid board that only crosses because of its slot order gets
  // untangled instead of shipping as a fallback.
  const untangle = (produce: () => CardPlacement[] | null): LayoutAttempt => ({
    produce: () => {
      const placements = produce();
      return placements && repairConnectorCrossings(placements, bounds, options);
    },
  });
  const attempts: LayoutAttempt[] = [];
  if (mode === "grid") {
    attempts.push(untangle(() => orderResult(cards, layoutGrid(cards, bounds))));
  } else if (mode === "proximity") {
    attempts.push(untangle(() => layoutProximity(cards, bounds, options)));
  } else {
    if ((mode === "quadrant" || mode === "radial")
      && cards.length <= MAX_OPTIMIZED_CARDS
      && ((bounds.occupiedAreas?.length ?? 0) > 0
        || elementZones(bounds).length > 0
        || (bounds.occupiedPolygons?.length ?? 0) > 0)) {
      attempts.push(untangle(() => optimizedLayout(cards, bounds, mode, options)));
    }
    attempts.push(untangle(() => sidePackLayout(cards, bounds, mode, options)));
  }
  attempts.push({ ...untangle(() => repackAll(cards, bounds)), recovery: true });

  return chooseLayout(cards, bounds, options, mode, attempts);
}

export function layoutCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardPlacement[] {
  return solveCardLayout(cards, bounds, options).placements;
}

/**
 * Clamp a manually dragged card position so it stays inside the canvas margin
 * and outside protected areas. Only actual occupied geography is blocked;
 * map-frame whitespace is coverable unless `bounds.map` is the sole fallback.
 */
export function clampCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  const blockers = [
    ...(bounds.allowMapOverlap ? (bounds.occupiedAreas ?? []) : protectedZones(bounds)),
    ...elementZones(bounds),
  ];
  const polygons = bounds.allowMapOverlap ? [] : (bounds.occupiedPolygons ?? []);
  const minX = bounds.margin;
  const minY = bounds.margin;
  const maxX = bounds.width - bounds.margin - position.width;
  const maxY = bounds.height - bounds.margin - position.height;
  const origin = {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };
  const isFree = (x: number, y: number) => {
    const card = { x, y, width: position.width, height: position.height };
    return !blockers.some((blocker) => overlaps(card, blocker))
      && !polygons.some((polygon) => rectangleIntersectsPolygon(card, polygon, 0));
  };
  if (isFree(origin.x, origin.y)) return origin;

  const xCandidates = new Set([origin.x, minX, maxX]);
  const yCandidates = new Set([origin.y, minY, maxY]);
  const addRectCandidates = (rect: CardArea) => {
    xCandidates.add(clamp(rect.x - position.width, minX, maxX));
    xCandidates.add(clamp(rect.x + rect.width, minX, maxX));
    yCandidates.add(clamp(rect.y - position.height, minY, maxY));
    yCandidates.add(clamp(rect.y + rect.height, minY, maxY));
  };
  for (const blocker of blockers) addRectCandidates(blocker);
  for (const polygon of polygons) {
    const rect = polygonBounds(polygon);
    if (rect) addRectCandidates(rect);
  }

  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xCandidates) {
    for (const y of yCandidates) {
      if (!isFree(x, y)) continue;
      const distance = (x - origin.x) ** 2 + (y - origin.y) ** 2;
      if (distance < bestDistance - EPSILON
        || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best ?? origin;
}

/**
 * Drag-time local repair, re-exported so callers keep a single layout entry
 * point. Lives in its own module to keep this file from growing further.
 */
export { adaptCardLayout, type CardLayoutAdaptOptions } from "./card-layout-adapt";

// ----- Back-compat aliases (drop-in for the previous destination-layout API) -----

export interface DestinationCardInput extends CardLayoutInput {}
export interface DestinationCardArea extends CardArea {}
export interface DestinationCardBounds extends CardLayoutBounds {}
export type DestinationCardSide = CardSide;
export interface DestinationCardPlacement extends CardPlacement {}
/** Legacy status vocabulary (maps the new {@link CardLayoutStatus} back). */
export type DestinationLayoutStatus = "solved" | "crossing-fallback" | "search-budget-exhausted";
export interface DestinationLayoutResult {
  status: DestinationLayoutStatus;
  placements: CardPlacement[];
}
export interface DestinationLayoutOptions extends CardLayoutOptions {}

function legacyStatus(status: CardLayoutStatus): DestinationLayoutStatus {
  return status === "solved" ? "solved" : "crossing-fallback";
}

/** Previous solve signature, now delegating to {@link solveCardLayout}. */
export function solveDestinationCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): DestinationLayoutResult {
  const result = solveCardLayout(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
  return { status: legacyStatus(result.status), placements: result.placements };
}

export function layoutDestinationCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): CardPlacement[] {
  return layoutCards(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
}

export function clampDestinationCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  return clampCardPosition(position, bounds);
}
