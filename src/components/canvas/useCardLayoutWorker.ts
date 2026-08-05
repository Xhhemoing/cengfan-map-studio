import { useEffect, useMemo, useRef, useState } from "react";
import { solveCardLayout, type CardLayoutResult } from "../../lib/card-layout";
import { cardLayoutCache } from "../../lib/card-layout-cache";
import type {
  CardLayoutWorkerMessage,
  CardLayoutWorkerResponse,
} from "../../lib/card-layout-worker-protocol";
import type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";

export type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";

export interface CardLayoutWorkerState {
  result: CardLayoutResult | null;
  pending: boolean;
}

function workerIsAvailable(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function createLayoutWorker(): Worker | null {
  if (!workerIsAvailable()) return null;
  try {
    return new Worker(new URL("../../workers/card-layout.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

interface KeyedCardLayoutWorkerState extends CardLayoutWorkerState {
  key: string | null;
}

interface ResolvedCardLayout {
  key: string | null;
  result: CardLayoutResult | null;
  cached: boolean;
}

export function useCardLayoutWorker(request: CardLayoutWorkerRequest | null, forceSync = false): CardLayoutWorkerState {
  const requestKey = request?.key ?? null;
  const resolved = useMemo<ResolvedCardLayout>(() => {
    if (!request) return { key: null, result: null, cached: false };
    const cached = cardLayoutCache.get(request.key);
    if (cached) return { key: request.key, result: cached, cached: true };
    if (!forceSync && workerIsAvailable()) return { key: request.key, result: null, cached: false };
    const result = solveCardLayout(request.cards, request.bounds, request.options);
    cardLayoutCache.set(request.key, result);
    return { key: request.key, result, cached: !forceSync };
  }, [forceSync, request]);
  const requestRef = useRef(request);
  const activeKeyRef = useRef(requestKey);
  const requestIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<KeyedCardLayoutWorkerState>(() => ({
    key: resolved.key,
    result: resolved.result,
    pending: Boolean(request && !resolved.cached && !forceSync),
  }));

  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    const currentRequest = requestRef.current;
    activeKeyRef.current = requestKey;
    if (!currentRequest) {
      setState({ key: null, result: null, pending: false });
      return;
    }

    const cached = cardLayoutCache.get(currentRequest.key);
    if (cached || forceSync) {
      const result = cached ?? solveCardLayout(currentRequest.cards, currentRequest.bounds, currentRequest.options);
      cardLayoutCache.set(currentRequest.key, result);
      setState({ key: currentRequest.key, result, pending: false });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const worker = workerRef.current ?? createLayoutWorker();
    workerRef.current = worker;

    if (!worker) {
      const result = solveCardLayout(currentRequest.cards, currentRequest.bounds, currentRequest.options);
      cardLayoutCache.set(currentRequest.key, result);
      setState({ key: currentRequest.key, result, pending: false });
      return;
    }

    if (!worker.onmessage) {
      worker.onmessage = (event: MessageEvent<CardLayoutWorkerResponse>) => {
        const response = event.data;
        if (response.type !== "result"
          || response.requestId !== requestIdRef.current
          || response.key !== activeKeyRef.current) return;
        cardLayoutCache.set(response.key, response.result);
        setState({ key: response.key, result: response.result, pending: false });
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        worker.terminate();
        workerRef.current = null;
        requestIdRef.current += 1;
        const fallbackRequest = requestRef.current;
        if (!fallbackRequest || fallbackRequest.key !== activeKeyRef.current) return;
        const result = solveCardLayout(fallbackRequest.cards, fallbackRequest.bounds, fallbackRequest.options);
        cardLayoutCache.set(fallbackRequest.key, result);
        setState({ key: fallbackRequest.key, result, pending: false });
      };
    }

    setState({ key: currentRequest.key, result: null, pending: true });
    const message: CardLayoutWorkerMessage = {
      type: "solve",
      requestId,
      ...currentRequest,
    };
    worker.postMessage(message);
  }, [forceSync, requestKey]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  if (!request) return { result: null, pending: false };
  if (state.key === request.key) return state;
  return { result: resolved.result, pending: !resolved.cached && !forceSync };
}
