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
} from "./collaboration-client";
import { rebaseRemoteCollaborationOperations, type CollaborationOperation } from "./collaboration-operations";
import { createId } from "./ids";
import type { ProjectPackage } from "./project-package";

export type RoomCollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error" | "closed";

/**
 * 补齐触发场景:
 * - `disconnect`:SSE 断流后补齐,过程中先落到 `error`(重连由 `subscribeRoom` 自己接管);
 * - `gap`:流上的 version 跳变,连接本身没断,所以全程保持 `syncing`。
 */
export type CollaborationBackfillReason = "disconnect" | "gap";

const BACKFILL_DONE_MESSAGE: Record<CollaborationBackfillReason, string> = {
  disconnect: "已补齐断线期间的修改",
  gap: "已补齐跳过的远端修改",
};

/**
 * 网络分区与"服务端拒绝"是两种完全不同的处境:前者本地修改仍然有效、等网络回来就能续上,
 * 后者(房间关闭、无权限、版本冲突)重试再多也没用。`collaborationOffline` 把前者单独标出来,
 * 面板才能给出"仍在重试、改动不会丢"的说法,而不是笼统的一个错误态。
 */
const OFFLINE_MESSAGE = "网络已断开，本地修改会保留，恢复后自动续传";

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
  invitationToken: string | null;
  roomVersion: number;
  collaborationStatus: RoomCollaborationStatus;
  /** 传输层不可达(超时/断网/网关错误)时为真;协议层拒绝不会置位。 */
  collaborationOffline: boolean;
  collaborationMessage: string;
  collaborationOpen: boolean;
  roomInput: string;
  inviteTokenInput: string;
  hasStoredRoomAccess: boolean;
  canEdit: boolean;
  setRoomVersion: (version: number) => void;
  setCollaborationStatus: (status: RoomCollaborationStatus) => void;
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
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [roomVersion, setRoomVersion] = useState(0);
  const [collaborationStatus, setCollaborationStatus] = useState<RoomCollaborationStatus>("idle");
  const [collaborationOffline, setCollaborationOffline] = useState(false);
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
  /**
   * 当前房间所有在途请求的取消信号。切换房间或卸载时必须 abort:分区下的补齐请求可能挂几十秒,
   * 迟到的响应会把上一个房间的区间套用到新房间上,而且 backfillInFlightRef 会一直卡在 true。
   */
  const roomRequestsRef = useRef<AbortController | null>(null);
  useEffect(() => {
    optionsRef.current = options;
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

  const markRoomClosed = () => {
    roomClosedRef.current = true;
    setRoomClosed(true);
    setCollaborationStatus("closed");
    setCollaborationOffline(false);
    setCollaborationMessage("房间已关闭，无法继续同步或编辑");
  };

  /** 传输层失败:保留本地状态,只把"离线"标出来,重连/重试仍在继续。 */
  const markOffline = () => {
    setCollaborationOffline(true);
    setCollaborationStatus("error");
    setCollaborationMessage(OFFLINE_MESSAGE);
  };

  const markOnline = () => {
    setCollaborationOffline(false);
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
    backfillInFlightRef.current = true;
    if (reason === "disconnect") {
      setCollaborationStatus("error");
    } else {
      setCollaborationStatus("syncing");
      setCollaborationMessage("远端版本不连续，正在补齐缺失的修改");
    }
    const afterVersion = versionRef.current;
    const signal = roomSignal();
    try {
      const interval = await fetchRoomOperations(activeRoomId, activeToken, afterVersion, { signal });
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
      if (isCollaborationTransportError(error)) {
        markOffline();
        return;
      }
      if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
        try {
          const room = await fetchRoom<ProjectPackage>(activeRoomId, activeToken, { signal });
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
          setCollaborationStatus("error");
          setCollaborationMessage("连接中断，正在自动重连");
        }
      } else {
        setCollaborationStatus("error");
        setCollaborationMessage("连接中断，正在自动重连");
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
      shouldReconnect: () => !roomClosedRef.current,
      onMembers: (members) => setRoomMembers(members),
      onClosed: () => {
        setRoomReadonly(true);
        markRoomClosed();
      },
      signal: roomSignal(),
    });
    return () => {
      unsubscribe();
      // 换房间/卸载时把在途补齐一并取消,迟到的响应不会落到下一个房间上。
      abortRoomRequests();
    };
    // applyPackage/currentPackage are re-created each render; re-subscribing the
    // SSE stream on every render would churn connections. Handlers run from refs
    // so the stream only depends on room identity/token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomAccessToken, roomId]);

  // 加入/创建失败时还没有订阅可清理,卸载仍然要掐掉在途的握手请求。
  useEffect(() => () => abortRoomRequests(), [abortRoomRequests]);

  const storedRoomAccess = (id: string): string | null => loadBrowserValue(
    () => window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`),
    null,
  );

  const persistRoomAccess = (id: string, accessToken: string) => {
    try {
      window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`, accessToken);
    } catch {
      // The active connection remains usable when browser storage is unavailable.
    }
  };

  const forgetRoomAccess = (id: string) => {
    try {
      window.localStorage.removeItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`);
    } catch {
      // Local project data is intentionally untouched when credentials cannot be cleared.
    }
  };

  const startCollaborationRoom = async () => {
    abortRoomRequests();
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
        forgetRoomAccess(normalizedRoomId);
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
    roomClosedRef.current = false;
    setInvitationToken(null);
    roomRef.current = null;
    accessTokenRef.current = null;
    baselineRef.current = null;
    versionRef.current = 0;
    setRoomVersion(0);
    setCollaborationStatus("idle");
    setCollaborationOffline(false);
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

  return {
    roomId,
    roomAccessToken,
    roomRole,
    roomParticipants,
    roomMembers,
    roomReadonly,
    roomClosed,
    invitationToken,
    roomVersion,
    collaborationStatus,
    collaborationOffline,
    collaborationMessage,
    collaborationOpen,
    roomInput,
    inviteTokenInput,
    hasStoredRoomAccess,
    canEdit,
    setRoomVersion,
    setCollaborationStatus,
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
