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
import { useEffect, useRef, useState, type MutableRefObject } from "react";
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
import { rebaseRemoteCollaborationOperations } from "./collaboration-operations";
import { createId } from "./ids";
import type { ProjectPackage } from "./project-package";

export type RoomCollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error" | "closed";

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
  const [collaborationMessage, setCollaborationMessage] = useState("未连接时不会上传或覆盖工程");
  const hasStoredRoomAccess = Boolean(roomInput.trim() && loadBrowserValue(
    () => window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${roomInput.trim().toUpperCase()}`),
    null,
  ));

  const optionsRef = useRef(options);
  const receiveRoomUpdateRef = useRef<(room: CollaborationRoom<ProjectPackage>) => void>(() => undefined);
  useEffect(() => {
    optionsRef.current = options;
  });

  const receiveRoomUpdate = (room: CollaborationRoom<ProjectPackage>) => {
    if (room.members) setRoomMembers(room.members);
    if (room.readonly !== undefined) setRoomReadonly(room.readonly);
    if (room.closed) {
      setRoomClosed(true);
      setCollaborationStatus("closed");
      setCollaborationMessage("房间已关闭，无法继续同步或编辑");
    }
    if (room.version <= versionRef.current) return;
    if (room.operations && baselineRef.current) {
      const { currentPackage, applyPackage } = optionsRef.current;
      const current = currentPackage(baselineRef.current.exportedAt);
      const rebased = rebaseRemoteCollaborationOperations(baselineRef.current, current, room.operations);
      baselineRef.current = rebased.baseline;
      suppressSendRef.current = true;
      applyPackage(rebased.current, room.version);
      versionRef.current = room.version;
      baselineRef.current = rebased.baseline;
    } else if (room.snapshot) {
      suppressSendRef.current = true;
      baselineRef.current = optionsRef.current.applyPackage(room.snapshot, room.version);
      versionRef.current = room.version;
    } else {
      versionRef.current = room.version;
      setRoomVersion(room.version);
    }
    setCollaborationStatus("connected");
    setCollaborationMessage(room.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
  };

  useEffect(() => {
    receiveRoomUpdateRef.current = receiveRoomUpdate;
  });

  useEffect(() => {
    if (!roomId || !roomAccessToken) return;
    roomRef.current = roomId;
    accessTokenRef.current = roomAccessToken;
    const backfillCollaborationGap = async () => {
      const activeRoomId = roomRef.current;
      const activeToken = accessTokenRef.current;
      if (!activeRoomId || !activeToken || backfillInFlightRef.current) return;
      backfillInFlightRef.current = true;
      setCollaborationStatus("error");
      try {
        const interval = await fetchRoomOperations(activeRoomId, activeToken, versionRef.current);
        if (interval.operations.length > 0 && baselineRef.current) {
          const { currentPackage, applyPackage } = optionsRef.current;
          const current = currentPackage(baselineRef.current.exportedAt);
          const rebased = rebaseRemoteCollaborationOperations(baselineRef.current, current, interval.operations);
          baselineRef.current = rebased.baseline;
          suppressSendRef.current = true;
          applyPackage(rebased.current, interval.version);
          versionRef.current = interval.version;
          baselineRef.current = rebased.baseline;
        } else {
          versionRef.current = interval.version;
          setRoomVersion(interval.version);
        }
        setCollaborationStatus("connected");
        setCollaborationMessage("已补齐断线期间的修改");
      } catch (error) {
        if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
          try {
            const room = await fetchRoom<ProjectPackage>(activeRoomId, activeToken);
            if (room.snapshot) {
              suppressSendRef.current = true;
              baselineRef.current = optionsRef.current.applyPackage(room.snapshot, room.version);
              versionRef.current = room.version;
              setCollaborationStatus("connected");
              setCollaborationMessage("已重新加载完整快照");
            }
          } catch {
            setCollaborationStatus("error");
            setCollaborationMessage("连接中断，浏览器会自动尝试重连");
          }
        } else {
          setCollaborationStatus("error");
          setCollaborationMessage("连接中断，浏览器会自动尝试重连");
        }
      } finally {
        backfillInFlightRef.current = false;
      }
    };
    return subscribeRoom<ProjectPackage>(roomId, roomAccessToken, (room) => receiveRoomUpdateRef.current(room), () => {
      void backfillCollaborationGap();
    }, {
      version: versionRef.current,
      onMembers: (members) => setRoomMembers(members),
      onClosed: () => {
        setRoomClosed(true);
        setRoomReadonly(true);
        setCollaborationStatus("closed");
        setCollaborationMessage("房间已关闭，无法继续同步或编辑");
      },
    });
    // applyPackage/currentPackage are re-created each render; re-subscribing the
    // SSE stream on every render would churn connections. Handlers run from refs
    // so the stream only depends on room identity/token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomAccessToken, roomId]);

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
    setCollaborationStatus("connecting");
    setCollaborationMessage("正在创建房间");
    try {
      const allocated = await createRoom<ProjectPackage>({ clientId, displayName: COLLABORATION_DISPLAY_NAME });
      const { room, access } = allocated;
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
      });
      versionRef.current = ready.version;
      setRoomVersion(ready.version);
      setCollaborationStatus("connected");
      setCollaborationMessage("房间已创建，后续仅同步增量修改");
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建协作房间失败");
    }
  };

  const joinCollaborationRoom = async () => {
    const normalizedRoomId = roomInput.trim().toUpperCase();
    if (!normalizedRoomId) return;
    const persistedToken = storedRoomAccess(normalizedRoomId);
    if (!inviteTokenInput.trim() && !persistedToken) return;
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
        }).then((joined) => joined.access);
      const room = await retryInitializingRoom(() => fetchRoom<ProjectPackage>(normalizedRoomId, access.accessToken));
      if (!room.snapshot) throw new Error("房间工程数据不完整");
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
      const invitation = await createRoomInvitation(roomId, roomAccessToken, role);
      setInvitationToken(invitation.token);
      setCollaborationMessage(`已生成${role === "editor" ? "编辑" : "查看"}邀请凭证，请通过私密渠道发送`);
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建邀请失败");
    }
  };

  const leaveCollaborationRoom = () => {
    if (roomId && roomAccessToken) {
      void leaveRoom(roomId, roomAccessToken, clientId).catch(() => {
        // Leaving is best-effort; local state is cleared regardless.
      });
    }
    if (roomId) forgetRoomAccess(roomId);
    setRoomId(null);
    setRoomAccessToken(null);
    setRoomRole(null);
    setRoomParticipants([]);
    setRoomMembers([]);
    setRoomReadonly(false);
    setRoomClosed(false);
    setInvitationToken(null);
    roomRef.current = null;
    accessTokenRef.current = null;
    baselineRef.current = null;
    versionRef.current = 0;
    setRoomVersion(0);
    setCollaborationStatus("idle");
    setCollaborationMessage("已断开；未连接时不会上传或覆盖工程");
  };

  const setCollaborationRoomAccess = async (action: RoomAccessAction) => {
    if (!roomId || !roomAccessToken) return;
    setCollaborationStatus("syncing");
    try {
      const updated = await setRoomAccess(roomId, roomAccessToken, clientId, action);
      setRoomReadonly(updated.readonly ?? false);
      if (updated.closed) {
        setRoomClosed(true);
        setCollaborationStatus("closed");
        setCollaborationMessage("房间已关闭，无法继续同步或编辑");
      } else {
        setCollaborationStatus("connected");
        setCollaborationMessage(updated.readonly ? "房间已设为只读" : "房间已恢复可编辑");
      }
    } catch (error) {
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
