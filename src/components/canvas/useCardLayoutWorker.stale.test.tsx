import { useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardLayoutBounds, CardLayoutInput, CardLayoutOptions, CardLayoutResult } from "../../lib/card-layout";
import { cardLayoutCache, createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerResponse } from "../../lib/card-layout-worker-protocol";
import { useCardLayoutWorker, type CardLayoutWorkerRequest } from "./useCardLayoutWorker";

class SlowWorker {
  static instances: SlowWorker[] = [];

  onmessage: ((event: MessageEvent<CardLayoutWorkerResponse>) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly messages: unknown[] = [];

  terminated = false;

  constructor() {
    SlowWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: CardLayoutWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<CardLayoutWorkerResponse>);
  }
}

const globalWithWorker = globalThis as unknown as { Worker?: unknown };
const originalWorker = globalWithWorker.Worker;
const cards: CardLayoutInput[] = [{ id: "card", anchorX: 500, anchorY: 300, width: 180, height: 90 }];
const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 400, y: 120, width: 700, height: 650 },
  margin: 32,
  gap: 14,
};
const options: CardLayoutOptions = { mode: "grid" };

function makeRequest(suffix: string): CardLayoutWorkerRequest {
  const requestCards = cards.map((card) => ({ ...card, id: `${card.id}-${suffix}` }));
  return {
    key: createCardLayoutCacheKey({ cards: requestCards, bounds, options }),
    cards: requestCards,
    bounds,
    options,
  };
}

function makeResult(request: CardLayoutWorkerRequest, x: number): CardLayoutResult {
  return {
    mode: request.options.mode ?? "quadrant",
    status: "solved",
    placements: [{ ...request.cards[0]!, x, y: 32, side: "right" }],
  };
}

let current: ReturnType<typeof useCardLayoutWorker> | null = null;
let renders: Array<{ key: string; result: CardLayoutResult | null; pending: boolean }> = [];

function Harness({ request }: { request: CardLayoutWorkerRequest }) {
  const value = useCardLayoutWorker(request);
  renders.push({ key: request.key, result: value.result, pending: value.pending });
  useEffect(() => {
    current = value;
  });
  return null;
}

describe("useCardLayoutWorker stale-while-revalidate", () => {
  beforeEach(() => {
    SlowWorker.instances = [];
    cardLayoutCache.clear();
    globalWithWorker.Worker = SlowWorker;
    current = null;
    renders = [];
  });

  afterEach(() => {
    globalWithWorker.Worker = originalWorker;
  });

  it("keeps the previous layout visible while a changed key waits for its slow worker result", () => {
    const first = makeRequest("first");
    const second = makeRequest("second");
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<Harness request={first} />));
    const worker = SlowWorker.instances[0]!;
    const firstMessage = worker.messages[0] as { requestId: number; key: string };
    const firstResult = makeResult(first, 100);

    flushSync(() => worker.emit({
      type: "result",
      requestId: firstMessage.requestId,
      key: firstMessage.key,
      result: firstResult,
    }));
    expect(current).toMatchObject({ result: firstResult, pending: false });

    flushSync(() => root.render(<Harness request={second} />));

    const secondKeyRenders = renders.filter((render) => render.key === second.key);
    expect(secondKeyRenders).not.toHaveLength(0);
    expect(secondKeyRenders.every((render) => render.result !== null)).toBe(true);
    for (const render of secondKeyRenders) expect(render.result).toEqual(firstResult);
    expect(current).toMatchObject({ result: firstResult, pending: true });

    const secondMessage = worker.messages[1] as { requestId: number; key: string };
    const secondResult = makeResult(second, 200);
    flushSync(() => worker.emit({
      type: "result",
      requestId: secondMessage.requestId,
      key: secondMessage.key,
      result: secondResult,
    }));
    expect(current).toMatchObject({ result: secondResult, pending: false });

    flushSync(() => root.unmount());
    expect(worker.terminated).toBe(true);
    container.remove();
  });
});
