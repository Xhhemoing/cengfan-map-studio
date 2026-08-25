import { useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutOptions,
  CardLayoutResult,
} from "../../lib/card-layout";
import { cardLayoutCache, createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerResponse } from "../../lib/card-layout-worker-protocol";
import { useCardLayoutWorker, type CardLayoutWorkerRequest } from "./useCardLayoutWorker";

class PendingWorker {
  static instances: PendingWorker[] = [];

  onmessage: ((event: MessageEvent<CardLayoutWorkerResponse>) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly messages: unknown[] = [];

  constructor() {
    PendingWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {}

  emit(message: CardLayoutWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<CardLayoutWorkerResponse>);
  }
}

const globalWithWorker = globalThis as unknown as { Worker?: unknown };
const originalWorker = globalWithWorker.Worker;
const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 400, y: 120, width: 700, height: 650 },
  margin: 32,
  gap: 14,
};
const options: CardLayoutOptions = { mode: "grid" };
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function makeRequest(cards: CardLayoutInput[]): CardLayoutWorkerRequest {
  return {
    key: createCardLayoutCacheKey({ cards, bounds, options }),
    cards,
    bounds,
    options,
  };
}

function makeResult(request: CardLayoutWorkerRequest): CardLayoutResult {
  return {
    mode: "grid",
    status: "solved",
    placements: request.cards.map((card, index) => ({
      ...card,
      x: 32 + index * 200,
      y: 32,
      side: "right",
    })),
  };
}

let current: ReturnType<typeof useCardLayoutWorker> | null = null;

function Harness({ request }: { request: CardLayoutWorkerRequest }) {
  const value = useCardLayoutWorker(request);
  useEffect(() => {
    current = value;
  });
  return null;
}

describe("useCardLayoutWorker Round 3 SWR boundary", () => {
  beforeEach(() => {
    PendingWorker.instances = [];
    cardLayoutCache.clear();
    globalWithWorker.Worker = PendingWorker;
    current = null;
  });

  afterEach(() => {
    mounted.splice(0).forEach(({ root, container }) => {
      flushSync(() => root.unmount());
      container.remove();
    });
    globalWithWorker.Worker = originalWorker;
    cardLayoutCache.clear();
  });

  it("keeps the prior province layout while a newly added province is still pending", () => {
    const beijing: CardLayoutInput = {
      id: "北京市",
      anchorX: 500,
      anchorY: 300,
      width: 180,
      height: 90,
    };
    const zhejiang: CardLayoutInput = {
      id: "浙江省",
      anchorX: 700,
      anchorY: 500,
      width: 180,
      height: 90,
    };
    const previousRequest = makeRequest([beijing]);
    const expandedRequest = makeRequest([beijing, zhejiang]);
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });

    flushSync(() => root.render(<Harness request={previousRequest} />));
    const worker = PendingWorker.instances[0]!;
    const previousMessage = worker.messages[0] as { requestId: number; generation: number; key: string };
    const previousResult = makeResult(previousRequest);
    flushSync(() => worker.emit({
      type: "result",
      requestId: previousMessage.requestId,
      generation: previousMessage.generation,
      key: previousMessage.key,
      result: previousResult,
    }));

    flushSync(() => root.render(<Harness request={expandedRequest} />));

    expect(current?.pending).toBe(true);
    expect(current?.result).toBe(previousResult);
    expect(current?.result?.placements.map(({ id }) => id)).toEqual(["北京市"]);

    const expandedMessage = worker.messages[1] as { requestId: number; generation: number; key: string };
    const expandedResult = makeResult(expandedRequest);
    flushSync(() => worker.emit({
      type: "result",
      requestId: expandedMessage.requestId,
      generation: expandedMessage.generation,
      key: expandedMessage.key,
      result: expandedResult,
    }));

    expect(current?.pending).toBe(false);
    expect(current?.result?.placements.map(({ id }) => id)).toEqual(["北京市", "浙江省"]);
  });
});
