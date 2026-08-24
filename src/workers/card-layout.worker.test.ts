import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardLayoutWorkerMessage, CardLayoutWorkerResponse } from "../lib/card-layout-worker-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: CardLayoutWorkerResponse) => void;
}

const scope = globalThis as unknown as WorkerScope;
const originalPostMessage = scope.postMessage;
const originalOnMessage = scope.onmessage;
let posted: CardLayoutWorkerResponse[] = [];

const message: CardLayoutWorkerMessage = {
  type: "solve",
  requestId: 11,
  key: "cache-key",
  cards: [{ id: "one", anchorX: 500, anchorY: 300, width: 180, height: 90 }],
  bounds: {
    width: 1200,
    height: 900,
    map: { x: 300, y: 150, width: 600, height: 500 },
    margin: 24,
    gap: 12,
  },
  options: { mode: "quadrant" },
};

async function loadWorker(): Promise<(event: MessageEvent<unknown>) => void> {
  vi.resetModules();
  await import("./card-layout.worker");
  const handler = scope.onmessage;
  if (!handler) throw new Error("worker did not register a message handler");
  return handler;
}

describe("card layout worker", () => {
  beforeEach(() => {
    posted = [];
    scope.postMessage = (response) => {
      posted.push(response);
    };
  });

  afterEach(() => {
    vi.doUnmock("../lib/card-layout");
    scope.postMessage = originalPostMessage;
    scope.onmessage = originalOnMessage;
  });

  it("answers a valid request with the solved layout", async () => {
    const handler = await loadWorker();
    handler({ data: message } as MessageEvent<unknown>);

    expect(posted).toHaveLength(1);
    const response = posted[0]!;
    expect(response.type).toBe("result");
    expect(response.requestId).toBe(message.requestId);
    expect(response.key).toBe(message.key);
    if (response.type !== "result") throw new Error("expected a result response");
    expect(response.result.placements.map((placement) => placement.id)).toEqual(["one"]);
  });

  it("ignores messages that are not valid solve requests", async () => {
    const handler = await loadWorker();
    for (const data of [
      undefined,
      null,
      "solve",
      { type: "ping" },
      { ...message, cards: "all" },
      { ...message, bounds: { ...message.bounds, map: null } },
    ]) {
      expect(() => handler({ data } as MessageEvent<unknown>)).not.toThrow();
    }
    expect(() => handler(undefined as unknown as MessageEvent<unknown>)).not.toThrow();
    expect(posted).toHaveLength(0);
  });

  it("reports a failed solve as an error response instead of throwing", async () => {
    vi.doMock("../lib/card-layout", () => ({
      solveCardLayout: () => {
        throw new Error("solver exploded");
      },
    }));
    const handler = await loadWorker();

    expect(() => handler({ data: message } as MessageEvent<unknown>)).not.toThrow();
    expect(posted).toHaveLength(1);
    const response = posted[0]!;
    expect(response.type).toBe("error");
    if (response.type !== "error") throw new Error("expected an error response");
    expect(response.reason).toBe("solver exploded");
    expect(response.requestId).toBe(message.requestId);
    expect(response.key).toBe(message.key);
  });
});
