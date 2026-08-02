import type { CollaborationOperation } from "./collaboration-operations";

export interface CollaborationRoom<T = unknown> {
  id: string;
  version: number;
  snapshot?: T;
  ready: boolean;
  updatedBy: string;
  lastTxId?: string;
  operations?: CollaborationOperation[];
  rebasedFromVersion?: number;
}

export interface CollaborationTransaction<T = unknown> {
  txId: string;
  clientId: string;
  baseVersion: number;
  snapshot: T;
}

export interface CollaborationOperationTransaction {
  txId: string;
  clientId: string;
  baseVersion: number;
  operations: CollaborationOperation[];
}

export class CollaborationClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly currentVersion?: number) {
    super(message);
  }
}

type Requester = typeof fetch;

async function jsonRequest<T>(request: Promise<Response>): Promise<T> {
  const response = await request;
  const body = await response.json() as { error?: { code?: string; message?: string; currentVersion?: number } } & T;
  if (!response.ok) {
    throw new CollaborationClientError(body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "协作请求失败", body.error?.currentVersion);
  }
  return body;
}

export function createRoom<T>(input: { clientId: string; snapshot?: T; request?: Requester }): Promise<CollaborationRoom<T>> {
  const request = input.request ?? fetch;
  return jsonRequest(request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: input.clientId,
      ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
    }),
  }));
}

export function fetchRoom<T>(roomId: string, request: Requester = fetch): Promise<CollaborationRoom<T>> {
  return jsonRequest(request(`/api/rooms/${roomId.trim().toUpperCase()}`));
}

export function submitRoomSnapshot<T>(roomId: string, transaction: CollaborationTransaction<T>, request: Requester = fetch): Promise<CollaborationRoom<T>> {
  return jsonRequest(request(`/api/rooms/${roomId.trim().toUpperCase()}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(transaction),
  }));
}

export function submitRoomOperations<T>(roomId: string, transaction: CollaborationOperationTransaction, request: Requester = fetch): Promise<CollaborationRoom<T>> {
  return jsonRequest(request(`/api/rooms/${roomId.trim().toUpperCase()}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(transaction),
  }));
}

export function isOwnRoomAcknowledgement(
  room: Pick<CollaborationRoom, "updatedBy" | "lastTxId">,
  clientId: string,
  txId: string,
): boolean {
  return room.updatedBy === clientId && room.lastTxId === txId;
}

export async function retryInitializingRoom<T>(
  load: () => Promise<T>,
  options: {
    delays?: readonly number[];
    wait?: (delayMs: number) => Promise<void>;
    onRetry?: () => void;
  } = {},
): Promise<T> {
  const delays = options.delays ?? [100, 250, 500, 1_000];
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      if (
        !(error instanceof CollaborationClientError)
        || error.code !== "ROOM_INITIALIZING"
        || attempt >= delays.length
      ) {
        throw error;
      }
      options.onRetry?.();
      await wait(delays[attempt]!);
    }
  }
}

export function subscribeRoom<T>(
  roomId: string,
  onSnapshot: (room: CollaborationRoom<T>) => void,
  onError: () => void = () => {},
  options: { clientId?: string; version?: number } = {},
): () => void {
  const query = new URLSearchParams();
  if (options.clientId) query.set("clientId", options.clientId);
  if (options.version !== undefined) query.set("version", String(options.version));
  const suffix = query.size > 0 ? `?${query}` : "";
  const source = new EventSource(`/api/rooms/${roomId.trim().toUpperCase()}/events${suffix}`);
  source.addEventListener("snapshot", (event) => {
    try {
      onSnapshot(JSON.parse((event as MessageEvent<string>).data) as CollaborationRoom<T>);
    } catch {
      onError();
    }
  });
  source.onerror = onError;
  return () => source.close();
}
