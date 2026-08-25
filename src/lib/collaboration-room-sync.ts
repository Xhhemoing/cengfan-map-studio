import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  CollaborationClientError,
  fetchRoom,
  fetchRoomOperations,
  subscribeRoom,
  type CollaborationRoom,
  type RoomMember,
} from "./collaboration-client";
import { rebaseRemoteCollaborationOperations } from "./collaboration-operations";
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

interface UseCollaborationRoomSyncOptions extends UseCollaborationRoomRefs {
  roomId: string | null;
  roomAccessToken: string | null;
  currentPackage: (exportedAt?: string) => ProjectPackage;
  applyPackage: (pack: ProjectPackage, version: number) => ProjectPackage;
  setRoomMembers: Dispatch<SetStateAction<RoomMember[]>>;
  setRoomReadonly: Dispatch<SetStateAction<boolean>>;
  setRoomClosed: Dispatch<SetStateAction<boolean>>;
  setRoomVersion: Dispatch<SetStateAction<number>>;
  setCollaborationStatus: Dispatch<SetStateAction<RoomCollaborationStatus>>;
  setCollaborationMessage: Dispatch<SetStateAction<string>>;
}

type CollaborationRoomPackageOptions = Pick<UseCollaborationRoomSyncOptions, "currentPackage" | "applyPackage">;

export function useCollaborationRoomSync(
  options: UseCollaborationRoomSyncOptions,
): MutableRefObject<CollaborationRoomPackageOptions> {
  const {
    roomId,
    roomAccessToken,
    baselineRef,
    versionRef,
    roomRef,
    accessTokenRef,
    suppressSendRef,
    backfillInFlightRef,
    setRoomMembers,
    setRoomReadonly,
    setRoomClosed,
    setRoomVersion,
    setCollaborationStatus,
    setCollaborationMessage,
  } = options;
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

  return optionsRef;
}
