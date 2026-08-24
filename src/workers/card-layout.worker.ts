import { solveCardLayout } from "../lib/card-layout";
import {
  isCardLayoutWorkerMessage,
  type CardLayoutWorkerResponse,
} from "../lib/card-layout-worker-protocol";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: CardLayoutWorkerResponse) => void;
};

/**
 * Solve requests off the main thread. Malformed messages are ignored and a
 * failed solve answers with an `error` response, so the worker never raises an
 * uncaught error on the main thread and never leaves a request hanging.
 */
workerScope.onmessage = (event) => {
  const request = event?.data;
  if (!isCardLayoutWorkerMessage(request)) return;
  try {
    workerScope.postMessage({
      type: "result",
      requestId: request.requestId,
      key: request.key,
      result: solveCardLayout(request.cards, request.bounds, request.options ?? {}),
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      requestId: request.requestId,
      key: request.key,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};
