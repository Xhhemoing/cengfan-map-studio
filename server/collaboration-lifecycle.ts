import { CollaborationError } from "./collaboration-error";
import type {
  CollaborationCapability,
  CollaborationRole,
  CollaborationRoom,
  CreatedRoom,
  LifecycleEvent,
  RoomAccess,
  RoomCreator,
  RoomInvitation,
  RoomJoinRequest,
  RoomMember,
  RoomParticipant,
} from "./collaboration-types";
import type { PersistedInvitationRecord, PersistedRevokedAccessRecord } from "./collaboration-snapshot-store";
import {
  assertSnapshotSize,
  publicParticipant,
  tokenHash,
  tokenMatches,
} from "./collaboration-utils";

export type LifecycleListener = (event: LifecycleEvent) => void;

interface RoomLifecycleContext {
  rooms: Map<string, CollaborationRoom>;
  lifecycleListeners: Map<string, Set<LifecycleListener>>;
  accessRecords: Map<string, Map<string, RoomParticipant>>;
  revokedAccessRecords: Map<string, Map<string, PersistedRevokedAccessRecord>>;
  invitations: Map<string, Map<string, PersistedInvitationRecord>>;
  legacyRoomIds: Set<string>;
  maxRooms: number;
  maxSnapshotBytes: number;
  invitationTtlMs: number;
  generateId: () => string;
  generateSecret: () => string;
  now: () => number;
  purgeExpired: () => void;
  initializeRoomState: (id: string) => void;
  touch: (id: string) => void;
  persistRoom: (id: string) => void;
}

const MAX_REVOKED_ACCESS_RECORDS = 256;

const copyRoom = <T>(room: CollaborationRoom<T>): CollaborationRoom<T> => ({ ...room });

const membersOf = (room: CollaborationRoom): RoomMember[] =>
  room.members.map((member) => ({ ...member }));

export function createRoomLifecycle(context: RoomLifecycleContext) {
  const {
    rooms,
    lifecycleListeners,
    accessRecords,
    revokedAccessRecords,
    invitations,
    legacyRoomIds,
    maxRooms,
    maxSnapshotBytes,
    invitationTtlMs,
    generateId,
    generateSecret,
    now,
    purgeExpired,
    initializeRoomState,
    touch,
    persistRoom,
  } = context;

  const notifyLifecycle = (
    key: string,
    kind: "members" | "access" | "closed",
    room: CollaborationRoom,
  ) => {
    const event: LifecycleEvent = { kind, room: copyRoom(room), members: membersOf(room) };
    lifecycleListeners.get(key)?.forEach((listener) => listener(event));
  };

  const findParticipant = (id: string, accessToken: string): RoomParticipant => {
    const key = id.toUpperCase();
    const records = accessRecords.get(key);
    if (!records) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    for (const [accessTokenHash, participant] of records) {
      if (tokenMatches(accessToken, accessTokenHash)) return participant;
    }
    throw new CollaborationError("ROOM_FORBIDDEN", "房间访问凭证无效");
  };

  const matchingTokenHash = <T>(
    records: Map<string, T> | undefined,
    accessToken: string,
  ): string | undefined => {
    for (const hash of records?.keys() ?? []) {
      if (tokenMatches(accessToken, hash)) return hash;
    }
    return undefined;
  };

  const authorize = (
    id: string,
    accessToken: string,
    capability: CollaborationCapability,
  ): RoomParticipant => {
    purgeExpired();
    const key = id.toUpperCase();
    if (!rooms.has(key)) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const participant = findParticipant(key, accessToken);
    const allowed = capability === "read"
      || (capability === "write" && participant.role !== "viewer")
      || (capability === "invite" && participant.role === "owner");
    if (!allowed) throw new CollaborationError("ROOM_FORBIDDEN", "当前协作角色没有该操作权限");
    touch(key);
    persistRoom(key);
    return publicParticipant(participant);
  };

  const create = <T>(
    snapshot: T | undefined,
    creator: string | RoomCreator,
  ): CollaborationRoom<T> | CreatedRoom<T> => {
    purgeExpired();
    if (rooms.size >= maxRooms) {
      throw new CollaborationError("ROOM_LIMIT_REACHED", "共享房间数量已达到上限");
    }
    let id = generateId().toUpperCase();
    while (rooms.has(id)) id = generateId().toUpperCase();
    const normalizedCreator: RoomCreator = typeof creator === "string"
      ? { clientId: creator, displayName: creator }
      : creator;
    if (!normalizedCreator.clientId || !normalizedCreator.displayName) {
      throw new CollaborationError("INVALID_TRANSACTION", "创建者信息无效");
    }
    assertSnapshotSize(snapshot, maxSnapshotBytes);
    const joinedAt = new Date(now()).toISOString();
    const room: CollaborationRoom<T> = {
      id,
      version: 0,
      ...(snapshot === undefined ? {} : { snapshot: structuredClone(snapshot) }),
      ready: snapshot !== undefined,
      createdBy: normalizedCreator.clientId,
      updatedBy: normalizedCreator.clientId,
      updatedAt: joinedAt,
      members: [{
        clientId: normalizedCreator.clientId,
        role: "owner",
        joinedAt,
        lastSeenAt: joinedAt,
      }],
    };
    const accessToken = generateSecret();
    const access: RoomAccess = {
      id: normalizedCreator.clientId,
      participantId: normalizedCreator.clientId,
      displayName: normalizedCreator.displayName,
      role: "owner",
      accessToken,
    };
    rooms.set(id, room);
    accessRecords.set(id, new Map([[tokenHash(accessToken), publicParticipant(access)]]));
    revokedAccessRecords.set(id, new Map());
    invitations.set(id, new Map());
    initializeRoomState(id);
    if (typeof creator === "string") legacyRoomIds.add(id);
    touch(id);
    persistRoom(id);
    notifyLifecycle(id, "members", room);
    if (typeof creator === "string") return copyRoom(room);
    return { room: copyRoom(room), access };
  };

  const createInvitation = (
    id: string,
    accessToken: string,
    role: Exclude<CollaborationRole, "owner">,
  ): RoomInvitation => {
    if (role !== "editor" && role !== "viewer") {
      throw new CollaborationError("INVALID_TRANSACTION", "邀请角色无效");
    }
    authorize(id, accessToken, "invite");
    const key = id.toUpperCase();
    if (rooms.get(key)?.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    const token = generateSecret();
    const expiresAtMs = now() + invitationTtlMs;
    invitations.get(key)?.set(tokenHash(token), { role, expiresAt: expiresAtMs });
    persistRoom(key);
    return { token, role, expiresAt: new Date(expiresAtMs).toISOString() };
  };

  const join = <T>(id: string, input: RoomJoinRequest): CreatedRoom<T> => {
    purgeExpired();
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (!input.clientId.trim() || !input.displayName.trim() || !input.inviteToken.trim()) {
      throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效");
    }
    const roomInvitations = invitations.get(key);
    let invitationHash: string | undefined;
    let invitation: PersistedInvitationRecord | undefined;
    for (const [candidateHash, candidate] of roomInvitations ?? []) {
      if (tokenMatches(input.inviteToken, candidateHash)) {
        invitationHash = candidateHash;
        invitation = candidate;
        break;
      }
    }
    if (!invitation || !invitationHash) {
      throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效或已被使用");
    }
    if (invitation.expiresAt <= now()) {
      roomInvitations?.delete(invitationHash);
      persistRoom(key);
      throw new CollaborationError("INVITATION_EXPIRED", "邀请凭证已过期");
    }
    if (room.members.some((member) => member.clientId === input.clientId)) {
      throw new CollaborationError("ALREADY_JOINED", "该客户端已加入共享房间");
    }
    roomInvitations?.delete(invitationHash);
    const accessToken = generateSecret();
    const participant: RoomParticipant = {
      id: input.clientId,
      displayName: input.displayName,
      role: invitation.role,
    };
    accessRecords.get(key)?.set(tokenHash(accessToken), participant);
    const seenAt = new Date(now()).toISOString();
    const nextRoom = {
      ...room,
      members: [...room.members, {
        clientId: input.clientId,
        role: invitation.role,
        joinedAt: seenAt,
        lastSeenAt: seenAt,
      }],
    };
    rooms.set(key, nextRoom);
    touch(key);
    persistRoom(key);
    notifyLifecycle(key, "members", nextRoom);
    return {
      room: copyRoom(nextRoom) as CollaborationRoom<T>,
      access: { ...participant, participantId: participant.id, accessToken },
    };
  };

  const listParticipants = (id: string, accessToken: string): RoomParticipant[] => {
    authorize(id, accessToken, "read");
    return Array.from(accessRecords.get(id.toUpperCase())?.values() ?? [], publicParticipant);
  };

  const refreshMember = (
    id: string,
    accessToken: string,
    clientId: string,
  ): { id: string; version: number; members: RoomMember[] } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (participant.id !== clientId) {
      throw new CollaborationError("ROOM_FORBIDDEN", "只能刷新当前访问凭证对应的成员");
    }
    const seenAt = new Date(now()).toISOString();
    const existingMember = room.members.find((member) => member.clientId === clientId);
    const nextRoom = existingMember
      ? {
          ...room,
          members: room.members.map((member) =>
            member.clientId === clientId ? { ...member, lastSeenAt: seenAt } : member
          ),
        }
      : {
          ...room,
          members: [...room.members, {
            clientId,
            role: participant.role,
            joinedAt: seenAt,
            lastSeenAt: seenAt,
          }],
        };
    rooms.set(key, nextRoom);
    touch(key);
    persistRoom(key);
    notifyLifecycle(key, "members", nextRoom);
    return { id: room.id, version: nextRoom.version, members: membersOf(nextRoom) };
  };

  const leave = (
    id: string,
    accessToken: string,
    clientId: string,
  ): { id: string; version: number; members: RoomMember[] } => {
    purgeExpired();
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    const revokedRecords = revokedAccessRecords.get(key);
    const revokedHash = matchingTokenHash(revokedRecords, accessToken);
    if (revokedHash) {
      const revoked = revokedRecords?.get(revokedHash);
      if (!revoked || revoked.participant.id !== clientId) {
        throw new CollaborationError("ROOM_FORBIDDEN", "只能移除当前访问凭证对应的成员");
      }
      return {
        ...revoked.leaveResult,
        members: revoked.leaveResult.members.map((member) => ({ ...member })),
      };
    }
    const participant = authorize(key, accessToken, "read");
    if (participant.id !== clientId) {
      throw new CollaborationError("ROOM_FORBIDDEN", "只能移除当前访问凭证对应的成员");
    }
    const nextRoom = {
      ...room,
      members: room.members.filter((member) => member.clientId !== clientId),
    };
    const activeRecords = accessRecords.get(key);
    const activeHash = matchingTokenHash(activeRecords, accessToken);
    if (!activeHash) throw new CollaborationError("ROOM_FORBIDDEN", "房间访问凭证无效");
    activeRecords?.delete(activeHash);
    rooms.set(key, nextRoom);
    touch(key);
    const leaveResult = { id: room.id, version: nextRoom.version, members: membersOf(nextRoom) };
    revokedRecords?.set(activeHash, { participant, leaveResult });
    if (revokedRecords && revokedRecords.size > MAX_REVOKED_ACCESS_RECORDS) {
      const oldest = revokedRecords.keys().next().value;
      if (oldest) revokedRecords.delete(oldest);
    }
    persistRoom(key);
    notifyLifecycle(key, "members", nextRoom);
    return leaveResult;
  };

  const setAccess = (
    id: string,
    accessToken: string,
    clientId: string,
    action: "set-readonly" | "close",
  ): { id: string; version: number; readonly: boolean; closed: boolean } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (participant.id !== clientId) {
      throw new CollaborationError("ROOM_FORBIDDEN", "访问凭证与客户端不匹配");
    }
    if (participant.id !== room.createdBy) {
      throw new CollaborationError("FORBIDDEN", "只有创建者可以修改房间权限");
    }
    const updatedAt = new Date(now()).toISOString();
    const nextRoom = action === "set-readonly"
      ? { ...room, readonly: !room.readonly, updatedAt }
      : { ...room, closed: true, updatedAt };
    rooms.set(key, nextRoom);
    touch(key);
    persistRoom(key);
    notifyLifecycle(key, action === "close" ? "closed" : "access", nextRoom);
    return {
      id: room.id,
      version: nextRoom.version,
      readonly: nextRoom.readonly === true,
      closed: nextRoom.closed === true,
    };
  };

  const subscribeLifecycle = (
    id: string,
    accessToken: string,
    listener: LifecycleListener,
  ): (() => void) => {
    authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    if (!rooms.has(key)) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const roomListeners = lifecycleListeners.get(key) ?? new Set<LifecycleListener>();
    roomListeners.add(listener);
    lifecycleListeners.set(key, roomListeners);
    return () => {
      roomListeners.delete(listener);
      if (roomListeners.size === 0) lifecycleListeners.delete(key);
    };
  };

  return {
    create,
    createInvitation,
    join,
    authorize,
    listParticipants,
    refreshMember,
    leave,
    setAccess,
    subscribeLifecycle,
  };
}
