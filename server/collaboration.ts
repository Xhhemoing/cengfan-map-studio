import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  applyCollaborationOperations,
  areValidCollaborationOperations,
  collaborationOperationsOverlap,
  type CollaborationOperation,
} from "../src/lib/collaboration-operations";

export type CollaborationRole = "owner" | "editor" | "viewer";
export type CollaborationCapability = "read" | "write" | "invite";

export interface RoomParticipant {
  id: string;
  displayName: string;
  role: CollaborationRole;
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
  createdBy: string;
  updatedBy: string;
  lastTxId?: string;
  updatedAt: string;
  operations?: CollaborationOperation[];
  rebasedFromVersion?: number;
}

export interface RoomTransaction<T = unknown> {
  txId: string;
  clientId: string;
  baseVersion: number;
  snapshot?: T;
  operations?: CollaborationOperation[];
}

export interface RoomCreator {
  clientId: string;
  displayName: string;
}

export interface RoomJoinRequest {
  inviteToken: string;
  clientId: string;
  displayName: string;
}

export interface CreatedRoom<T = unknown> {
  room: CollaborationRoom<T>;
  access: RoomAccess;
}

export class CollaborationError extends Error {
  constructor(
    public readonly code: "ROOM_NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSACTION" | "ROOM_LIMIT_REACHED" | "SUBSCRIBER_LIMIT_REACHED" | "ROOM_FORBIDDEN" | "INVITATION_INVALID" | "INVITATION_EXPIRED",
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
  }
}

type Listener = (room: CollaborationRoom) => void;
type InvitationRecord = { role: Exclude<CollaborationRole, "owner">; expiresAt: number };
const MAX_TRACKED_TRANSACTIONS = 256;
const MAX_OPERATION_HISTORY = 256;

function defaultRoomId(): string {
  return randomBytes(9).toString("hex").slice(0, 12).toUpperCase();
}

function defaultSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function tokenMatches(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function publicParticipant(participant: RoomParticipant): RoomParticipant {
  return { ...participant };
}

export interface RoomStoreOptions {
  generateId?: () => string;
  generateSecret?: () => string;
  maxRooms?: number;
  maxSubscribers?: number;
  roomTtlMs?: number;
  invitationTtlMs?: number;
  now?: () => number;
}

export function createRoomStore(input: (() => string) | RoomStoreOptions = {}): RoomStore {
  const options = typeof input === "function" ? { generateId: input } : input;
  const generateId = options.generateId ?? defaultRoomId;
  const generateSecret = options.generateSecret ?? defaultSecret;
  const maxRooms = options.maxRooms ?? 100;
  const maxSubscribers = options.maxSubscribers ?? 50;
  const roomTtlMs = options.roomTtlMs ?? 30 * 60 * 1000;
  const invitationTtlMs = options.invitationTtlMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  const rooms = new Map<string, CollaborationRoom>();
  const listeners = new Map<string, Set<Listener>>();
  const transactions = new Map<string, Set<string>>();
  const operationHistory = new Map<string, Array<{ version: number; operations: CollaborationOperation[] }>>();
  const lastActivity = new Map<string, number>();
  const accessRecords = new Map<string, Map<string, RoomParticipant>>();
  const invitations = new Map<string, Map<string, InvitationRecord>>();
  const legacyRoomIds = new Set<string>();

  const purgeExpired = () => {
    const threshold = now() - roomTtlMs;
    for (const [id, activity] of lastActivity) {
      if (activity > threshold) continue;
      rooms.delete(id);
      listeners.delete(id);
      transactions.delete(id);
      operationHistory.delete(id);
      lastActivity.delete(id);
      accessRecords.delete(id);
      invitations.delete(id);
      legacyRoomIds.delete(id);
    }
  };

  const touch = (id: string) => {
    lastActivity.set(id, now());
  };

  const copyRoom = <T>(room: CollaborationRoom<T>): CollaborationRoom<T> => ({ ...room });
  const get = (id: string) => {
    purgeExpired();
    const room = rooms.get(id.toUpperCase());
    if (room) touch(room.id);
    return room ? copyRoom(room) : undefined;
  };

  const findParticipant = (id: string, accessToken: string): RoomParticipant => {
    const key = id.toUpperCase();
    const records = accessRecords.get(key);
    if (!records) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    for (const [tokenHash, participant] of records) {
      if (tokenMatches(accessToken, tokenHash)) return participant;
    }
    throw new CollaborationError("ROOM_FORBIDDEN", "房间访问凭证无效");
  };

  const authorize = (id: string, accessToken: string, capability: CollaborationCapability): RoomParticipant => {
    purgeExpired();
    const key = id.toUpperCase();
    if (!rooms.has(key)) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const participant = findParticipant(key, accessToken);
    const allowed = capability === "read"
      || (capability === "write" && participant.role !== "viewer")
      || (capability === "invite" && participant.role === "owner");
    if (!allowed) throw new CollaborationError("ROOM_FORBIDDEN", "当前协作角色没有该操作权限");
    touch(key);
    return publicParticipant(participant);
  };

  const create = <T>(snapshot: T | undefined, creator: string | RoomCreator): CollaborationRoom<T> | CreatedRoom<T> => {
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
    const room: CollaborationRoom<T> = {
      id,
      version: 0,
      ...(snapshot === undefined ? {} : { snapshot: structuredClone(snapshot) }),
      ready: snapshot !== undefined,
      createdBy: normalizedCreator.clientId,
      updatedBy: normalizedCreator.clientId,
      updatedAt: new Date(now()).toISOString(),
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
    accessRecords.set(id, new Map([[hashSecret(accessToken), publicParticipant(access)]]));
    invitations.set(id, new Map());
    transactions.set(id, new Set());
    operationHistory.set(id, []);
    touch(id);
    if (typeof creator === "string") {
      legacyRoomIds.add(id);
      return copyRoom(room);
    }
    return { room: copyRoom(room), access };
  };

  const createInvitation = (id: string, accessToken: string, role: Exclude<CollaborationRole, "owner">): RoomInvitation => {
    if (role !== "editor" && role !== "viewer") throw new CollaborationError("INVALID_TRANSACTION", "邀请角色无效");
    authorize(id, accessToken, "invite");
    const key = id.toUpperCase();
    const token = generateSecret();
    const expiresAtMs = now() + invitationTtlMs;
    invitations.get(key)?.set(hashSecret(token), { role, expiresAt: expiresAtMs });
    return { token, role, expiresAt: new Date(expiresAtMs).toISOString() };
  };

  const join = <T>(id: string, input: RoomJoinRequest): CreatedRoom<T> => {
    purgeExpired();
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (!input.clientId || !input.displayName || !input.inviteToken) {
      throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效");
    }
    const roomInvitations = invitations.get(key);
    let invitationHash: string | undefined;
    let invitation: InvitationRecord | undefined;
    for (const [candidateHash, candidate] of roomInvitations ?? []) {
      if (tokenMatches(input.inviteToken, candidateHash)) {
        invitationHash = candidateHash;
        invitation = candidate;
        break;
      }
    }
    if (!invitation || !invitationHash) throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效或已被使用");
    if (invitation.expiresAt <= now()) {
      roomInvitations?.delete(invitationHash);
      throw new CollaborationError("INVITATION_EXPIRED", "邀请凭证已过期");
    }
    roomInvitations?.delete(invitationHash);
    const accessToken = generateSecret();
    const participant: RoomParticipant = {
      id: input.clientId,
      displayName: input.displayName,
      role: invitation.role,
    };
    accessRecords.get(key)?.set(hashSecret(accessToken), participant);
    touch(key);
    return {
      room: copyRoom(room) as CollaborationRoom<T>,
      access: { ...participant, participantId: participant.id, accessToken },
    };
  };

  const applyAuthorized = <T>(id: string, accessToken: string, transaction: RoomTransaction<T>): CollaborationRoom<T> => {
    const participant = authorize(id, accessToken, "write");
    if (participant.id !== transaction.clientId) {
      throw new CollaborationError("ROOM_FORBIDDEN", "事务创建者与访问凭证不匹配");
    }
    return applyRoom(id, transaction);
  };

  const applyRoom = <T>(id: string, transaction: RoomTransaction<T>): CollaborationRoom<T> => {
    purgeExpired();
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (
      !transaction.txId
      || !transaction.clientId
      || !Number.isInteger(transaction.baseVersion)
      || transaction.baseVersion < 0
      || (transaction.snapshot === undefined && !areValidCollaborationOperations(transaction.operations))
      || (transaction.snapshot !== undefined && transaction.operations !== undefined)
    ) {
      throw new CollaborationError("INVALID_TRANSACTION", "协作事务格式无效");
    }
    const appliedTransactionIds = transactions.get(key);
    if (appliedTransactionIds?.has(transaction.txId)) return copyRoom(room) as CollaborationRoom<T>;
    const operations = transaction.operations;
    if (transaction.baseVersion !== room.version) {
      const intervening = operationHistory.get(key)?.filter((entry) => entry.version > transaction.baseVersion) ?? [];
      const canRebase = operations
        && intervening.length === room.version - transaction.baseVersion
        && !operations.some((operation) => intervening.some((entry) =>
          entry.operations.some((applied) => collaborationOperationsOverlap(operation, applied))
        ));
      if (!canRebase) throw new CollaborationError("VERSION_CONFLICT", "房间已被其他成员更新", room.version);
    }
    const nextSnapshot = operations
      ? applyCollaborationOperations(room.snapshot, operations)
      : structuredClone(transaction.snapshot);
    const next: CollaborationRoom<T> = {
      ...room,
      version: room.version + 1,
      snapshot: nextSnapshot as T,
      ready: true,
      updatedBy: transaction.clientId,
      lastTxId: transaction.txId,
      updatedAt: new Date(now()).toISOString(),
      ...(operations ? { operations: structuredClone(operations) } : { operations: undefined }),
      ...(transaction.baseVersion === room.version ? { rebasedFromVersion: undefined } : { rebasedFromVersion: transaction.baseVersion }),
    };
    rooms.set(key, next);
    touch(key);
    appliedTransactionIds?.add(transaction.txId);
    if (appliedTransactionIds && appliedTransactionIds.size > MAX_TRACKED_TRANSACTIONS) {
      const oldest = appliedTransactionIds.values().next().value;
      if (oldest) appliedTransactionIds.delete(oldest);
    }
    const history = operationHistory.get(key) ?? [];
    if (operations) history.push({ version: next.version, operations: structuredClone(operations) });
    else history.length = 0;
    if (history.length > MAX_OPERATION_HISTORY) history.splice(0, history.length - MAX_OPERATION_HISTORY);
    operationHistory.set(key, history);
    listeners.get(key)?.forEach((listener) => listener(copyRoom(next)));
    return copyRoom(next);
  };

  const apply = <T>(id: string, accessTokenOrTransaction: string | RoomTransaction<T>, maybeTransaction?: RoomTransaction<T>): CollaborationRoom<T> => {
    if (typeof accessTokenOrTransaction === "string") {
      if (!maybeTransaction) throw new CollaborationError("INVALID_TRANSACTION", "协作事务格式无效");
      return applyAuthorized(id, accessTokenOrTransaction, maybeTransaction);
    }
    if (!legacyRoomIds.has(id.toUpperCase())) throw new CollaborationError("ROOM_FORBIDDEN", "房间访问凭证无效");
    return applyRoom(id, accessTokenOrTransaction);
  };

  const subscribe = (id: string, accessTokenOrListener: string | Listener, maybeListener?: Listener): (() => void) => {
    purgeExpired();
    const key = id.toUpperCase();
    const listener = typeof accessTokenOrListener === "string" ? maybeListener : accessTokenOrListener;
    if (!listener) throw new CollaborationError("INVALID_TRANSACTION", "订阅回调无效");
    if (typeof accessTokenOrListener === "string") authorize(key, accessTokenOrListener, "read");
    else if (!legacyRoomIds.has(key)) throw new CollaborationError("ROOM_FORBIDDEN", "房间访问凭证无效");
    if (!rooms.has(key)) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const roomListeners = listeners.get(key) ?? new Set<Listener>();
    if (!roomListeners.has(listener) && roomListeners.size >= maxSubscribers) {
      throw new CollaborationError("SUBSCRIBER_LIMIT_REACHED", "共享房间连接数已达到上限");
    }
    roomListeners.add(listener);
    listeners.set(key, roomListeners);
    return () => {
      roomListeners.delete(listener);
      if (roomListeners.size === 0) listeners.delete(key);
    };
  };

  const listParticipants = (id: string, accessToken: string): RoomParticipant[] => {
    authorize(id, accessToken, "read");
    return Array.from(accessRecords.get(id.toUpperCase())?.values() ?? [], publicParticipant);
  };

  return { create, get, createInvitation, join, authorize, apply, subscribe, listParticipants } as RoomStore;
}

export interface RoomStore {
  create<T>(snapshot: T | undefined, creator: RoomCreator): CreatedRoom<T>;
  /** @deprecated Compatibility overload for older in-process callers. HTTP routes never use it. */
  create<T>(snapshot: T | undefined, clientId: string): CollaborationRoom<T>;
  get: (id: string) => CollaborationRoom | undefined;
  createInvitation: (id: string, accessToken: string, role: Exclude<CollaborationRole, "owner">) => RoomInvitation;
  join<T>(id: string, input: RoomJoinRequest): CreatedRoom<T>;
  authorize: (id: string, accessToken: string, capability: CollaborationCapability) => RoomParticipant;
  apply<T>(id: string, accessToken: string, transaction: RoomTransaction<T>): CollaborationRoom<T>;
  /** @deprecated Compatibility overload for older in-process callers. HTTP routes never use it. */
  apply<T>(id: string, transaction: RoomTransaction<T>): CollaborationRoom<T>;
  subscribe(id: string, accessToken: string, listener: Listener): () => void;
  /** @deprecated Compatibility overload for older in-process callers. HTTP routes never use it. */
  subscribe(id: string, listener: Listener): () => void;
  listParticipants: (id: string, accessToken: string) => RoomParticipant[];
}
