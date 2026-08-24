import type {
  CardArea,
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutOptions,
  CardLayoutResult,
} from "./card-layout";

export interface CardLayoutWorkerRequest {
  key: string;
  cards: CardLayoutInput[];
  bounds: CardLayoutBounds;
  options: CardLayoutOptions;
}

export interface CardLayoutWorkerMessage extends CardLayoutWorkerRequest {
  type: "solve";
  requestId: number;
}

export interface CardLayoutWorkerResult {
  type: "result";
  requestId: number;
  key: string;
  result: CardLayoutResult;
}

/**
 * Sent instead of a result when the worker cannot honour a request. The main
 * thread falls back to solving synchronously, so a bad message degrades into a
 * slower frame rather than an uncaught worker error.
 */
export interface CardLayoutWorkerFailure {
  type: "error";
  requestId: number;
  key: string;
  reason: string;
}

export type CardLayoutWorkerResponse = CardLayoutWorkerResult | CardLayoutWorkerFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArea(value: unknown): value is CardArea {
  return isRecord(value)
    && typeof value.x === "number"
    && typeof value.y === "number"
    && typeof value.width === "number"
    && typeof value.height === "number";
}

function isCard(value: unknown): value is CardLayoutInput {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.anchorX === "number"
    && typeof value.anchorY === "number"
    && typeof value.width === "number"
    && typeof value.height === "number";
}

function isBounds(value: unknown): value is CardLayoutBounds {
  return isRecord(value)
    && typeof value.width === "number"
    && typeof value.height === "number"
    && typeof value.margin === "number"
    && typeof value.gap === "number"
    && isArea(value.map)
    && (value.occupiedAreas === undefined || (Array.isArray(value.occupiedAreas) && value.occupiedAreas.every(isArea)))
    && (value.occupiedPolygons === undefined || Array.isArray(value.occupiedPolygons));
}

/**
 * Structural guard for messages arriving at the worker. Anything that fails
 * here is rejected before it can reach the solver, so a stray `postMessage`
 * from another script cannot crash the layout worker.
 */
export function isCardLayoutWorkerMessage(value: unknown): value is CardLayoutWorkerMessage {
  return isRecord(value)
    && value.type === "solve"
    && typeof value.requestId === "number"
    && Number.isFinite(value.requestId)
    && typeof value.key === "string"
    && Array.isArray(value.cards)
    && value.cards.every(isCard)
    && isBounds(value.bounds)
    && (value.options === undefined || isRecord(value.options));
}

export function isCardLayoutWorkerResponse(value: unknown): value is CardLayoutWorkerResponse {
  if (!isRecord(value) || typeof value.requestId !== "number" || typeof value.key !== "string") return false;
  if (value.type === "result") return isRecord(value.result) && Array.isArray(value.result.placements);
  return value.type === "error" && typeof value.reason === "string";
}
