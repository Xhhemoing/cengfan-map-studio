import { solveCardLayout } from "../lib/card-layout";
import type { CardLayoutWorkerMessage, CardLayoutWorkerResponse } from "../lib/card-layout-worker-protocol";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CardLayoutWorkerMessage>) => void) | null;
  postMessage: (message: CardLayoutWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type !== "solve") return;
  const response: CardLayoutWorkerResponse = {
    type: "result",
    requestId: request.requestId,
    key: request.key,
    result: solveCardLayout(request.cards, request.bounds, request.options),
  };
  workerScope.postMessage(response);
};
