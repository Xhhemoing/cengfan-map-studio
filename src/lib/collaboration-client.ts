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

export interface RoomKickedInfo {
  id: string;
  version: number;
  clientId: string;
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
  /** 已知版本;传函数时每次(重)连都会重新读取,断线补齐后不会再从旧版本重放。 */
  version?: number | (() => number);
  createTicket?: (roomId: string, accessToken: string) => Promise<string>;
  onMembers?: (members: RoomMember[]) => void;
  onClosed?: (room: RoomClosedInfo) => void;
  onKicked?: (info: RoomKickedInfo) => void;
  /** 断流后的重连退避序列(毫秒);用尽后不再重连。 */
  reconnectDelays?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
}

const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 8_000] as const;

/**
 * events ticket 是一次性的:浏览器 EventSource 自带的重连会带着已消费的 ticket 反复拿 403,
 * 这条流就永久失效了。所以非终局断流一律由本函数接管——关掉旧流、退避重取 ticket、
 * 重建 EventSource,并用当前版本续传。kicked/closed 是服务端主动 end 的终局事件,不重连。
 * 回滚:把 stream.onerror 换回 `onError` 并去掉 scheduleReconnect 与 connect 的 catch 重试。
 */
export function subscribeRoom<T>(
  roomId: string,
  accessToken: string,
  onSnapshot: (room: CollaborationRoom<T>) => void,
  onError: () => void = () => {},
  options: SubscribeRoomOptions = {},
): () => void {
  let source: EventSource | null = null;
  /** 调用方取消或收到终局事件后置位:此后既不重连,也不再挂新流。 */
  let stopped = false;
  let attempt = 0;
  const createTicket = options.createTicket ?? ((id, token) => createRoomEventsTicket(id, token));
  const delays = options.reconnectDelays ?? RECONNECT_DELAYS;
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)));
  const knownVersion = (): number | undefined => (
    typeof options.version === "function" ? options.version() : options.version
  );

  const scheduleReconnect = () => {
    if (stopped || attempt >= delays.length) return;
    const delay = delays[attempt]!;
    attempt += 1;
    void wait(delay).then(() => {
      if (stopped) return;
      return connect();
    });
  };

  const attachStream = (ticket: string) => {
    const query = new URLSearchParams({ ticket });
    const version = knownVersion();
    if (version !== undefined) query.set("version", String(version));
    const stream = new EventSource(`/api/rooms/${normalizedRoomId(roomId)}/events?${query}`);
    source = stream;
    // 每条流只允许触发一次失败处理,旧流关闭后补发的 onerror 不应再拉起第二次重连。
    let streamFailed = false;
    const receive = <E>(type: string, notify: (payload: E) => void) => {
      stream.addEventListener(type, (event) => {
        // 收到数据说明这条流是通的,退避次数归零,下次断线重新从最短间隔开始。
        attempt = 0;
        try {
          notify(JSON.parse((event as MessageEvent<string>).data) as E);
        } catch {
          onError();
        }
      });
    };
    receive<CollaborationRoom<T>>("snapshot", onSnapshot);
    if (options.onMembers) receive<RoomMember[]>("members", (members) => options.onMembers?.(members));
    // closed/kicked 都是终局事件:服务端已经断流,浏览器会拿着一次性 ticket 反复重连,
    // 所以无论调用方是否关心回调,都要主动关掉 EventSource。
    const endStream = <E>(type: string, notify?: (payload: E) => void) => {
      stream.addEventListener(type, (event) => {
        stopped = true;
        streamFailed = true;
        try {
          notify?.(JSON.parse((event as MessageEvent<string>).data) as E);
        } catch {
          onError();
        }
        stream.close();
      });
    };
    endStream<RoomClosedInfo>("closed", options.onClosed);
    endStream<RoomKickedInfo>("kicked", options.onKicked);
    stream.onerror = () => {
      if (streamFailed) return;
      streamFailed = true;
      onError();
      if (source === stream) source = null;
      stream.close();
      scheduleReconnect();
    };
  };

  const connect = async (): Promise<void> => {
    try {
      const ticket = await createTicket(roomId, accessToken);
      if (stopped) return;
      attachStream(ticket);
    } catch {
      onError();
      scheduleReconnect();
    }
  };

  void connect();
  return () => {
    stopped = true;
    source?.close();
    source = null;
  };
}
