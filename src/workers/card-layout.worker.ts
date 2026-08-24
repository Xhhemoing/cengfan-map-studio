import { solveCardLayout } from "../lib/card-layout";
import type { CardLayoutWorkerMessage, CardLayoutWorkerResponse } from "../lib/card-layout-worker-protocol";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CardLayoutWorkerMessage>) => void) | null;
  postMessage: (message: CardLayoutWorkerResponse) => void;
};

let latestGeneration = 0;
let latestRequest: CardLayoutWorkerMessage | null = null;
let solveScheduled = false;

function scheduleLatestRequest(): void {
  if (solveScheduled) return;
  solveScheduled = true;
  setTimeout(() => {
    solveScheduled = false;
    const request = latestRequest;
    // A newer queued request supersedes this generation before solver work starts.
    if (!request || request.generation !== latestGeneration) {
      if (latestRequest) scheduleLatestRequest();
      return;
    }
    latestRequest = null;
    const response: CardLayoutWorkerResponse = {
      type: "result",
      requestId: request.requestId,
      generation: request.generation,
      key: request.key,
      result: solveCardLayout(request.cards, request.bounds, request.options),
    };
    workerScope.postMessage(response);
    if (latestRequest) scheduleLatestRequest();
  }, 0);
}

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type !== "solve") return;
  if (request.generation < latestGeneration) return;
  latestGeneration = request.generation;
  latestRequest = request;
  scheduleLatestRequest();
};
