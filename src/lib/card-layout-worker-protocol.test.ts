import { describe, expect, it } from "vitest";
import type { CardLayoutBounds, CardLayoutInput } from "./card-layout";
import {
  isCardLayoutWorkerMessage,
  isCardLayoutWorkerResponse,
  type CardLayoutWorkerMessage,
} from "./card-layout-worker-protocol";

const cards: CardLayoutInput[] = [{ id: "one", anchorX: 500, anchorY: 300, width: 180, height: 90 }];
const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 400, y: 120, width: 700, height: 650 },
  margin: 32,
  gap: 14,
};

const message: CardLayoutWorkerMessage = {
  type: "solve",
  requestId: 3,
  key: "key",
  cards,
  bounds,
  options: { mode: "quadrant" },
};

describe("card layout worker protocol", () => {
  it("accepts a well-formed solve message", () => {
    expect(isCardLayoutWorkerMessage(message)).toBe(true);
    expect(isCardLayoutWorkerMessage({ ...message, options: undefined })).toBe(true);
    expect(isCardLayoutWorkerMessage({
      ...message,
      bounds: { ...bounds, occupiedAreas: [{ x: 1, y: 2, width: 3, height: 4 }], occupiedPolygons: [] },
    })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["a string", "solve"],
    ["another message type", { ...message, type: "ping" }],
    ["a missing request id", { ...message, requestId: undefined }],
    ["a non-finite request id", { ...message, requestId: Number.NaN }],
    ["a non-string key", { ...message, key: 7 }],
    ["cards that are not an array", { ...message, cards: "many" }],
    ["a card without an id", { ...message, cards: [{ anchorX: 1, anchorY: 2, width: 3, height: 4 }] }],
    ["a card with a non-numeric anchor", { ...message, cards: [{ ...cards[0], anchorX: "left" }] }],
    ["bounds without a map", { ...message, bounds: { ...bounds, map: undefined } }],
    ["bounds with a malformed map", { ...message, bounds: { ...bounds, map: { x: 0, y: 0 } } }],
    ["occupied areas that are not rectangles", { ...message, bounds: { ...bounds, occupiedAreas: [{ x: 0 }] } }],
  ])("rejects %s", (_label, value) => {
    expect(isCardLayoutWorkerMessage(value)).toBe(false);
  });

  it("recognizes result and error responses and rejects anything else", () => {
    expect(isCardLayoutWorkerResponse({
      type: "result",
      requestId: 1,
      key: "k",
      result: { status: "solved", mode: "quadrant", placements: [] },
    })).toBe(true);
    expect(isCardLayoutWorkerResponse({ type: "error", requestId: 1, key: "k", reason: "boom" })).toBe(true);
    expect(isCardLayoutWorkerResponse({ type: "error", requestId: 1, key: "k" })).toBe(false);
    expect(isCardLayoutWorkerResponse({ type: "result", requestId: 1, key: "k", result: {} })).toBe(false);
    expect(isCardLayoutWorkerResponse({ type: "result", key: "k" })).toBe(false);
    expect(isCardLayoutWorkerResponse(undefined)).toBe(false);
  });
});
