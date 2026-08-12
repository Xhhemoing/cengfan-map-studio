import type { CollaborationOperation } from "./collaboration-operations";

export type CollaborationRole = "owner" | "editor" | "viewer";

export interface RoomParticipant {
  id: string;
  displayName: string;
  role: CollaborationRole;
}

export interface RoomMember {
  clientId: string;
  role: CollaborationRole;
  joinedAt: string;
  lastSeenAt: string;
}

export interface RoomClosedInfo {
  id: string;
  version: number;
  readonly: boolean;
  closed: true;
}

export interface RoomAccess extends RoomParticipant {
  participantId: string;
  accessToken: string;
}

export interface RoomInvitation {
  token: string;
  role: Exclude<CollaborationRole, "owner">;
  expiresAt: string;
}

export interface CollaborationRoom<T = unknown> {
  id: string;
  version: number;
  snapshot?: T;
  ready: boolean;
  updatedBy: string;
  lastTxId?: string;
  operations?: CollaborationOperation[];
  rebasedFromVersion?: number;
  role?: CollaborationRole;
  participants?: RoomParticipant[];
  readonly?: boolean;
  closed?: boolean;
  members?: RoomMember[];
}

export interface CreatedRoom<T = unknown> {
  room: CollaborationRoom<T>;
  access: RoomAccess;
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

function normalizedRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

function roomTokenHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, "X-Cengfan-Room-Token": accessToken };
}

async function jsonRequest<T>(request: Promise<Response>): Promise<T> {
  const response = await request;
  const body = await response.json() as { error?: { code?: string; message?: string; currentVersion?: number } } & T;
  if (!response.ok) {
    throw new CollaborationClientError(body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "协作请求失败", body.error?.currentVersion);
  }
  return body;
}

export function createRoom<T>(input: { clientId: string; displayName: string; snapshot?: T; request?: Requester }): Promise<CreatedRoom<T>> {
  const request = input.request ?? fetch;
  return jsonRequest(request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: input.clientId,
      displayName: input.displayName,
      ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
    }),
  }));
}

export function fetchRoom<T>(roomId: string, accessToken: string, request: Requester = fetch): Promise<CollaborationRoom<T>> {
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}`, {
    headers: roomTokenHeaders(accessToken),
  }));
}

export function joinRoom<T>(input: { roomId: string; inviteToken: string; clientId: string; displayName: string; request?: Requester }): Promise<CreatedRoom<T>> {
  const request = input.request ?? fetch;
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(input.roomId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken: input.inviteToken, clientId: input.clientId, displayName: input.displayName }),
  }));
}

export function createRoomInvitation(
  roomId: string,
  accessToken: string,
  role: Exclude<CollaborationRole, "owner">,
  request: Requester = fetch,
): Promise<RoomInvitation> {
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}/invitations`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ role }),
  }));
}

export function leaveRoom(
  roomId: string,
  accessToken: string,
  clientId: string,
  request: Requester = fetch,
): Promise<Pick<CollaborationRoom, "id" | "version" | "members">> {
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}/leave`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ clientId }),
  }));
}

export type RoomAccessAction = "set-readonly" | "close";

export function setRoomAccess(
  roomId: string,
  accessToken: string,
  clientId: string,
  action: RoomAccessAction,
  request: Requester = fetch,
): Promise<Pick<CollaborationRoom, "id" | "version" | "readonly" | "closed">> {
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}/access`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ clientId, action }),
  }));
}

export interface RoomOperationsResponse {
  id: string;
  version: number;
  afterVersion: number;
  operations: CollaborationOperation[];
}

export function fetchRoomOperations(
  roomId: string,
  accessToken: string,
  afterVersion: number,
  request: Requester = fetch,
): Promise<RoomOperationsResponse> {
  const query = new URLSearchParams({ afterVersion: String(afterVersion) });
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}/operations?${query}`, {
    headers: roomTokenHeaders(accessToken),
  }));
}

export function submitRoomSnapshot<T>(
  roomId: string,
  accessToken: string,
  transaction: CollaborationTransaction<T>,
  request: Requester = fetch,
): Promise<CollaborationRoom<T>> {
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}/transactions`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(transaction),
  }));
}

export function submitRoomOperations<T>(
  roomId: string,
  accessToken: string,
  transaction: CollaborationOperationTransaction,
  request: Requester = fetch,
): Promise<CollaborationRoom<T>> {
  return jsonRequest(request(`/api/rooms/${normalizedRoomId(roomId)}/transactions`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json", Prefer: "return=minimal" }),
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

export async function createRoomEventsTicket(roomId: string, accessToken: string, request: Requester = fetch): Promise<string> {
  const response = await jsonRequest<{ ticket: string }>(request(`/api/rooms/${normalizedRoomId(roomId)}/events-ticket`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken),
  }));
  return response.ticket;
}

export interface SubscribeRoomOptions {
  version?: number;
  createTicket?: (roomId: string, accessToken: string) => Promise<string>;
  onMembers?: (members: RoomMember[]) => void;
  onClosed?: (room: RoomClosedInfo) => void;
}

export function subscribeRoom<T>(
  roomId: string,
  accessToken: string,
  onSnapshot: (room: CollaborationRoom<T>) => void,
  onError: () => void = () => {},
  options: SubscribeRoomOptions = {},
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  const createTicket = options.createTicket ?? ((id, token) => createRoomEventsTicket(id, token));
  void createTicket(roomId, accessToken).then((ticket) => {
    if (closed) return;
    const query = new URLSearchParams({ ticket });
    if (options.version !== undefined) query.set("version", String(options.version));
    source = new EventSource(`/api/rooms/${normalizedRoomId(roomId)}/events?${query}`);
    source.addEventListener("snapshot", (event) => {
      try {
        onSnapshot(JSON.parse((event as MessageEvent<string>).data) as CollaborationRoom<T>);
      } catch {
        onError();
      }
    });
    if (options.onMembers) {
      source.addEventListener("members", (event) => {
        try {
          options.onMembers?.(JSON.parse((event as MessageEvent<string>).data) as RoomMember[]);
        } catch {
          onError();
        }
      });
    }
    if (options.onClosed) {
      source.addEventListener("closed", (event) => {
        try {
          options.onClosed?.(JSON.parse((event as MessageEvent<string>).data) as RoomClosedInfo);
        } catch {
          onError();
        }
        source?.close();
      });
    }
    source.onerror = onError;
  }).catch(onError);
  return () => {
    closed = true;
    source?.close();
  };
}
