/**
 * Collaboration room lifecycle hook: room state, SSE subscription with
 * disconnect backfill, member/readonly/closed bookkeeping, and the owner
 * access actions. The upload side (workspace diff → submit operations) stays
 * in the caller so workspace state and room state remain decoupled.
 *
 * Extracted from App.tsx (2026-08-12) without behaviour changes; App keeps
 * `applySharedPackage` as the workspace-state sink and this hook owns every
 * collaboration ref.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  COLLABORATION_DISPLAY_NAME,
  ROOM_ACCESS_STORAGE_PREFIX,
} from "./app-constants";
import {
  CollaborationClientError,
  createRoom,
  createRoomInvitation,
  fetchRoom,
  fetchRoomOperations,
  isCollaborationAbortError,
  isCollaborationTransportError,
  joinRoom,
  leaveRoom,
  retryInitializingRoom,
  setRoomAccess,
  submitRoomSnapshot,
  subscribeRoom,
  type CollaborationRole,
  type CollaborationRoom,
  type RoomAccessAction,
  type RoomMember,
  type RoomParticipant,
  type SubscribeTerminalReason,
} from "./collaboration-client";
import { rebaseRemoteCollaborationOperations, type CollaborationOperation } from "./collaboration-operations";
import { createId } from "./ids";
import type { ProjectPackage } from "./project-package";

export type RoomCollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error" | "closed";

/**
 * 补齐触发场景:
 * - `disconnect`:SSE 断流后补齐,过程中先落到 `error`(重连由 `subscribeRoom` 自己接管);
 * - `gap`:流上的 version 跳变,连接本身没断,所以全程保持 `syncing`;
 * - `online`:浏览器报告网络恢复,不等退避直接补齐。
 */
export type CollaborationBackfillReason = "disconnect" | "gap" | "online";

const BACKFILL_DONE_MESSAGE: Record<CollaborationBackfillReason, string> = {
  disconnect: "已补齐断线期间的修改",
  gap: "已补齐跳过的远端修改",
  online: "网络已恢复，已补齐断线期间的修改",
};

const BACKFILL_START_MESSAGE: Record<Exclude<CollaborationBackfillReason, "disconnect">, string> = {
  gap: "远端版本不连续，正在补齐缺失的修改",
  online: "网络已恢复，正在补齐断线期间的修改",
};

/**
 * 网络分区与"服务端拒绝"是两种完全不同的处境:前者本地修改仍然有效、等网络回来就能续上,
 * 后者(房间关闭、无权限、版本冲突)重试再多也没用。`collaborationOffline` 把前者单独标出来,
 * 面板才能给出"仍在重试、改动不会丢"的说法,而不是笼统的一个错误态。
 */
const OFFLINE_MESSAGE = "网络已断开，本地修改会保留，恢复后自动续传";

/**
 * 房间过期/被清理后,ticket 与补齐都会拿到 ROOM_NOT_FOUND,`subscribeRoom` 遇到终局码会静默停掉
 * 整条订阅。此时再显示"正在自动重连"就是撒谎:没有任何重连在进行,用户只能重新建房或重新加入。
 */
const TERMINAL_ROOM_MESSAGE: Record<SubscribeTerminalReason, string> = {
  ROOM_NOT_FOUND: "房间已过期或已失效，请重新创建房间或让创建者重新邀请",
  ROOM_FORBIDDEN: "房间访问凭证已失效，请用新的邀请凭证重新加入",
  ROOM_CLOSED: "房间已关闭，无法继续同步或编辑",
};

/**
 * 服务端拒绝码里哪些是终局。上传路径在调用方那一侧,它拿到的拒绝码要经过同一张表才能落到
 * 终局态——否则「房间没了」这件事会有两套判据,面板迟早说两种话。
 */
function terminalRejectionReason(code: string): SubscribeTerminalReason | null {
  return code === "ROOM_NOT_FOUND" || code === "ROOM_FORBIDDEN" || code === "ROOM_CLOSED" ? code : null;
}

export interface UseCollaborationRoomRefs {
  baselineRef: MutableRefObject<ProjectPackage | null>;
  versionRef: MutableRefObject<number>;
  roomRef: MutableRefObject<string | null>;
  accessTokenRef: MutableRefObject<string | null>;
  suppressSendRef: MutableRefObject<boolean>;
  backfillInFlightRef: MutableRefObject<boolean>;
}

export interface UseCollaborationRoomOptions extends UseCollaborationRoomRefs {
  clientId: string;
  /** Snapshot of the current workspace at the given exportedAt. */
  currentPackage: (exportedAt?: string) => ProjectPackage;
  /** Applies a remote package to workspace state; returns the normalized package. */
  applyPackage: (pack: ProjectPackage, version: number) => ProjectPackage;
}

export interface UseCollaborationRoomResult {
  roomId: string | null;
  roomAccessToken: string | null;
  roomRole: CollaborationRole | null;
  roomParticipants: RoomParticipant[];
  roomMembers: RoomMember[];
  roomReadonly: boolean;
  roomClosed: boolean;
  /**
   * 终局状态:房间已过期/已失效(或凭证失效),订阅已经永久停止。与 `collaborationOffline`
   * 互斥——前者重连也没用,后者等网络回来就能续上。
   */
  roomExpired: boolean;
  invitationToken: string | null;
  roomVersion: number;
  collaborationStatus: RoomCollaborationStatus;
  /** 传输层不可达(超时/断网/网关错误)时为真;协议层拒绝不会置位。 */
  collaborationOffline: boolean;
  /**
   * 每完成一次"离线 → 在线"的恢复就 +1。调用方可以拿它当 effect 依赖,在连接痊愈的那一刻
   * 重发分区期间没能上传的修改(每次恢复只触发一次)。
   */
  connectionHealCount: number;
  collaborationMessage: string;
  collaborationOpen: boolean;
  roomInput: string;
  inviteTokenInput: string;
  hasStoredRoomAccess: boolean;
  canEdit: boolean;
  setRoomVersion: (version: number) => void;
  setCollaborationStatus: (status: RoomCollaborationStatus) => void;
  /**
   * 让调用方把自己那一侧的传输层失败(例如上传事务超时)并入同一个离线叙事;终局房间不受影响。
   */
  setCollaborationOffline: (offline: boolean) => void;
  /**
   * 让调用方上报自己那一侧拿到的服务端拒绝码。终局码(房间没了/凭证失效/房间已关闭)当场把
   * 房间带到终局并返回 `true`,调用方据此收手、不再画自己的错误文案;其余码返回 `false`,
   * 仍由调用方按冲突或离线处理。重复上报只认第一个成因。
   */
  reportTerminalRejection: (code: string) => boolean;
  setCollaborationMessage: (message: string) => void;
  setCollaborationOpen: (open: boolean) => void;
  setRoomInput: (value: string) => void;
  setInviteTokenInput: (value: string) => void;
  startRoom: () => void;
  joinRoom: () => void;
  createInvitation: (role: Exclude<CollaborationRole, "owner">) => void;
  leaveRoom: () => void;
  setAccess: (action: RoomAccessAction) => void;
}

function loadBrowserValue<T>(load: () => T, fallback: T): T {
  try {
    return load();
  } catch {
    return fallback;
  }
}

// 房间凭证的存取只依赖房间号,放在模块层,房间状态机才能在声明顺序之前用上它们。
function storedRoomAccess(id: string): string | null {
  return loadBrowserValue(() => window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`), null);
}

function persistRoomAccess(id: string, accessToken: string): void {
  try {
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`, accessToken);
  } catch {
    // The active connection remains usable when browser storage is unavailable.
  }
}

function forgetRoomAccess(id: string): void {
  try {
    window.localStorage.removeItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`);
  } catch {
    // Local project data is intentionally untouched when credentials cannot be cleared.
  }
}

export function useCollaborationRoom(options: UseCollaborationRoomOptions): UseCollaborationRoomResult {
  const { clientId, baselineRef, versionRef, roomRef, accessTokenRef, suppressSendRef, backfillInFlightRef } = options;
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomAccessToken, setRoomAccessToken] = useState<string | null>(null);
  const [roomRole, setRoomRole] = useState<CollaborationRole | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [roomReadonly, setRoomReadonly] = useState(false);
  const [roomClosed, setRoomClosed] = useState(false);
  const [roomExpired, setRoomExpired] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [roomVersion, setRoomVersion] = useState(0);
  const [collaborationStatus, setCollaborationStatus] = useState<RoomCollaborationStatus>("idle");
  const [collaborationOffline, setCollaborationOfflineState] = useState(false);
  const [connectionHealCount, setConnectionHealCount] = useState(0);
  /** 网络恢复时自增,作为订阅 effect 的依赖:重挂一条流即为"立刻重连",退避序列不受影响。 */
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [collaborationMessage, setCollaborationMessage] = useState("未连接时不会上传或覆盖工程");
  const hasStoredRoomAccess = Boolean(roomInput.trim() && loadBrowserValue(
    () => window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${roomInput.trim().toUpperCase()}`),
    null,
  ));

  const optionsRef = useRef(options);
  const receiveRoomUpdateRef = useRef<(room: CollaborationRoom<ProjectPackage>) => void>(() => undefined);
  const backfillRef = useRef<(reason: CollaborationBackfillReason) => Promise<void>>(() => Promise.resolve());
  /** 房间关闭是终局状态:重连回调在渲染之外运行,只能通过 ref 读到最新值。 */
  const roomClosedRef = useRef(false);
  /** 房间过期/凭证失效同样是终局状态,判据同上。 */
  const roomExpiredRef = useRef(false);
  /** 离线态的最新值:`online` 监听与请求回调都在渲染之外运行。 */
  const offlineRef = useRef(false);
  /** 最近一次渲染出去的状态,`online` 监听据此判断值不值得打断一条健康的流。 */
  const statusRef = useRef<RoomCollaborationStatus>("idle");
  /** 网络恢复触发的重挂:补齐要等新订阅装好再发,否则会被 effect 清理里的 abort 掐掉。 */
  const healPendingRef = useRef(false);
  /**
   * 当前房间所有在途请求的取消信号。切换房间或卸载时必须 abort:分区下的补齐请求可能挂几十秒,
   * 迟到的响应会把上一个房间的区间套用到新房间上,而且 backfillInFlightRef 会一直卡在 true。
   */
  const roomRequestsRef = useRef<AbortController | null>(null);
  useEffect(() => {
    optionsRef.current = options;
    statusRef.current = collaborationStatus;
  });

  const roomSignal = (): AbortSignal => {
    if (!roomRequestsRef.current) roomRequestsRef.current = new AbortController();
    return roomRequestsRef.current.signal;
  };

  // 只依赖 ref,可以安全地作为 effect 依赖。
  const abortRoomRequests = useCallback(() => {
    roomRequestsRef.current?.abort();
    roomRequestsRef.current = null;
    backfillInFlightRef.current = false;
  }, [backfillInFlightRef]);

  /** 终局:重连、补齐、重试都不会让房间回来,任何"正在自动重连"的说法都不能再覆盖它。 */
  const isTerminal = (): boolean => roomClosedRef.current || roomExpiredRef.current;

  const markRoomClosed = () => {
    roomClosedRef.current = true;
    offlineRef.current = false;
    setRoomClosed(true);
    setCollaborationStatus("closed");
    setCollaborationOfflineState(false);
    setCollaborationMessage(TERMINAL_ROOM_MESSAGE.ROOM_CLOSED);
  };

  /**
   * 房间已过期/已失效:订阅早已被终局码停掉,这里把 UI 也带到终局,并丢掉本机存的房间凭证——
   * 它已经打不开任何房间,留着只会让"加入"按钮继续给出误导性的可点状态。
   */
  const markRoomExpired = (
    reason: Exclude<SubscribeTerminalReason, "ROOM_CLOSED">,
    /** 要一并忘掉凭证的房间;加入失败时目标房间还不是当前房间,由调用方指明。 */
    expiredRoomId: string | null = roomRef.current,
  ) => {
    if (isTerminal()) return;
    roomExpiredRef.current = true;
    offlineRef.current = false;
    if (expiredRoomId) forgetRoomAccess(expiredRoomId);
    setRoomExpired(true);
    setCollaborationStatus("error");
    setCollaborationOfflineState(false);
    setCollaborationMessage(TERMINAL_ROOM_MESSAGE[reason]);
  };

  /** 传输层失败:保留本地状态,只把"离线"标出来,重连/重试仍在继续。 */
  const markOffline = () => {
    if (isTerminal()) return;
    offlineRef.current = true;
    setCollaborationOfflineState(true);
    setCollaborationStatus("error");
    setCollaborationMessage(OFFLINE_MESSAGE);
  };

  /** 只有订阅确实还在重连时才这么说;终局房间不会再有下一次连接。 */
  const markReconnecting = () => {
    if (isTerminal()) return;
    setCollaborationStatus("error");
    setCollaborationMessage("连接中断，正在自动重连");
  };

  const markOnline = () => {
    if (!offlineRef.current) return;
    offlineRef.current = false;
    setCollaborationOfflineState(false);
    // 恢复计数只在真正的"离线 → 在线"跳变时前进,调用方才能按次数重发,而不是每次成功请求都重发。
    setConnectionHealCount((count) => count + 1);
  };

  const applyRemoteInterval = (operations: CollaborationOperation[], version: number) => {
    if (operations.length > 0 && baselineRef.current) {
      const { currentPackage, applyPackage } = optionsRef.current;
      const current = currentPackage(baselineRef.current.exportedAt);
      const rebased = rebaseRemoteCollaborationOperations(baselineRef.current, current, operations);
      baselineRef.current = rebased.baseline;
      suppressSendRef.current = true;
      applyPackage(rebased.current, version);
      baselineRef.current = rebased.baseline;
    }
    // ref 与 state 必须一起推进:只写 ref 会让协作面板停在旧版本号。
    versionRef.current = version;
    setRoomVersion(version);
  };

  const backfillCollaborationGap = async (reason: CollaborationBackfillReason) => {
    const activeRoomId = roomRef.current;
    const activeToken = accessTokenRef.current;
    if (!activeRoomId || !activeToken || backfillInFlightRef.current) return;
    // 终局房间没有可补齐的东西:再发一轮请求只会把终局提示覆盖成"正在同步"。
    if (isTerminal()) return;
    backfillInFlightRef.current = true;
    if (reason === "disconnect") {
      setCollaborationStatus("error");
    } else {
      setCollaborationStatus("syncing");
      setCollaborationMessage(BACKFILL_START_MESSAGE[reason]);
    }
    const afterVersion = versionRef.current;
    const signal = roomSignal();
    try {
      const interval = await fetchRoomOperations(activeRoomId, activeToken, afterVersion, { signal });
      // 补齐期间订阅可能已经因终局码停掉,这一份区间不该把 UI 拉回"已连接"。
      if (isTerminal()) return;
      markOnline();
      // 补齐期间流上可能已经落地了更新的事件,或服务端返回了比本地更旧的版本。
      // 这份区间是相对 afterVersion 的,拿去套用会重复应用甚至回退版本,直接丢弃。
      if (versionRef.current !== afterVersion || interval.version <= afterVersion) {
        setCollaborationStatus("connected");
        setCollaborationMessage("远端没有需要补齐的修改");
        return;
      }
      applyRemoteInterval(interval.operations, interval.version);
      setCollaborationStatus("connected");
      setCollaborationMessage(BACKFILL_DONE_MESSAGE[reason]);
    } catch (error) {
      // 房间已切换或组件已卸载:这份补齐属于上一个房间,任何状态更新都是错的。
      if (isCollaborationAbortError(error)) return;
      if (error instanceof CollaborationClientError && error.code === "ROOM_CLOSED") {
        markRoomClosed();
        return;
      }
      // 房间没了/凭证失效:补齐再多次也拿不回来,直接进终局,不许再承诺重连。
      if (error instanceof CollaborationClientError && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_FORBIDDEN")) {
        markRoomExpired(error.code);
        return;
      }
      if (isCollaborationTransportError(error)) {
        markOffline();
        return;
      }
      if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
        try {
          const room = await fetchRoom<ProjectPackage>(activeRoomId, activeToken, { signal });
          if (isTerminal()) return;
          markOnline();
          if (room.closed) {
            markRoomClosed();
            return;
          }
          if (room.snapshot && room.version > versionRef.current) {
            suppressSendRef.current = true;
            baselineRef.current = optionsRef.current.applyPackage(room.snapshot, room.version);
            versionRef.current = room.version;
            setRoomVersion(room.version);
            setCollaborationStatus("connected");
            setCollaborationMessage("已重新加载完整快照");
          }
        } catch (retryError) {
          if (isCollaborationAbortError(retryError)) return;
          if (isCollaborationTransportError(retryError)) {
            markOffline();
            return;
          }
          if (retryError instanceof CollaborationClientError && (retryError.code === "ROOM_NOT_FOUND" || retryError.code === "ROOM_FORBIDDEN")) {
            markRoomExpired(retryError.code);
            return;
          }
          markReconnecting();
        }
      } else {
        markReconnecting();
      }
    } finally {
      backfillInFlightRef.current = false;
    }
  };

  const receiveRoomUpdate = (room: CollaborationRoom<ProjectPackage>) => {
    if (room.members) setRoomMembers(room.members);
    if (room.readonly !== undefined) setRoomReadonly(room.readonly);
    if (room.closed) markRoomClosed();
    if (room.version <= versionRef.current) return;
    // 增量只有严格接在本地版本之后才能套用。version 跳变说明中间的事务没送到本端:
    // 直接应用最后一笔 ops 会静默丢掉中间事务,而且之后的上传都基于跳变后的版本,
    // 服务端不会再判 VERSION_CONFLICT,两端从此永久分叉。跳变时改走整包快照,
    // 没有快照就拉区间补齐,绝不半应用。
    const contiguous = room.version === versionRef.current + 1;
    if (room.operations && !contiguous && !room.snapshot) {
      // 补齐自己会推进 versionRef/roomVersion,这里不能先把版本记成跳变后的值。
      void backfillRef.current("gap");
      return;
    }
    if (room.operations && contiguous && baselineRef.current) {
      applyRemoteInterval(room.operations, room.version);
    } else if (room.snapshot) {
      suppressSendRef.current = true;
      baselineRef.current = optionsRef.current.applyPackage(room.snapshot, room.version);
      versionRef.current = room.version;
      setRoomVersion(room.version);
    } else {
      versionRef.current = room.version;
      setRoomVersion(room.version);
    }
    if (roomClosedRef.current) return;
    // 流上收到任何一条事件都证明连接已经回来了,离线态到此为止。
    markOnline();
    setCollaborationStatus("connected");
    setCollaborationMessage(room.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
  };

  useEffect(() => {
    receiveRoomUpdateRef.current = receiveRoomUpdate;
    backfillRef.current = backfillCollaborationGap;
  });

  useEffect(() => {
    if (!roomId || !roomAccessToken) return;
    roomRef.current = roomId;
    accessTokenRef.current = roomAccessToken;
    const unsubscribe = subscribeRoom<ProjectPackage>(roomId, roomAccessToken, (room) => receiveRoomUpdateRef.current(room), () => {
      void backfillRef.current("disconnect");
    }, {
      // 函数形式:每次重连都用当前版本续传,补齐之后不会再从旧版本重放。
      version: () => versionRef.current,
      shouldReconnect: () => !isTerminal(),
      onMembers: (members) => setRoomMembers(members),
      onClosed: () => {
        setRoomReadonly(true);
        markRoomClosed();
      },
      onTerminal: (reason) => {
        if (reason === "ROOM_CLOSED") markRoomClosed();
        else markRoomExpired(reason);
      },
      signal: roomSignal(),
    });
    // 网络恢复重挂的这条流不带断线期间的增量:补齐必须在订阅装好之后发,
    // 才不会被上一轮 effect 清理里的 abort 掐掉。
    if (healPendingRef.current) {
      healPendingRef.current = false;
      void backfillRef.current("online");
    }
    return () => {
      unsubscribe();
      // 换房间/卸载时把在途补齐一并取消,迟到的响应不会落到下一个房间上。
      abortRoomRequests();
    };
    // applyPackage/currentPackage are re-created each render; re-subscribing the
    // SSE stream on every render would churn connections. Handlers run from refs
    // so the stream only depends on room identity/token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomAccessToken, roomId, reconnectNonce]);

  /**
   * 浏览器报告网络恢复时,退避可能还剩十几秒。这里不碰 `subscribeRoom` 的退避序列,
   * 而是重挂一条新订阅(立即申请 ticket)并补齐断线期间的增量。健康的连接不打断,
   * 终局房间也不会被"恢复"回来。
   */
  useEffect(() => {
    const nudge = () => {
      if (!roomRef.current || !accessTokenRef.current) return;
      if (isTerminal()) return;
      if (!offlineRef.current && statusRef.current !== "error") return;
      healPendingRef.current = true;
      setReconnectNonce((nonce) => nonce + 1);
    };
    window.addEventListener("online", nudge);
    return () => window.removeEventListener("online", nudge);
    // ref 与 setState 恒定,监听只需装一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加入/创建失败时还没有订阅可清理,卸载仍然要掐掉在途的握手请求。
  useEffect(() => () => abortRoomRequests(), [abortRoomRequests]);

  /** 重新建房/重新加入是唯一能离开终局态的出口。 */
  const clearTerminalState = () => {
    roomExpiredRef.current = false;
    roomClosedRef.current = false;
    setRoomExpired(false);
    setRoomClosed(false);
  };

  const startCollaborationRoom = async () => {
    abortRoomRequests();
    clearTerminalState();
    const signal = roomSignal();
    setCollaborationStatus("connecting");
    setCollaborationMessage("正在创建房间");
    try {
      const allocated = await createRoom<ProjectPackage>({ clientId, displayName: COLLABORATION_DISPLAY_NAME, signal });
      const { room, access } = allocated;
      roomClosedRef.current = room.closed ?? false;
      persistRoomAccess(room.id, access.accessToken);
      setRoomId(room.id);
      setRoomAccessToken(access.accessToken);
      setRoomRole(access.role);
      setRoomParticipants([{ id: access.participantId, displayName: access.displayName, role: access.role }]);
      setRoomMembers(room.members ?? [{ clientId, role: "owner", joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }]);
      setRoomReadonly(room.readonly ?? false);
      setRoomClosed(room.closed ?? false);
      setRoomInput(room.id);
      roomRef.current = room.id;
      accessTokenRef.current = access.accessToken;
      versionRef.current = room.version;
      baselineRef.current = optionsRef.current.currentPackage();
      const ready = await submitRoomSnapshot(room.id, access.accessToken, {
        txId: createId("collab-init"),
        clientId,
        baseVersion: room.version,
        snapshot: baselineRef.current,
      }, { signal });
      versionRef.current = ready.version;
      setRoomVersion(ready.version);
      markOnline();
      setCollaborationStatus("connected");
      setCollaborationMessage("房间已创建，后续仅同步增量修改");
    } catch (error) {
      if (isCollaborationAbortError(error)) return;
      if (isCollaborationTransportError(error)) {
        markOffline();
        return;
      }
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建协作房间失败");
    }
  };

  const joinCollaborationRoom = async () => {
    const normalizedRoomId = roomInput.trim().toUpperCase();
    if (!normalizedRoomId) return;
    const persistedToken = storedRoomAccess(normalizedRoomId);
    if (!inviteTokenInput.trim() && !persistedToken) return;
    abortRoomRequests();
    clearTerminalState();
    const signal = roomSignal();
    setCollaborationStatus("connecting");
    setCollaborationMessage(persistedToken ? "正在恢复房间访问" : "正在验证邀请凭证");
    try {
      const access = persistedToken
        ? { accessToken: persistedToken, role: null }
        : await joinRoom<ProjectPackage>({
          roomId: normalizedRoomId,
          inviteToken: inviteTokenInput.trim(),
          clientId,
          displayName: COLLABORATION_DISPLAY_NAME,
          signal,
        }).then((joined) => joined.access);
      const room = await retryInitializingRoom(() => fetchRoom<ProjectPackage>(normalizedRoomId, access.accessToken, { signal }));
      if (!room.snapshot) throw new Error("房间工程数据不完整");
      markOnline();
      roomClosedRef.current = room.closed ?? false;
      persistRoomAccess(normalizedRoomId, access.accessToken);
      setRoomId(normalizedRoomId);
      setRoomAccessToken(access.accessToken);
      setRoomRole(room.role ?? access.role);
      setRoomParticipants(room.participants ?? []);
      setRoomMembers(room.members ?? []);
      setRoomReadonly(room.readonly ?? false);
      setRoomClosed(room.closed ?? false);
      setInviteTokenInput("");
      roomRef.current = normalizedRoomId;
      accessTokenRef.current = access.accessToken;
      suppressSendRef.current = true;
      baselineRef.current = optionsRef.current.applyPackage(room.snapshot, room.version);
      versionRef.current = room.version;
      if (room.closed) {
        setCollaborationStatus("closed");
        setCollaborationMessage("房间已关闭，无法继续同步或编辑");
      } else {
        setCollaborationStatus("connected");
        setCollaborationMessage("已加入房间，后续仅同步增量修改");
      }
    } catch (error) {
      if (isCollaborationAbortError(error)) return;
      // 分区不是凭证问题:绝不能借此把本地保存的房间凭证清掉。
      if (isCollaborationTransportError(error)) {
        markOffline();
        return;
      }
      if (error instanceof CollaborationClientError && (error.code === "ROOM_FORBIDDEN" || error.code === "ROOM_NOT_FOUND")) {
        // 房间不存在/凭证失效是终局:面板要说清楚该重新建房或换一张邀请凭证。
        // 忘掉的只能是这次要加入的房间,当前房间(如果有)的凭证与这次失败无关。
        markRoomExpired(error.code, normalizedRoomId);
        return;
      }
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "加入协作房间失败");
    }
  };

  const createCollaborationInvitation = async (role: Exclude<CollaborationRole, "owner">) => {
    if (!roomId || !roomAccessToken) return;
    try {
      const invitation = await createRoomInvitation(roomId, roomAccessToken, role, { signal: roomSignal() });
      markOnline();
      setInvitationToken(invitation.token);
      setCollaborationMessage(`已生成${role === "editor" ? "编辑" : "查看"}邀请凭证，请通过私密渠道发送`);
    } catch (error) {
      if (isCollaborationAbortError(error)) return;
      if (isCollaborationTransportError(error)) {
        markOffline();
        return;
      }
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建邀请失败");
    }
  };

  const leaveCollaborationRoom = () => {
    if (roomId && roomAccessToken) {
      // 不挂房间信号:告知服务端"我走了"是尽力而为的告别请求,不能被紧随其后的 abort 掐掉。
      void leaveRoom(roomId, roomAccessToken, clientId).catch(() => {
        // Leaving is best-effort; local state is cleared regardless.
      });
    }
    abortRoomRequests();
    if (roomId) forgetRoomAccess(roomId);
    setRoomId(null);
    setRoomAccessToken(null);
    setRoomRole(null);
    setRoomParticipants([]);
    setRoomMembers([]);
    setRoomReadonly(false);
    setRoomClosed(false);
    setRoomExpired(false);
    roomClosedRef.current = false;
    roomExpiredRef.current = false;
    setInvitationToken(null);
    roomRef.current = null;
    accessTokenRef.current = null;
    baselineRef.current = null;
    versionRef.current = 0;
    setRoomVersion(0);
    setCollaborationStatus("idle");
    // 主动断开不是"恢复":直接清位,不推进恢复计数,免得触发一次没有房间的重发。
    offlineRef.current = false;
    setCollaborationOfflineState(false);
    setCollaborationMessage("已断开；未连接时不会上传或覆盖工程");
  };

  const setCollaborationRoomAccess = async (action: RoomAccessAction) => {
    if (!roomId || !roomAccessToken) return;
    setCollaborationStatus("syncing");
    try {
      const updated = await setRoomAccess(roomId, roomAccessToken, clientId, action, { signal: roomSignal() });
      markOnline();
      setRoomReadonly(updated.readonly ?? false);
      if (updated.closed) {
        markRoomClosed();
      } else {
        setCollaborationStatus("connected");
        setCollaborationMessage(updated.readonly ? "房间已设为只读" : "房间已恢复可编辑");
      }
    } catch (error) {
      if (isCollaborationAbortError(error)) return;
      if (isCollaborationTransportError(error)) {
        markOffline();
        return;
      }
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "设置房间访问失败");
    }
  };

  const canEdit = roomRole !== "viewer" && !roomReadonly && !roomClosed;

  // Plain functions (not useCallback) so every render sees fresh room state.
  const startRoom = () => {
    void startCollaborationRoom();
  };

  const joinRoomAction = () => {
    void joinCollaborationRoom();
  };

  const createInvitation = (role: Exclude<CollaborationRole, "owner">) => {
    void createCollaborationInvitation(role);
  };

  const leaveRoomAction = () => {
    leaveCollaborationRoom();
  };

  const setAccess = (action: RoomAccessAction) => {
    void setCollaborationRoomAccess(action);
  };

  const setCollaborationOffline = (offline: boolean) => {
    if (offline) markOffline();
    else markOnline();
  };

  const reportTerminalRejection = (code: string): boolean => {
    const reason = terminalRejectionReason(code);
    if (!reason) return false;
    // 已经在终局里:第一个终局码才是成因,在途请求带回来的第二个不该把提示改写成另一种说法。
    if (isTerminal()) return true;
    if (reason === "ROOM_CLOSED") markRoomClosed();
    else markRoomExpired(reason);
    return true;
  };

  return {
    roomId,
    roomAccessToken,
    roomRole,
    roomParticipants,
    roomMembers,
    roomReadonly,
    roomClosed,
    roomExpired,
    invitationToken,
    roomVersion,
    collaborationStatus,
    collaborationOffline,
    connectionHealCount,
    collaborationMessage,
    collaborationOpen,
    roomInput,
    inviteTokenInput,
    hasStoredRoomAccess,
    canEdit,
    setRoomVersion,
    setCollaborationStatus,
    setCollaborationOffline,
    reportTerminalRejection,
    setCollaborationMessage,
    setCollaborationOpen,
    setRoomInput,
    setInviteTokenInput,
    startRoom,
    joinRoom: joinRoomAction,
    createInvitation,
    leaveRoom: leaveRoomAction,
    setAccess,
  };
}
