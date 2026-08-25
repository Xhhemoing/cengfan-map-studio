import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardLayoutBounds, CardLayoutInput, CardLayoutOptions, CardLayoutResult } from "../../lib/card-layout";
import { cardLayoutCache, createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerResponse } from "../../lib/card-layout-worker-protocol";
import { useCardLayoutWorker, type CardLayoutWorkerRequest } from "./useCardLayoutWorker";

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<CardLayoutWorkerResponse>) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly messages: unknown[] = [];

  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
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
const cards: CardLayoutInput[] = [{ id: "one", anchorX: 500, anchorY: 300, width: 180, height: 90 }];
const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 400, y: 120, width: 700, height: 650 },
  margin: 32,
  gap: 14,
};
const options: CardLayoutOptions = { mode: "grid" };

function makeRequest(keySuffix: string): CardLayoutWorkerRequest {
  const requestCards = cards.map((card) => ({ ...card, id: `${card.id}-${keySuffix}` }));
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
let rendered: Array<{ key: string; result: CardLayoutResult | null }> = [];

function Harness({ request, forceSync = false }: { request: CardLayoutWorkerRequest; forceSync?: boolean }) {
  const value = useCardLayoutWorker(request, forceSync);
  rendered.push({ key: request.key, result: value.result });
  useEffect(() => {
    current = value;
  });
  return null;
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function trackedRoot() {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  return { container, root };
}

describe("useCardLayoutWorker", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    cardLayoutCache.clear();
    globalWithWorker.Worker = FakeWorker;
    current = null;
    rendered = [];
  });

  afterEach(() => {
    // An assertion throwing before an inline unmount would leave the hook mounted with
    // its worker never terminated, racing jsdom teardown for the rest of the run.
    flushSync(() => {
      for (const { root, container } of mounted.splice(0)) {
        root.unmount();
        container.remove();
      }
    });
    globalWithWorker.Worker = originalWorker;
  });

  it("posts the latest key and ignores stale worker responses", () => {
    const first = makeRequest("first");
    const second = makeRequest("second");
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={first} />));
    const worker = FakeWorker.instances[0]!;
    expect(worker.messages).toHaveLength(1);
    const firstMessage = worker.messages[0] as { requestId: number; generation: number; key: string };

    flushSync(() => root.render(<Harness request={second} />));
    expect(worker.messages).toHaveLength(1);

    flushSync(() => worker.emit({
      type: "result",
      requestId: firstMessage.requestId,
      generation: firstMessage.generation,
      key: firstMessage.key,
      result: makeResult(first, 100),
    }));
    expect(current?.result).toBeNull();
    expect(current?.pending).toBe(true);
    expect(worker.messages).toHaveLength(2);
    const secondMessage = worker.messages[1] as { requestId: number; generation: number; key: string };

    const secondResult = makeResult(second, 200);
    flushSync(() => worker.emit({
      type: "result",
      requestId: secondMessage.requestId,
      generation: secondMessage.generation,
      key: secondMessage.key,
      result: secondResult,
    }));
    expect(current?.result).toEqual(secondResult);
    expect(current?.pending).toBe(false);

    // Unmounting here is the assertion, not cleanup; the net unmounts again as a no-op.
    flushSync(() => root.unmount());
    expect(worker.terminated).toBe(true);
  });

  it("replaces queued requests so a ten-request burst posts at most two solves", () => {
    const requests = Array.from({ length: 10 }, (_, index) => makeRequest(`burst-${index}`));
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={requests[0]!} />));
    const worker = FakeWorker.instances[0]!;
    for (const request of requests.slice(1)) {
      flushSync(() => root.render(<Harness request={request} />));
    }

    expect(worker.messages).toHaveLength(1);
    const firstMessage = worker.messages[0] as { requestId: number; generation: number; key: string };
    flushSync(() => worker.emit({
      type: "result",
      requestId: firstMessage.requestId,
      generation: firstMessage.generation,
      key: firstMessage.key,
      result: makeResult(requests[0]!, 100),
    }));

    expect(current?.result).toBeNull();
    expect(current?.pending).toBe(true);
    expect(worker.messages).toHaveLength(2);
    const latestMessage = worker.messages[1] as { requestId: number; generation: number; key: string };
    expect(latestMessage.key).toBe(requests[9]!.key);
    expect(latestMessage.generation).toBeGreaterThan(firstMessage.generation);

    const latestResult = makeResult(requests[9]!, 200);
    flushSync(() => worker.emit({
      type: "result",
      requestId: latestMessage.requestId,
      generation: latestMessage.generation,
      key: latestMessage.key,
      result: latestResult,
    }));
    expect(current?.result).toEqual(latestResult);
    expect(current?.pending).toBe(false);
  });

  it("keeps serving the previous result while a new key is pending", () => {
    const first = makeRequest("stale-first");
    const second = makeRequest("stale-second");
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={first} />));
    const worker = FakeWorker.instances[0]!;
    const firstMessage = worker.messages[0] as { requestId: number; generation: number; key: string };
    const firstResult = makeResult(first, 100);
    flushSync(() => worker.emit({
      type: "result",
      requestId: firstMessage.requestId,
      generation: firstMessage.generation,
      key: firstMessage.key,
      result: firstResult,
    }));
    expect(current?.result).toEqual(firstResult);

    flushSync(() => root.render(<Harness request={second} />));

    const currentKeyRenders = rendered.filter((render) => render.key === second.key);
    expect(currentKeyRenders).not.toHaveLength(0);
    expect(currentKeyRenders.every((render) => render.result === firstResult)).toBe(true);
    expect(current?.result).toEqual(firstResult);
    expect(current?.pending).toBe(true);

    const secondMessage = worker.messages[1] as { requestId: number; generation: number; key: string };
    const secondResult = makeResult(second, 260);
    flushSync(() => worker.emit({
      type: "result",
      requestId: secondMessage.requestId,
      generation: secondMessage.generation,
      key: secondMessage.key,
      result: secondResult,
    }));
    expect(current?.result).toEqual(secondResult);
    expect(current?.pending).toBe(false);
  });

  it("keeps a cache miss pending until the worker responds but forceSync solves and caches immediately", () => {
    const pendingRequest = makeRequest("worker-pending");
    const syncRequest = makeRequest("force-sync");
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={pendingRequest} />));

    expect(current?.result).toBeNull();
    expect(current?.pending).toBe(true);
    expect(cardLayoutCache.get(pendingRequest.key)).toBeUndefined();
    expect(FakeWorker.instances[0]?.messages).toHaveLength(1);

    flushSync(() => root.render(<Harness request={syncRequest} forceSync />));

    expect(current?.result?.placements.map((placement) => placement.id)).toEqual([syncRequest.cards[0]!.id]);
    expect(current?.pending).toBe(false);
    expect(cardLayoutCache.get(syncRequest.key)).toEqual(current?.result);
  });

  it("replaces an errored worker before posting the next cache miss", () => {
    const first = makeRequest("error-first");
    const second = makeRequest("error-second");
    const third = makeRequest("error-third");
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={first} />));
    const worker = FakeWorker.instances[0]!;
    flushSync(() => root.render(<Harness request={second} />));

    flushSync(() => worker.onerror?.({} as ErrorEvent));

    expect(worker.terminated).toBe(true);
    expect(current?.result?.placements.map((placement) => placement.id)).toEqual([second.cards[0]!.id]);
    expect(current?.pending).toBe(false);
    expect(cardLayoutCache.get(second.key)).toEqual(current?.result);

    flushSync(() => root.render(<Harness request={third} />));

    const replacement = FakeWorker.instances[1]!;
    expect(FakeWorker.instances).toHaveLength(2);
    expect(replacement).not.toBe(worker);
    expect(replacement.messages).toHaveLength(1);
    expect((replacement.messages[0] as { key: string }).key).toBe(third.key);
    const fallbackResult = current?.result;
    expect(fallbackResult?.placements.map((placement) => placement.id)).toEqual([second.cards[0]!.id]);
    expect(current?.pending).toBe(true);

    const staleMessage = worker.messages[0] as { requestId: number; generation: number; key: string };
    flushSync(() => worker.emit({
      type: "result",
      requestId: staleMessage.requestId,
      generation: staleMessage.generation,
      key: staleMessage.key,
      result: makeResult(first, 180),
    }));
    expect(current?.result).toBe(fallbackResult);
    expect(current?.pending).toBe(true);
  });

  it("uses the cached result without posting a duplicate worker request", () => {
    const request = makeRequest("cached");
    const result = makeResult(request, 240);
    cardLayoutCache.set(request.key, result);
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={request} />));

    expect(current?.result).toEqual(result);
    expect(current?.pending).toBe(false);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("solves synchronously when Worker is unavailable", () => {
    globalWithWorker.Worker = undefined;
    const request = makeRequest("fallback");
    const { root } = trackedRoot();

    flushSync(() => root.render(<Harness request={request} />));

    expect(current?.result?.placements).toHaveLength(1);
    expect(current?.pending).toBe(false);
    expect(FakeWorker.instances).toHaveLength(0);
  });

});
