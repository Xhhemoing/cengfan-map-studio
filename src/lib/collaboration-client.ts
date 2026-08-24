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
  /**
   * 已知版本。传函数时每次(重)连都会重新读取,断线补齐之后不会再从旧版本重放。
   */
  version?: number | (() => number);
  createTicket?: (roomId: string, accessToken: string) => Promise<string>;
  onMembers?: (members: RoomMember[]) => void;
  onClosed?: (room: RoomClosedInfo) => void;
  /** 断流后的重连退避序列(毫秒);用尽后转入 idleReconnectDelayMs 的长间隔。 */
  reconnectDelays?: readonly number[];
  /** 退避序列用尽后的固定重试间隔(毫秒),保证延迟有上界。 */
  idleReconnectDelayMs?: number;
  /** 调用方否决重连(例如已知房间关闭)。返回 false 后整条订阅终止。 */
  shouldReconnect?: () => boolean;
  /** 注入定时器(返回取消函数),便于测试驱动退避并断言没有遗留定时器。 */
  schedule?: (handler: () => void, delayMs: number) => () => void;
}

const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 8_000] as const;
/** 退避用尽后的长间隔:断网数分钟后恢复仍能自己接回来,同时给出延迟上界。 */
const IDLE_RECONNECT_DELAY_MS = 20_000;
/** 这些错误重试也不会好转(房间没了/没权限/已关闭),直接终止订阅。 */
const TERMINAL_TICKET_ERROR_CODES = new Set(["ROOM_NOT_FOUND", "ROOM_FORBIDDEN", "ROOM_CLOSED"]);

/**
 * events ticket 是一次性的:服务端在第一次 GET 时就把它删掉,浏览器 EventSource 自带的重连
 * 会带着这张已消费的 ticket 反复拿 403,按规范非 200 属于致命失败,这条流就永久死了——一次
 * 网络抖动之后整个协作会话只剩上传,收不到任何远端修改。
 *
 * 所以重连由本函数接管:onerror 先把旧流 close() 掉(阻断原生重试),上报一次 onError 让调用方
 * 补齐断线期间的增量,再按退避序列重新申请 ticket 并用**当前**版本重建 EventSource。任何时刻
 * 只有一条活着的流,`closed` 是服务端主动 end 的终局事件,收到后不再重连。
 *
 * 回滚:把 stream.onerror 换回 `onError`,删掉 scheduleReconnect/connect 的重试分支即可。
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
  let cancelReconnect: (() => void) | null = null;
  const createTicket = options.createTicket ?? ((id, token) => createRoomEventsTicket(id, token));
  const delays = options.reconnectDelays ?? RECONNECT_DELAYS;
  const idleDelay = options.idleReconnectDelayMs ?? IDLE_RECONNECT_DELAY_MS;
  const schedule = options.schedule ?? ((handler: () => void, delayMs: number) => {
    const timer = window.setTimeout(handler, delayMs);
    return () => window.clearTimeout(timer);
  });
  const knownVersion = (): number | undefined => (
    typeof options.version === "function" ? options.version() : options.version
  );

  const clearReconnect = () => {
    cancelReconnect?.();
    cancelReconnect = null;
  };

  const stop = () => {
    stopped = true;
    clearReconnect();
    source?.close();
    source = null;
  };

  /** 终局条件在退避等待期间也可能出现(例如补齐请求发现房间已关闭),所以两处都要判。 */
  const canContinue = (): boolean => {
    if (stopped) return false;
    if (options.shouldReconnect && !options.shouldReconnect()) {
      stop();
      return false;
    }
    return true;
  };

  const scheduleReconnect = () => {
    if (!canContinue()) return;
    // 退避序列用尽后不永久放弃,改用固定长间隔;attempt 被夹在序列长度内,延迟有上界。
    const delay = attempt < delays.length ? delays[attempt]! : idleDelay;
    attempt = Math.min(attempt + 1, delays.length);
    clearReconnect();
    cancelReconnect = schedule(() => {
      cancelReconnect = null;
      if (!canContinue()) return;
      void connect();
    }, delay);
  };

  const attachStream = (ticket: string) => {
    const query = new URLSearchParams({ ticket });
    const version = knownVersion();
    if (version !== undefined) query.set("version", String(version));
    const stream = new EventSource(`/api/rooms/${normalizedRoomId(roomId)}/events?${query}`);
    source = stream;
    // 每条流只处理一次失败:关闭后浏览器补发的 onerror 不应再拉起第二条重连链。
    let streamFailed = false;
    const failStream = (): boolean => {
      if (streamFailed) return false;
      streamFailed = true;
      if (source === stream) source = null;
      // 必须先 close():否则原生 EventSource 会拿着这张已消费的 ticket 自己重试。
      stream.close();
      return true;
    };
    const receive = <E>(type: string, notify: (payload: E) => void) => {
      stream.addEventListener(type, (event) => {
        if (streamFailed) return;
        try {
          notify(JSON.parse((event as MessageEvent<string>).data) as E);
        } catch {
          onError();
          return;
        }
        // 收到一条完整事件即视为连接健康,下一次断流从最短退避重新开始。
        attempt = 0;
      });
    };
    receive<CollaborationRoom<T>>("snapshot", onSnapshot);
    receive<RoomMember[]>("members", (members) => options.onMembers?.(members));
    // closed 是服务端主动 end 的终局事件:无论调用方是否关心回调都要停掉整条订阅,
    // 否则浏览器会带着一次性 ticket 反复重连一间已经不存在的房间。
    stream.addEventListener("closed", (event) => {
      streamFailed = true;
      stopped = true;
      clearReconnect();
      if (source === stream) source = null;
      stream.close();
      try {
        options.onClosed?.(JSON.parse((event as MessageEvent<string>).data) as RoomClosedInfo);
      } catch {
        onError();
      }
    });
    stream.onerror = () => {
      if (!failStream()) return;
      onError();
      scheduleReconnect();
    };
  };

  const connect = async (): Promise<void> => {
    try {
      const ticket = await createTicket(roomId, accessToken);
      if (stopped) return;
      attachStream(ticket);
    } catch (error) {
      onError();
      if (error instanceof CollaborationClientError && TERMINAL_TICKET_ERROR_CODES.has(error.code)) {
        stop();
        return;
      }
      scheduleReconnect();
    }
  };

  void connect();
  return stop;
}
