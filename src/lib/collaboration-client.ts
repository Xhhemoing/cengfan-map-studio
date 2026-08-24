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

/**
 * 服务端上一次落盘对这个房间的处置(R7-2)。三态而非布尔,是因为两种降级的后果不同:
 * `skipped` 的房间重启后不会被恢复,`trimmed` 的房间连快照带版本都还在,只是历史被裁掉。
 */
export type RoomPersistenceOutcome = "persisted" | "trimmed" | "skipped";

export interface RoomPersistence {
  outcome: RoomPersistenceOutcome;
  /** 最近一次**成功**落盘的时刻;从未成功落过盘或服务端没给出时刻时为 `null`。 */
  at: number | null;
}

const ROOM_PERSISTENCE_OUTCOMES: readonly string[] = ["persisted", "trimmed", "skipped"];

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
  /**
   * 上一次成功落盘是否完整写下了这个房间(R6-2 附加字段,在房间快照上与 `role`/`participants` 同级)。
   * `false` 表示房间被跳过或被裁掉历史;字段缺失表示服务端没有给出说法(旧版本服务端),
   * 不能当成降级。它说不出是哪一种降级,后果要看同级的 `persistence`。
   */
  persistedAtLastFlush?: boolean;
  /**
   * 上一次落盘对这个房间的处置(R7-2 附加字段,与 `persistedAtLastFlush` 同级)。只认服务端
   * 给出的三个已知处置,其余一律视为没有说法。
   */
  persistence?: RoomPersistence;
}

export interface CreatedRoom<T = unknown> {
  room: CollaborationRoom<T>;
  access: RoomAccess;
  /** 同上,但在 create/join 的响应里它是 `room`/`access` 的兄弟字段,不在 `room` 里面。 */
  persistedAtLastFlush?: boolean;
  /** 同上。 */
  persistence?: RoomPersistence;
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
  constructor(
    public readonly code: string,
    message: string,
    public readonly currentVersion?: number,
    /** HTTP 状态码;传输层失败(超时/断网)没有状态码。用于判定重试是否安全。 */
    public readonly status?: number,
  ) {
    super(message);
  }
}

type Requester = typeof fetch;

/**
 * 网络分区(移动网络切换、校园网门户、机房掉线)里最坏的形态不是连接被拒,而是连接建立后
 * 响应永远不来:`fetch` 没有默认超时,协作面板会永久停在"正在同步",重连也不会发生,因为
 * 上一次 `connect()` 还挂在 await 上。所以每一次协作请求都带一个 AbortController 截止时间,
 * 到点主动 abort 并抛 `REQUEST_TIMEOUT`,把控制权交回调用方的重试/重连逻辑。
 */
export const COLLABORATION_REQUEST_TIMEOUT_MS = 6_000;
/** 事务上传要序列化整包(可能是几 MB 的 base64 资源),给一个明显更宽的上限。 */
export const COLLABORATION_UPLOAD_TIMEOUT_MS = 20_000;
/** 只有幂等 GET 会重试:重放一次事务 POST 会在房间里写第二遍。 */
export const COLLABORATION_GET_RETRY_DELAYS = [250, 750] as const;

/** 传输层失败(超时/断网/网关错误):重试与"离线"提示的判据,和协议层错误区分开。 */
const TRANSPORT_ERROR_CODES = new Set(["REQUEST_TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR"]);
/** 重试这些状态是安全的:要么服务端明说稍后再来,要么请求根本没被处理。 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface CollaborationRequestOptions {
  request?: Requester;
  /** 单次尝试的截止时间(毫秒),到点 abort 底层请求。 */
  timeoutMs?: number;
  /** 调用方的取消信号(离开房间、组件卸载):触发后立即失败且不再重试。 */
  signal?: AbortSignal;
  /** 幂等 GET 的有界退避序列;传 `[]` 关闭重试。非幂等请求永远忽略此项。 */
  retryDelays?: readonly number[];
  /** 抖动随机源,注入后延迟可断言。 */
  random?: () => number;
  /** 注入定时器(返回取消函数),便于测试驱动截止时间与退避。 */
  schedule?: (handler: () => void, delayMs: number) => () => void;
}

/** 旧签名传 `fetch` 本身,新签名传选项对象,两者都要能用。 */
export type CollaborationRequestInput = Requester | CollaborationRequestOptions;

export function isCollaborationTransportError(error: unknown): boolean {
  return error instanceof CollaborationClientError && TRANSPORT_ERROR_CODES.has(error.code);
}

export function isCollaborationAbortError(error: unknown): boolean {
  return error instanceof CollaborationClientError && error.code === "REQUEST_ABORTED";
}

function normalizedRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

function roomTokenHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, "X-Cengfan-Room-Token": accessToken };
}

function requestOptionsOf(input: CollaborationRequestInput = {}): CollaborationRequestOptions {
  return typeof input === "function" ? { request: input } : input;
}

const defaultSchedule = (handler: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(handler, delayMs);
  return () => clearTimeout(timer);
};

function timeoutError(): CollaborationClientError {
  return new CollaborationClientError("REQUEST_TIMEOUT", "协作服务无响应，网络可能已中断");
}

function abortedError(): CollaborationClientError {
  return new CollaborationClientError("REQUEST_ABORTED", "协作请求已取消");
}

/** equal jitter:一半固定一半随机,避免同一批断线客户端在同一毫秒一起重连。 */
function jitteredDelay(delayMs: number, random: () => number): number {
  return Math.round(delayMs / 2 + (delayMs / 2) * random());
}

function waitFor(
  delayMs: number,
  schedule: (handler: () => void, delayMs: number) => () => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let cancel: (() => void) | null = null;
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      cancel?.();
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(abortedError()));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    cancel = schedule(() => finish(resolve), delayMs);
    if (done) return;
    signal?.addEventListener("abort", onAbort);
  });
}

interface RawResponse {
  ok: boolean;
  status: number;
  body: ({ error?: { code?: string; message?: string; currentVersion?: number } } & Record<string, unknown>) | null;
}

/**
 * 一次带截止时间的请求。读 body 也算在截止时间内:分区常见形态是响应头到了、body 卡住。
 */
async function sendOnce(
  url: string,
  init: RequestInit,
  options: CollaborationRequestOptions,
  timeoutMs: number,
): Promise<RawResponse> {
  const external = options.signal;
  if (external?.aborted) throw abortedError();
  const request = options.request ?? fetch;
  const schedule = options.schedule ?? defaultSchedule;
  const controller = new AbortController();
  let settled = false;
  let cause: CollaborationClientError | null = null;
  const abortWith = (error: CollaborationClientError) => {
    if (settled || cause) return;
    cause = error;
    controller.abort();
  };
  const onExternalAbort = () => abortWith(abortedError());
  const cancelDeadline = schedule(() => abortWith(timeoutError()), timeoutMs);
  external?.addEventListener("abort", onExternalAbort);
  // 竞速而不是只等 fetch:测试替身与部分运行时不一定尊重 signal,截止时间必须自己兜底。
  const aborted = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) {
      reject(cause ?? abortedError());
      return;
    }
    controller.signal.addEventListener("abort", () => reject(cause ?? abortedError()));
  });
  try {
    return await Promise.race([
      (async (): Promise<RawResponse> => {
        const response = await request(url, { ...init, signal: controller.signal });
        // 代理/门户可能回非 JSON:body 解析失败不该盖掉真正的状态码。
        const body = await response.json().catch(() => null) as RawResponse["body"];
        return { ok: response.ok, status: response.status, body };
      })(),
      aborted,
    ]);
  } catch (error) {
    if (cause) throw cause;
    if (error instanceof CollaborationClientError) throw error;
    throw new CollaborationClientError("NETWORK_ERROR", "无法连接协作服务，请检查网络");
  } finally {
    settled = true;
    cancelDeadline();
    external?.removeEventListener("abort", onExternalAbort);
  }
}

function responseError(raw: RawResponse): CollaborationClientError {
  return new CollaborationClientError(
    raw.body?.error?.code ?? (raw.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED"),
    raw.body?.error?.message ?? "协作请求失败",
    raw.body?.error?.currentVersion,
    raw.status,
  );
}

/** 传输层失败或服务端明说稍后再来:重试有意义。协议层拒绝(冲突、无权限)重试也不会变好。 */
function isRetryableFailure(error: unknown): boolean {
  if (isCollaborationAbortError(error)) return false;
  if (isCollaborationTransportError(error)) return true;
  return error instanceof CollaborationClientError && error.status !== undefined && RETRYABLE_STATUS.has(error.status);
}

async function attemptJson<T>(
  url: string,
  init: RequestInit,
  options: CollaborationRequestOptions,
  timeoutMs: number,
): Promise<T> {
  const raw = await sendOnce(url, init, options, timeoutMs);
  if (!raw.ok) throw responseError(raw);
  if (raw.body === null) throw new CollaborationClientError("INVALID_RESPONSE", "协作服务返回了无法解析的响应");
  return raw.body as unknown as T;
}

/**
 * 带截止时间的 JSON 请求;`idempotent` 为真时对传输层失败做有界抖动重试。
 */
async function jsonRequest<T>(
  url: string,
  init: RequestInit,
  input: CollaborationRequestInput,
  mode: { idempotent: boolean; timeoutMs?: number },
): Promise<T> {
  const options = requestOptionsOf(input);
  const timeoutMs = options.timeoutMs ?? mode.timeoutMs ?? COLLABORATION_REQUEST_TIMEOUT_MS;
  const delays = mode.idempotent ? (options.retryDelays ?? COLLABORATION_GET_RETRY_DELAYS) : [];
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? defaultSchedule;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await attemptJson<T>(url, init, options, timeoutMs);
    } catch (error) {
      if (attempt >= delays.length || !isRetryableFailure(error)) throw error;
      await waitFor(jitteredDelay(delays[attempt]!, random), schedule, options.signal);
    }
  }
}

/**
 * `persistedAtLastFlush` 只有在服务端给出 JSON 布尔时才算数。响应 body 是直通给调用方的,
 * 非布尔值(旧服务端的字段缺失、网关塞进来的字符串、null)一旦被当成"有说法",协作面板就会
 * 凭响应形状而不是服务端的判断去宣布房间活不过重启。缺失必须是"没有说法":键整个不出现,
 * 调用方才能把它和明确的 `true`/`false` 区分开。
 */
function persistenceFlagOf(value: unknown): { persistedAtLastFlush?: boolean } {
  return typeof value === "boolean" ? { persistedAtLastFlush: value } : {};
}

/**
 * 处置三态用的是同一把尺子:只有三个已知字面量算数。多一种处置(服务端将来新增的、网关改过
 * 大小写的、被压成字符串的对象)就是"没有说法",调用方据此沿用只认布尔位时的说法,而不是
 * 凭一个自己不认识的词去挑文案。`at` 只是落盘时刻的装饰位,读不出数字就报 `null`——结论本身
 * 不跟着一起丢。
 */
function persistenceOutcomeOf(value: unknown): { persistence?: RoomPersistence } {
  if (!value || typeof value !== "object") return {};
  const { outcome, at } = value as { outcome?: unknown; at?: unknown };
  if (typeof outcome !== "string" || !ROOM_PERSISTENCE_OUTCOMES.includes(outcome)) return {};
  return {
    persistence: {
      outcome: outcome as RoomPersistenceOutcome,
      at: typeof at === "number" && Number.isFinite(at) ? at : null,
    },
  };
}

/** 快照响应把落盘字段放在房间对象上,与 `role`/`participants` 同级。 */
function parseRoomSnapshot<T>(room: CollaborationRoom<T>): CollaborationRoom<T> {
  if (!room || typeof room !== "object") return room;
  const { persistedAtLastFlush, persistence, ...rest } = room as CollaborationRoom<T> & {
    persistedAtLastFlush?: unknown;
    persistence?: unknown;
  };
  return {
    ...(rest as CollaborationRoom<T>),
    ...persistenceFlagOf(persistedAtLastFlush),
    ...persistenceOutcomeOf(persistence),
  };
}

/** create/join 把落盘字段放在 `room`/`access` 的兄弟位置;房间对象上的同名字段用同一把尺子量。 */
function parseCreatedRoom<T>(created: CreatedRoom<T>): CreatedRoom<T> {
  const { persistedAtLastFlush, persistence, ...rest } = created as CreatedRoom<T> & {
    persistedAtLastFlush?: unknown;
    persistence?: unknown;
  };
  const base = rest as CreatedRoom<T>;
  return {
    ...base,
    ...(base.room ? { room: parseRoomSnapshot(base.room) } : {}),
    ...persistenceFlagOf(persistedAtLastFlush),
    ...persistenceOutcomeOf(persistence),
  };
}

export function createRoom<T>(
  input: { clientId: string; displayName: string; snapshot?: T } & CollaborationRequestOptions,
): Promise<CreatedRoom<T>> {
  return jsonRequest<CreatedRoom<T>>(`/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: input.clientId,
      displayName: input.displayName,
      ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
    }),
  }, input, { idempotent: false }).then(parseCreatedRoom);
}

export function fetchRoom<T>(roomId: string, accessToken: string, input: CollaborationRequestInput = {}): Promise<CollaborationRoom<T>> {
  return jsonRequest<CollaborationRoom<T>>(`/api/rooms/${normalizedRoomId(roomId)}`, {
    headers: roomTokenHeaders(accessToken),
  }, input, { idempotent: true }).then(parseRoomSnapshot);
}

export function joinRoom<T>(
  input: { roomId: string; inviteToken: string; clientId: string; displayName: string } & CollaborationRequestOptions,
): Promise<CreatedRoom<T>> {
  return jsonRequest<CreatedRoom<T>>(`/api/rooms/${normalizedRoomId(input.roomId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken: input.inviteToken, clientId: input.clientId, displayName: input.displayName }),
  }, input, { idempotent: false }).then(parseCreatedRoom);
}

export function createRoomInvitation(
  roomId: string,
  accessToken: string,
  role: Exclude<CollaborationRole, "owner">,
  input: CollaborationRequestInput = {},
): Promise<RoomInvitation> {
  return jsonRequest(`/api/rooms/${normalizedRoomId(roomId)}/invitations`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ role }),
  }, input, { idempotent: false });
}

export function leaveRoom(
  roomId: string,
  accessToken: string,
  clientId: string,
  input: CollaborationRequestInput = {},
): Promise<Pick<CollaborationRoom, "id" | "version" | "members">> {
  return jsonRequest(`/api/rooms/${normalizedRoomId(roomId)}/leave`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ clientId }),
  }, input, { idempotent: false });
}

export type RoomAccessAction = "set-readonly" | "close";

export function setRoomAccess(
  roomId: string,
  accessToken: string,
  clientId: string,
  action: RoomAccessAction,
  input: CollaborationRequestInput = {},
): Promise<Pick<CollaborationRoom, "id" | "version" | "readonly" | "closed">> {
  return jsonRequest(`/api/rooms/${normalizedRoomId(roomId)}/access`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ clientId, action }),
  }, input, { idempotent: false });
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
  input: CollaborationRequestInput = {},
): Promise<RoomOperationsResponse> {
  const query = new URLSearchParams({ afterVersion: String(afterVersion) });
  return jsonRequest(`/api/rooms/${normalizedRoomId(roomId)}/operations?${query}`, {
    headers: roomTokenHeaders(accessToken),
  }, input, { idempotent: true });
}

export function submitRoomSnapshot<T>(
  roomId: string,
  accessToken: string,
  transaction: CollaborationTransaction<T>,
  input: CollaborationRequestInput = {},
): Promise<CollaborationRoom<T>> {
  return jsonRequest(`/api/rooms/${normalizedRoomId(roomId)}/transactions`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(transaction),
  }, input, { idempotent: false, timeoutMs: COLLABORATION_UPLOAD_TIMEOUT_MS });
}

export function submitRoomOperations<T>(
  roomId: string,
  accessToken: string,
  transaction: CollaborationOperationTransaction,
  input: CollaborationRequestInput = {},
): Promise<CollaborationRoom<T>> {
  return jsonRequest(`/api/rooms/${normalizedRoomId(roomId)}/transactions`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(transaction),
  }, input, { idempotent: false, timeoutMs: COLLABORATION_UPLOAD_TIMEOUT_MS });
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

export async function createRoomEventsTicket(
  roomId: string,
  accessToken: string,
  input: CollaborationRequestInput = {},
): Promise<string> {
  // 不在这里重试:重连退避由 subscribeRoom 统一管,双层重试会把退避序列打乱。
  const response = await jsonRequest<{ ticket: string }>(`/api/rooms/${normalizedRoomId(roomId)}/events-ticket`, {
    method: "POST",
    headers: roomTokenHeaders(accessToken),
  }, input, { idempotent: false });
  return response.ticket;
}

/** 重试也不会好转的订阅终局:房间没了、凭证失效、房间已关闭。 */
export type SubscribeTerminalReason = "ROOM_NOT_FOUND" | "ROOM_FORBIDDEN" | "ROOM_CLOSED";

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
  /**
   * 订阅因终局原因放弃时上报一次。没有它,调用方只看到一次 `onError`,会继续显示"正在自动重连",
   * 而这条订阅其实已经永久停了。
   */
  onTerminal?: (reason: SubscribeTerminalReason) => void;
  /** 注入定时器(返回取消函数),便于测试驱动退避并断言没有遗留定时器。 */
  schedule?: (handler: () => void, delayMs: number) => () => void;
  /** 调用方的取消信号(离开房间/卸载):触发后与 unsubscribe 等价,在途 ticket 请求一并中止。 */
  signal?: AbortSignal;
  /** ticket 请求的截止时间;分区时它必须自己失败,否则 connect() 会永远挂着不重连。 */
  ticketTimeoutMs?: number;
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
  const delays = options.reconnectDelays ?? RECONNECT_DELAYS;
  const idleDelay = options.idleReconnectDelayMs ?? IDLE_RECONNECT_DELAY_MS;
  const schedule = options.schedule ?? ((handler: () => void, delayMs: number) => {
    const timer = window.setTimeout(handler, delayMs);
    return () => window.clearTimeout(timer);
  });
  /** 整条订阅的生命周期信号:stop() 时中止在途 ticket 请求,不留悬着的 fetch。 */
  const lifetime = new AbortController();
  const createTicket = options.createTicket ?? ((id, token) => createRoomEventsTicket(id, token, {
    signal: lifetime.signal,
    timeoutMs: options.ticketTimeoutMs,
    schedule,
  }));
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
    options.signal?.removeEventListener("abort", stop);
    lifetime.abort();
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
      // 取消是调用方发起的(离开房间/卸载):既不该上报错误,也不该拉起重连。
      if (stopped || isCollaborationAbortError(error)) return;
      if (error instanceof CollaborationClientError && TERMINAL_TICKET_ERROR_CODES.has(error.code)) {
        // 终局原因先于断流上报:调用方据此进入终局态,随后 onError 触发的补齐才不会
        // 再摆出"正在自动重连"。
        options.onTerminal?.(error.code as SubscribeTerminalReason);
        onError();
        stop();
        return;
      }
      onError();
      scheduleReconnect();
    }
  };

  if (options.signal?.aborted) {
    stop();
    return stop;
  }
  options.signal?.addEventListener("abort", stop);
  void connect();
  return stop;
}
