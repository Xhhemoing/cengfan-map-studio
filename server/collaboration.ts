import { createHash, randomBytes } from "node:crypto";
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

export interface RoomMember {
  clientId: string;
  role: CollaborationRole;
  joinedAt: string;
  lastSeenAt: string;
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
  readonly?: boolean;
  closed?: boolean;
  members: RoomMember[];
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
    public readonly code: "ROOM_NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSACTION" | "ROOM_LIMIT_REACHED" | "SUBSCRIBER_LIMIT_REACHED" | "ROOM_FORBIDDEN" | "INVITATION_INVALID" | "INVITATION_EXPIRED" | "FORBIDDEN" | "READONLY_ROOM" | "ROOM_CLOSED" | "ROOM_INITIALIZING",
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
  }
}

type Listener = (room: CollaborationRoom) => void;
export type LifecycleEvent = { kind: "members"; room: CollaborationRoom; members: RoomMember[] } | { kind: "access"; room: CollaborationRoom; members: RoomMember[] } | { kind: "closed"; room: CollaborationRoom; members: RoomMember[] };
type LifecycleListener = (event: LifecycleEvent) => void;
type InvitationRecord = { role: Exclude<CollaborationRole, "owner">; expiresAt: number };
type OperationHistoryEntry = { version: number; operations: CollaborationOperation[] };
export interface RoomStoreSnapshot {
  version: 1;
  /** Rooms omitted after history trimming could not satisfy record or aggregate caps. */
  skippedRoomCount?: number;
  /** Optional for backward compatibility with snapshots written before skipped ids were recorded. */
  skippedRoomIds?: string[];
  /** Rooms restored without incremental history; clients behind their version must re-snapshot. */
  trimmedRoomIds?: string[];
  rooms: Array<{
    room: CollaborationRoom;
    accessRecords: Array<{ tokenHash: string; participant: RoomParticipant }>;
    invitations: Array<{ tokenHash: string; role: Exclude<CollaborationRole, "owner">; expiresAt: number }>;
    transactionIds: string[];
    operationHistory: OperationHistoryEntry[];
    lastActivity: number;
    legacy: boolean;
  }>;
}
const MAX_TRACKED_TRANSACTIONS = 256;
const MAX_OPERATION_HISTORY = 256;
const DEFAULT_PERSIST_INTERVAL_MS = 30_000;
// Incremental history is discarded before an oversized room is omitted. Rooms
// still over this cap stay live but fall back to process-local lifetime.
// This must not be lower than the HTTP room-transaction acceptance limit.
export const MAX_PERSISTED_ROOM_BYTES = 8 * 1024 * 1024;
// Keep aggregate work bounded while allowing two common 5 MiB rooms to remain
// durable. History is degraded before this budget can evict a whole room.
export const MAX_PERSISTED_SNAPSHOT_BYTES = 12 * 1024 * 1024;

function defaultRoomId(): string {
  return randomBytes(9).toString("hex").slice(0, 12).toUpperCase();
}

function defaultSecret(): string {
  return randomBytes(32).toString("base64url");
}

function describePersistError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function publicParticipant(participant: RoomParticipant): RoomParticipant {
  return {
    id: participant.id,
    displayName: participant.displayName,
    role: participant.role,
  };
}

function jsonStringBytesWithin(value: string, remainingBytes: number): number | undefined {
  // Every UTF-16 code unit occupies at least one JSON byte. This rejects large
  // asset strings without scanning or allocating another copy of the payload.
  if (value.length + 2 > remainingBytes) return undefined;
  let bytes = Buffer.byteLength(value, "utf8") + 2;
  if (bytes > remainingBytes) return undefined;

  // JSON strings escape C0 controls; the class is RFC 8259, not a bug.
  // eslint-disable-next-line no-control-regex
  const escapedCharacters = /["\\\u0000-\u001f\uD800-\uDFFF]/g;
  let match: RegExpExecArray | null;
  while ((match = escapedCharacters.exec(value)) !== null) {
    const code = value.charCodeAt(match.index);
    if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
      bytes += 1;
    } else if (code <= 0x1f) {
      bytes += 5;
    } else {
      const pairedHighSurrogate = code >= 0xd800
        && code <= 0xdbff
        && value.charCodeAt(match.index + 1) >= 0xdc00
        && value.charCodeAt(match.index + 1) <= 0xdfff;
      const pairedLowSurrogate = code >= 0xdc00
        && code <= 0xdfff
        && value.charCodeAt(match.index - 1) >= 0xd800
        && value.charCodeAt(match.index - 1) <= 0xdbff;
      if (!pairedHighSurrogate && !pairedLowSurrogate) bytes += 3;
    }
    if (bytes > remainingBytes) return undefined;
  }
  return bytes;
}

export function jsonByteLengthWithin(value: unknown, maxBytes: number): number | undefined {
  let usedBytes = 0;
  const ancestors = new Set<object>();
  const reserve = (bytes: number) => {
    usedBytes += bytes;
    return usedBytes <= maxBytes;
  };
  const visitString = (text: string) => {
    const bytes = jsonStringBytesWithin(text, maxBytes - usedBytes);
    return bytes !== undefined && reserve(bytes);
  };
  const isOmitted = (item: unknown) => item === undefined || typeof item === "function" || typeof item === "symbol";

  const visit = (item: unknown): boolean => {
    if (item === null) return reserve(4);
    if (typeof item === "string") return visitString(item);
    if (typeof item === "number") return reserve(JSON.stringify(item)?.length ?? 4);
    if (typeof item === "boolean") return reserve(item ? 4 : 5);
    if (typeof item !== "object") return false;
    if (item instanceof Date) {
      const serialized = JSON.stringify(item);
      return serialized !== undefined && reserve(Buffer.byteLength(serialized, "utf8"));
    }
    if (ancestors.has(item)) return false;
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (!reserve(1)) return false;
        for (let index = 0; index < item.length; index += 1) {
          if (index > 0 && !reserve(1)) return false;
          const entry = item[index];
          if (!(isOmitted(entry) ? reserve(4) : visit(entry))) return false;
        }
        return reserve(1);
      }

      if (!reserve(1)) return false;
      let first = true;
      for (const key of Object.keys(item)) {
        const entry = (item as Record<string, unknown>)[key];
        if (isOmitted(entry)) continue;
        if (!first && !reserve(1)) return false;
        first = false;
        if (!visitString(key) || !reserve(1) || !visit(entry)) return false;
      }
      return reserve(1);
    } finally {
      ancestors.delete(item);
    }
  };

  return visit(value) ? usedBytes : undefined;
}

export interface RoomStoreOptions {
  generateId?: () => string;
  generateSecret?: () => string;
  maxRooms?: number;
  maxSubscribers?: number;
  roomTtlMs?: number;
  invitationTtlMs?: number;
  now?: () => number;
  restore?: RoomStoreSnapshot;
  persist?: (snapshot: RoomStoreSnapshot) => void | Promise<void>;
  persistIntervalMs?: number;
}

export interface RoomPersistFailure {
  at: number;
  message: string;
}

export interface RoomPersistOutcome {
  skippedIds: string[];
  trimmedIds: string[];
  /** 最近一次**成功**落盘的时刻；`0` 表示从未成功落过盘。 */
  at: number;
  /** 最近一次落盘失败；下一次成功落盘后清除。字段缺席即当前没有失败连击。 */
  lastFailure?: RoomPersistFailure;
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
  const persist = options.persist;
  const rooms = new Map<string, CollaborationRoom>();
  const listeners = new Map<string, Set<Listener>>();
  const lifecycleListeners = new Map<string, Set<LifecycleListener>>();
  const transactions = new Map<string, Set<string>>();
  const operationHistory = new Map<string, OperationHistoryEntry[]>();
  const lastActivity = new Map<string, number>();
  const accessRecords = new Map<string, Map<string, RoomParticipant>>();
  const invitations = new Map<string, Map<string, InvitationRecord>>();
  const legacyRoomIds = new Set<string>();
  let mutationVersion = 0;
  let persistedVersion = 0;
  let latestPersistSuccess: { skippedIds: string[]; trimmedIds: string[]; at: number } | undefined;
  let latestPersistFailure: RoomPersistFailure | undefined;
  let intervalPersistFailureReported = false;
  let persistInFlight: Promise<void> | undefined;
  let queuedPersist: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | undefined;

  const markDirty = () => {
    mutationVersion += 1;
  };

  const touch = (id: string) => {
    const activity = now();
    if (lastActivity.get(id) === activity) return;
    lastActivity.set(id, activity);
    markDirty();
  };

  const copyRoom = <T>(room: CollaborationRoom<T>): CollaborationRoom<T> => ({ ...room });

  const membersOf = (room: CollaborationRoom): RoomMember[] => room.members.map((member) => ({ ...member }));

  const notifyLifecycle = (key: string, kind: "members" | "access" | "closed", room: CollaborationRoom) => {
    const event: LifecycleEvent = { kind, room: copyRoom(room), members: membersOf(room) };
    lifecycleListeners.get(key)?.forEach((listener) => listener(event));
  };

  let purging = false;

  const purgeExpired = () => {
    // Listeners run store code while being told their room expired (the SSE
    // handler tears its stream down synchronously). A nested purge must not
    // re-notify or delete state that this pass is still walking.
    if (purging) return;
    const threshold = now() - roomTtlMs;
    let expired: string[] | undefined;
    for (const [id, activity] of lastActivity) {
      if (activity > threshold) continue;
      (expired ??= []).push(id);
    }
    if (!expired) return;
    purging = true;
    try {
      for (const id of expired) {
        const room = rooms.get(id);
        // An owner-closed room already told its subscribers; everyone else
        // learns here, while their listener set is still registered.
        if (!room || room.closed) continue;
        const closedRoom = { ...room, closed: true };
        rooms.set(id, closedRoom);
        notifyLifecycle(id, "closed", closedRoom);
      }
    } finally {
      // Runs even if a listener throws, so a failed notification cannot leave
      // half-purged rooms behind, and a re-entrant touch cannot resurrect one.
      for (const id of expired) {
        rooms.delete(id);
        listeners.delete(id);
        lifecycleListeners.delete(id);
        transactions.delete(id);
        operationHistory.delete(id);
        lastActivity.delete(id);
        accessRecords.delete(id);
        invitations.delete(id);
        legacyRoomIds.delete(id);
      }
      markDirty();
      purging = false;
    }
  };

  const restored = options.restore;
  if (restored?.version === 1 && Array.isArray(restored.rooms)) {
    const threshold = now() - roomTtlMs;
    for (const record of restored.rooms) {
      const restoredRoom = record?.room;
      if (
        !restoredRoom
        || typeof restoredRoom.id !== "string"
        || !restoredRoom.id
        || !Number.isInteger(restoredRoom.version)
        || restoredRoom.version < 0
        || !Array.isArray(restoredRoom.members)
        || !Number.isFinite(record.lastActivity)
        || record.lastActivity <= threshold
        || rooms.size >= maxRooms
      ) {
        markDirty();
        continue;
      }
      const id = restoredRoom.id.toUpperCase();
      if (rooms.has(id)) {
        markDirty();
        continue;
      }
      const restoredAccess = new Map<string, RoomParticipant>();
      for (const access of record.accessRecords ?? []) {
        if (!/^[a-f0-9]{64}$/.test(access.tokenHash)) {
          markDirty();
          continue;
        }
        if (
          !access.participant
          || typeof access.participant.id !== "string"
          || typeof access.participant.displayName !== "string"
          || !["owner", "editor", "viewer"].includes(access.participant.role)
        ) {
          markDirty();
          continue;
        }
        restoredAccess.set(access.tokenHash, publicParticipant(access.participant));
      }
      const restoredInvitations = new Map<string, InvitationRecord>();
      for (const invitation of record.invitations ?? []) {
        if (
          !/^[a-f0-9]{64}$/.test(invitation.tokenHash)
          || (invitation.role !== "editor" && invitation.role !== "viewer")
          || !Number.isFinite(invitation.expiresAt)
        ) {
          markDirty();
          continue;
        }
        restoredInvitations.set(invitation.tokenHash, {
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        });
      }
      const restoredHistory = (record.operationHistory ?? [])
        .filter((entry) => Number.isInteger(entry.version) && entry.version > 0 && areValidCollaborationOperations(entry.operations))
        .slice(-MAX_OPERATION_HISTORY)
        .map((entry) => ({ version: entry.version, operations: structuredClone(entry.operations) }));
      if (restoredHistory.length !== (record.operationHistory ?? []).length) markDirty();
      const restoredTransactions = (record.transactionIds ?? [])
        .filter((txId) => typeof txId === "string" && txId.length > 0)
        .slice(-MAX_TRACKED_TRANSACTIONS);
      if (restoredTransactions.length !== (record.transactionIds ?? []).length) markDirty();

      rooms.set(id, structuredClone({ ...restoredRoom, id }));
      accessRecords.set(id, restoredAccess);
      invitations.set(id, restoredInvitations);
      transactions.set(id, new Set(restoredTransactions));
      operationHistory.set(id, restoredHistory);
      lastActivity.set(id, record.lastActivity);
      if (record.legacy) legacyRoomIds.add(id);
    }
  }

  const get = (id: string) => {
    purgeExpired();
    const room = rooms.get(id.toUpperCase());
    return room ? copyRoom(room) : undefined;
  };

  const findParticipant = (id: string, accessToken: string): RoomParticipant => {
    const key = id.toUpperCase();
    const records = accessRecords.get(key);
    if (!records) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    // Store and compare only fixed-width SHA-256 outputs. A Map may not compare
    // strings in constant time, but digest mismatch positions reveal nothing
    // about token prefixes; hashing once preserves that timing-safety intent
    // without making authorization cost grow with the participant roster.
    const participant = records.get(hashSecret(accessToken));
    if (!participant) throw new CollaborationError("ROOM_FORBIDDEN", "房间访问凭证无效");
    return participant;
  };

  const authorizeCapability = (id: string, accessToken: string, capability: CollaborationCapability, refreshActivity: boolean): RoomParticipant => {
    purgeExpired();
    const key = id.toUpperCase();
    if (!rooms.has(key)) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const participant = findParticipant(key, accessToken);
    const allowed = capability === "read"
      || (capability === "write" && participant.role !== "viewer")
      || (capability === "invite" && participant.role === "owner");
    if (!allowed) throw new CollaborationError("ROOM_FORBIDDEN", "当前协作角色没有该操作权限");
    if (refreshActivity) touch(key);
    return publicParticipant(participant);
  };

  const authorize = (id: string, accessToken: string, capability: CollaborationCapability): RoomParticipant =>
    authorizeCapability(id, accessToken, capability, true);

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
    accessRecords.set(id, new Map([[hashSecret(accessToken), publicParticipant(access)]]));
    invitations.set(id, new Map());
    transactions.set(id, new Set());
    operationHistory.set(id, []);
    touch(id);
    notifyLifecycle(id, "members", room);
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
    markDirty();
    return { token, role, expiresAt: new Date(expiresAtMs).toISOString() };
  };

  const join = <T>(id: string, input: RoomJoinRequest): CreatedRoom<T> => {
    purgeExpired();
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (!input.clientId || !input.displayName || !input.inviteToken) {
      throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效");
    }
    const roomInvitations = invitations.get(key);
    const invitationHash = hashSecret(input.inviteToken);
    const invitation = roomInvitations?.get(invitationHash);
    if (!invitation) throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效或已被使用");
    if (invitation.expiresAt <= now()) {
      if (roomInvitations?.delete(invitationHash)) markDirty();
      throw new CollaborationError("INVITATION_EXPIRED", "邀请凭证已过期");
    }
    // Consume before generating access or mutating the roster. Since join is
    // synchronous, competing requests cannot both pass this deletion point.
    if (!roomInvitations?.delete(invitationHash)) {
      throw new CollaborationError("INVITATION_INVALID", "邀请凭证无效或已被使用");
    }
    const accessToken = generateSecret();
    const participant: RoomParticipant = {
      id: input.clientId,
      displayName: input.displayName,
      role: invitation.role,
    };
    accessRecords.get(key)?.set(hashSecret(accessToken), participant);
    const seenAt = new Date(now()).toISOString();
    const existingMember = room.members.find((member) => member.clientId === input.clientId);
    const nextRoom = existingMember
      ? { ...room, members: room.members.map((member) => member.clientId === input.clientId ? { ...member, lastSeenAt: seenAt } : member) }
      : { ...room, members: [...room.members, { clientId: input.clientId, role: invitation.role, joinedAt: seenAt, lastSeenAt: seenAt }] };
    rooms.set(key, nextRoom);
    markDirty();
    touch(key);
    notifyLifecycle(key, "members", nextRoom);
    return {
      room: copyRoom(nextRoom) as CollaborationRoom<T>,
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
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (room.readonly) throw new CollaborationError("READONLY_ROOM", "共享房间当前为只读，无法提交修改");
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
    markDirty();
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
    // Attaching a stream is not room activity: an auto-reconnecting EventSource
    // would otherwise keep an abandoned room alive forever.
    if (typeof accessTokenOrListener === "string") authorizeCapability(key, accessTokenOrListener, "read", false);
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

  const refreshMember = (id: string, accessToken: string, clientId: string): { id: string; version: number; members: RoomMember[] } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    const seenAt = new Date(now()).toISOString();
    const memberClientId = clientId || participant.id;
    if (participant.role !== "owner" && memberClientId !== participant.id) {
      throw new CollaborationError("ROOM_FORBIDDEN", "只能刷新自己的成员状态");
    }
    const existingMember = room.members.find((member) => member.clientId === memberClientId);
    const nextRoom = existingMember
      ? { ...room, members: room.members.map((member) => member.clientId === memberClientId ? { ...member, lastSeenAt: seenAt } : member) }
      : { ...room, members: [...room.members, { clientId: memberClientId, role: participant.role, joinedAt: seenAt, lastSeenAt: seenAt }] };
    rooms.set(key, nextRoom);
    markDirty();
    touch(key);
    notifyLifecycle(key, "members", nextRoom);
    return { id: room.id, version: nextRoom.version, members: membersOf(nextRoom) };
  };

  const leave = (id: string, accessToken: string, clientId: string): { id: string; version: number; members: RoomMember[] } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const leavingClientId = clientId || participant.id;
    if (participant.role !== "owner" && leavingClientId !== participant.id) {
      throw new CollaborationError("ROOM_FORBIDDEN", "只能移除自己的成员状态");
    }
    const nextRoom = { ...room, members: room.members.filter((member) => member.clientId !== leavingClientId) };
    rooms.set(key, nextRoom);
    markDirty();
    touch(key);
    notifyLifecycle(key, "members", nextRoom);
    return { id: room.id, version: nextRoom.version, members: membersOf(nextRoom) };
  };

  const setAccess = (id: string, accessToken: string, _clientId: string, action: "set-readonly" | "close"): { id: string; version: number; readonly: boolean; closed: boolean } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (participant.id !== room.createdBy) throw new CollaborationError("FORBIDDEN", "只有创建者可以修改房间权限");
    const updatedAt = new Date(now()).toISOString();
    const nextRoom = action === "set-readonly"
      ? { ...room, readonly: !room.readonly, updatedAt }
      : { ...room, closed: true, updatedAt };
    rooms.set(key, nextRoom);
    markDirty();
    touch(key);
    notifyLifecycle(key, action === "close" ? "closed" : "access", nextRoom);
    return { id: room.id, version: nextRoom.version, readonly: nextRoom.readonly === true, closed: nextRoom.closed === true };
  };

  const getOperations = (id: string, accessToken: string, afterVersion: number): { version: number; operations: CollaborationOperation[] } => {
    authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (!room.ready) throw new CollaborationError("ROOM_INITIALIZING", "共享房间正在上传初始工程");
    if (!Number.isInteger(afterVersion) || afterVersion < 0) throw new CollaborationError("INVALID_TRANSACTION", "afterVersion 必须是非负整数");
    if (afterVersion > room.version) throw new CollaborationError("VERSION_CONFLICT", "请求的版本超出房间当前版本", room.version);
    const history = operationHistory.get(key) ?? [];
    const needed = history
      .filter((entry) => entry.version > afterVersion && entry.version <= room.version)
      .sort((a, b) => a.version - b.version);
    let expected = afterVersion + 1;
    for (const entry of needed) {
      if (entry.version !== expected) throw new CollaborationError("VERSION_CONFLICT", "增量历史已被裁剪，请重新获取完整快照", room.version);
      expected += 1;
    }
    if (expected !== room.version + 1) throw new CollaborationError("VERSION_CONFLICT", "增量历史已被裁剪，请重新获取完整快照", room.version);
    return { version: room.version, operations: needed.flatMap((entry) => structuredClone(entry.operations)) };
  };

  const subscribeLifecycle = (id: string, accessToken: string, listener: LifecycleListener): (() => void) => {
    authorizeCapability(id, accessToken, "read", false);
    const key = id.toUpperCase();
    if (!rooms.has(key)) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    const roomListeners = lifecycleListeners.get(key) ?? new Set<LifecycleListener>();
    if (!roomListeners.has(listener) && roomListeners.size >= maxSubscribers) {
      throw new CollaborationError("SUBSCRIBER_LIMIT_REACHED", "共享房间连接数已达到上限");
    }
    roomListeners.add(listener);
    lifecycleListeners.set(key, roomListeners);
    return () => {
      roomListeners.delete(listener);
      if (roomListeners.size === 0) lifecycleListeners.delete(key);
    };
  };

  const snapshot = (): RoomStoreSnapshot => {
    type PersistedRoom = RoomStoreSnapshot["rooms"][number];
    type PersistCandidate = { id: string; record: PersistedRoom; recordBytes: number; trimmed: boolean };
    const candidates: PersistCandidate[] = [];
    const skippedRoomIds: string[] = [];
    for (const [id, room] of rooms) {
      let record: PersistedRoom = {
        room,
        accessRecords: Array.from(accessRecords.get(id) ?? [], ([tokenHash, participant]) => ({
          tokenHash,
          participant: publicParticipant(participant),
        })),
        invitations: Array.from(invitations.get(id) ?? [], ([tokenHash, invitation]) => ({
          tokenHash,
          ...invitation,
        })),
        transactionIds: Array.from(transactions.get(id) ?? []),
        operationHistory: operationHistory.get(id) ?? [],
        lastActivity: lastActivity.get(id) ?? now(),
        legacy: legacyRoomIds.has(id),
      };
      let recordBytes = jsonByteLengthWithin(record, MAX_PERSISTED_ROOM_BYTES);
      let trimmed = false;
      if (recordBytes === undefined && record.operationHistory.length > 0) {
        record = { ...record, operationHistory: [] };
        recordBytes = jsonByteLengthWithin(record, MAX_PERSISTED_ROOM_BYTES);
        trimmed = recordBytes !== undefined;
      }
      if (recordBytes === undefined) {
        skippedRoomIds.push(id);
        continue;
      }
      candidates.push({ id, record, recordBytes, trimmed });
    }

    const retainedIds = new Set(candidates.map(({ id }) => id));
    const largestRetained = () => candidates
      .filter(({ id }) => retainedIds.has(id))
      .sort((left, right) => {
        if (left.recordBytes !== right.recordBytes) return right.recordBytes - left.recordBytes;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      })[0];
    const currentTrimmedIds = () => candidates
      .filter(({ id, trimmed }) => trimmed && retainedIds.has(id))
      .map(({ id }) => id)
      .sort();
    const snapshotBytes = () => {
      const retained = candidates.filter(({ id }) => retainedIds.has(id));
      const sortedSkippedIds = [...skippedRoomIds].sort();
      const sortedTrimmedIds = currentTrimmedIds();
      let bytes = Buffer.byteLength('{"version":1,"rooms":[', "utf8")
        + retained.reduce((total, { recordBytes }) => total + recordBytes, 0)
        + Math.max(0, retained.length - 1)
        + 2;
      if (sortedSkippedIds.length > 0) {
        bytes += Buffer.byteLength(
          `,"skippedRoomCount":${sortedSkippedIds.length},"skippedRoomIds":${JSON.stringify(sortedSkippedIds)}`,
          "utf8",
        );
      }
      if (sortedTrimmedIds.length > 0) {
        bytes += Buffer.byteLength(
          `,"trimmedRoomIds":${JSON.stringify(sortedTrimmedIds)}`,
          "utf8",
        );
      }
      return bytes;
    };
    while (snapshotBytes() > MAX_PERSISTED_SNAPSHOT_BYTES) {
      const atRisk = largestRetained();
      if (!atRisk) break;
      if (!atRisk.trimmed && atRisk.record.operationHistory.length > 0) {
        const trimmedRecord = { ...atRisk.record, operationHistory: [] };
        const trimmedBytes = jsonByteLengthWithin(trimmedRecord, MAX_PERSISTED_ROOM_BYTES);
        if (trimmedBytes !== undefined) {
          atRisk.record = trimmedRecord;
          atRisk.recordBytes = trimmedBytes;
          atRisk.trimmed = true;
          continue;
        }
      }
      retainedIds.delete(atRisk.id);
      skippedRoomIds.push(atRisk.id);
    }

    skippedRoomIds.sort();
    const trimmedRoomIds = currentTrimmedIds();
    const persistedRooms = candidates
      .filter(({ id }) => retainedIds.has(id))
      .map(({ record }) => ({
        ...record,
        room: structuredClone(record.room),
        operationHistory: record.operationHistory.map((entry) => ({
          version: entry.version,
          operations: structuredClone(entry.operations),
        })),
      }));
    return {
      version: 1,
      rooms: persistedRooms,
      ...(skippedRoomIds.length > 0
        ? { skippedRoomCount: skippedRoomIds.length, skippedRoomIds }
        : {}),
      ...(trimmedRoomIds.length > 0 ? { trimmedRoomIds } : {}),
    };
  };

  function warnDegradedRooms(persistedSnapshot: RoomStoreSnapshot) {
    const trimmedIds = persistedSnapshot.trimmedRoomIds ?? [];
    const skippedIds = persistedSnapshot.skippedRoomIds ?? [];
    if (trimmedIds.length === 0 && skippedIds.length === 0) return;
    const outcomes = [
      ...(trimmedIds.length > 0
        ? [`trimmed operation history for ${trimmedIds.length} room(s) (${trimmedIds.join(", ")})`]
        : []),
      ...(skippedIds.length > 0
        ? [`skipped ${skippedIds.length} room(s) from persistence (${skippedIds.join(", ")})`]
        : []),
    ];
    // 图例只解释真实发生的分组，否则一次纯裁剪的落盘会告诉运维“有房间被跳过”。
    const legend = [
      ...(trimmedIds.length > 0
        ? ["Trimmed rooms remain restorable but stale clients must re-snapshot"]
        : []),
      ...(skippedIds.length > 0
        ? ["skipped rooms remain in memory but will not be restored after restart"]
        : []),
    ];
    console.warn(
      `[collaboration] ${outcomes.join("; ")}; `
      + `per-room cap ${MAX_PERSISTED_ROOM_BYTES} bytes, total snapshot budget ${MAX_PERSISTED_SNAPSHOT_BYTES} bytes. `
      + legend.join("; "),
    );
  }

  function createQueuedPersist() {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function settlePersist(operation: Promise<void>) {
    if (persistInFlight !== operation) return;
    persistInFlight = undefined;
    const queued = queuedPersist;
    queuedPersist = undefined;
    if (!queued) return;
    const next = startPersist();
    void next.then(queued.resolve, queued.reject);
  }

  function startPersist(): Promise<void> {
    const persistedMutationVersion = mutationVersion;
    const persistedSnapshot = snapshot();
    const outcome = {
      skippedIds: [...(persistedSnapshot.skippedRoomIds ?? [])],
      trimmedIds: [...(persistedSnapshot.trimmedRoomIds ?? [])],
    };
    warnDegradedRooms(persistedSnapshot);
    const operation = Promise.resolve().then(async () => {
      await persist!(persistedSnapshot);
      persistedVersion = Math.max(persistedVersion, persistedMutationVersion);
      intervalPersistFailureReported = false;
      latestPersistFailure = undefined;
      latestPersistSuccess = { ...outcome, at: now() };
    });
    persistInFlight = operation;
    void operation.then(
      () => settlePersist(operation),
      (error: unknown) => {
        // 失败也要留痕，否则磁盘坏掉的整段时间里 lastPersistOutcome() 只会重复上一次成功。
        latestPersistFailure = { at: now(), message: describePersistError(error) };
        settlePersist(operation);
      },
    );
    return operation;
  }

  const flush = async (): Promise<void> => {
    purgeExpired();
    if (!persist) return;
    if (persistInFlight) {
      queuedPersist ??= createQueuedPersist();
      await queuedPersist.promise;
      return;
    }
    await startPersist();
  };

  const persistIntervalMs = options.persistIntervalMs ?? DEFAULT_PERSIST_INTERVAL_MS;
  if (persist && Number.isFinite(persistIntervalMs) && persistIntervalMs > 0) {
    const timer = setInterval(() => {
      if (persistedVersion === mutationVersion) return;
      void flush().catch((error: unknown) => {
        if (intervalPersistFailureReported) return;
        intervalPersistFailureReported = true;
        console.error("[collaboration] interval persistence failed; retries will continue", error);
      });
    }, persistIntervalMs);
    timer.unref();
  }

  const lastPersistOutcome = (): RoomPersistOutcome | undefined => {
    if (!latestPersistSuccess && !latestPersistFailure) return undefined;
    const outcome: RoomPersistOutcome = {
      skippedIds: [...(latestPersistSuccess?.skippedIds ?? [])],
      trimmedIds: [...(latestPersistSuccess?.trimmedIds ?? [])],
      at: latestPersistSuccess?.at ?? 0,
    };
    if (latestPersistFailure) outcome.lastFailure = { ...latestPersistFailure };
    return outcome;
  };

  return { create, get, createInvitation, join, authorize, apply, subscribe, listParticipants, refreshMember, leave, setAccess, getOperations, subscribeLifecycle, flush, lastPersistOutcome } as RoomStore;
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
  refreshMember: (id: string, accessToken: string, clientId: string) => { id: string; version: number; members: RoomMember[] };
  leave: (id: string, accessToken: string, clientId: string) => { id: string; version: number; members: RoomMember[] };
  setAccess: (id: string, accessToken: string, clientId: string, action: "set-readonly" | "close") => { id: string; version: number; readonly: boolean; closed: boolean };
  getOperations: (id: string, accessToken: string, afterVersion: number) => { version: number; operations: CollaborationOperation[] };
  subscribeLifecycle: (id: string, accessToken: string, listener: LifecycleListener) => () => void;
  flush: () => Promise<void>;
  lastPersistOutcome: () => RoomPersistOutcome | undefined;
}
