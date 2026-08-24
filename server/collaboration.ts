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
export type LifecycleEvent = { kind: "members"; room: CollaborationRoom; members: RoomMember[] } | { kind: "access"; room: CollaborationRoom; members: RoomMember[] } | { kind: "closed"; room: CollaborationRoom; members: RoomMember[] } | { kind: "kicked"; room: CollaborationRoom; members: RoomMember[]; clientId: string };
type LifecycleListener = (event: LifecycleEvent) => void;
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
  const lifecycleListeners = new Map<string, Set<LifecycleListener>>();
  const transactions = new Map<string, Set<string>>();
  const operationHistory = new Map<string, Array<{ version: number; operations: CollaborationOperation[] }>>();
  const lastActivity = new Map<string, number>();
  const accessRecords = new Map<string, Map<string, RoomParticipant>>();
  const invitations = new Map<string, Map<string, InvitationRecord>>();
  const legacyRoomIds = new Set<string>();

  /**
   * TTL 驱逐必须补一条终局 closed:静默删房间的话,仍连着的订阅方(SSE handler)收不到任何事件,
   * 会一直挂着以为房间还在——客户端只认 closed/kicked 这两个终局事件才停流。
   * 先摘掉房间状态再回调,这样回调里若又走进 purgeExpired 也不会重复广播。
   * 回滚:删掉下面 expiredListeners 的广播即可恢复“过期静默清理”的旧行为。
   */
  const purgeExpired = () => {
    const threshold = now() - roomTtlMs;
    for (const [id, activity] of lastActivity) {
      if (activity > threshold) continue;
      const expired = rooms.get(id);
      const expiredListeners = lifecycleListeners.get(id);
      rooms.delete(id);
      listeners.delete(id);
      lifecycleListeners.delete(id);
      transactions.delete(id);
      operationHistory.delete(id);
      lastActivity.delete(id);
      accessRecords.delete(id);
      invitations.delete(id);
      legacyRoomIds.delete(id);
      if (!expired || !expiredListeners?.size) continue;
      const closedRoom: CollaborationRoom = { ...expired, closed: true };
      const members = membersOf(expired);
      expiredListeners.forEach((listener) => listener({ kind: "closed", room: closedRoom, members }));
    }
  };

  const touch = (id: string) => {
    lastActivity.set(id, now());
  };

  const copyRoom = <T>(room: CollaborationRoom<T>): CollaborationRoom<T> => ({ ...room });

  const membersOf = (room: CollaborationRoom): RoomMember[] => room.members.map((member) => ({ ...member }));

  const emitLifecycle = (key: string, event: LifecycleEvent) => {
    lifecycleListeners.get(key)?.forEach((listener) => listener(event));
  };

  const notifyLifecycle = (key: string, kind: "members" | "access" | "closed", room: CollaborationRoom) => {
    emitLifecycle(key, { kind, room: copyRoom(room), members: membersOf(room) });
  };

  /**
   * 踢人事件带上被踢者的 clientId,订阅方(SSE handler)据此只掐断被踢者那条连接,
   * 其余成员按普通成员变更处理。
   */
  const notifyKicked = (key: string, room: CollaborationRoom, clientId: string) => {
    emitLifecycle(key, { kind: "kicked", room: copyRoom(room), members: membersOf(room), clientId });
  };
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
    // 邀请凭证只能换到与名册一致的身份:同 clientId 但角色不同说明在冒名顶替
    // (例如 viewer 用 createdBy 加入),此时不消费邀请,直接拒绝。
    const existingMember = room.members.find((member) => member.clientId === input.clientId);
    if (existingMember && existingMember.role !== invitation.role) {
      throw new CollaborationError("INVITATION_INVALID", "该 clientId 已在房间内且角色不同");
    }
    roomInvitations?.delete(invitationHash);
    const accessToken = generateSecret();
    const participant: RoomParticipant = {
      id: input.clientId,
      displayName: input.displayName,
      role: invitation.role,
    };
    accessRecords.get(key)?.set(hashSecret(accessToken), participant);
    const seenAt = new Date(now()).toISOString();
    const nextRoom = existingMember
      ? { ...room, members: room.members.map((member) => member.clientId === input.clientId ? { ...member, lastSeenAt: seenAt } : member) }
      : { ...room, members: [...room.members, { clientId: input.clientId, role: invitation.role, joinedAt: seenAt, lastSeenAt: seenAt }] };
    rooms.set(key, nextRoom);
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

  const refreshMember = (id: string, accessToken: string, clientId: string): { id: string; version: number; members: RoomMember[] } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    if (clientId && clientId !== participant.id) {
      throw new CollaborationError("ROOM_FORBIDDEN", "只能刷新自己的在线状态");
    }
    const seenAt = new Date(now()).toISOString();
    const memberClientId = participant.id;
    const existingMember = room.members.find((member) => member.clientId === memberClientId);
    const nextRoom = existingMember
      ? { ...room, members: room.members.map((member) => member.clientId === memberClientId ? { ...member, lastSeenAt: seenAt } : member) }
      : { ...room, members: [...room.members, { clientId: memberClientId, role: participant.role, joinedAt: seenAt, lastSeenAt: seenAt }] };
    rooms.set(key, nextRoom);
    touch(key);
    notifyLifecycle(key, "members", nextRoom);
    return { id: room.id, version: nextRoom.version, members: membersOf(nextRoom) };
  };

  /**
   * 撤销某个成员在房间里的全部访问凭证。同一 clientId 多次加入会拿到多个 token,
   * 因此必须遍历整张表,不能只删一条。
   */
  const revokeParticipantAccess = (key: string, clientId: string) => {
    const records = accessRecords.get(key);
    if (!records) return;
    for (const [tokenHash, participant] of records) {
      if (participant.id === clientId) records.delete(tokenHash);
    }
  };

  /**
   * 离开房间有两种语义,按调用者与被移除者是否同一人区分:
   * - 自离:只从成员列表移除,保留 accessRecords 中的 token,沿用“凭已保存的访问凭证可重进”的现有语义;
   * - 房主踢人:同时撤销被踢者的全部 token,否则 authorize 仍会放行其读写,
   *   并且被踢者的 refreshMember 心跳会把自己重新加回成员列表。
   * 房间关闭后成员名单已经冻结,自离与踢人都按 refreshMember 的同一口径拒绝。
   * 自离只能移除与凭证角色一致的名额:同 clientId 但角色更高的名额(如房主)必须留在名单里,
   * 否则冒用 createdBy 的 viewer 能靠“自离”把真正房主挤出去。房主踢人不受该限制。
   * 踢人另外播 kind:"kicked" 生命周期事件(自离仍是 "members"),订阅方据此掐断被踢者的事件流;
   * 撤了凭证但不断流的话,被踢者的 EventSource 仍会按房间广播继续收到全量快照。
   * 回滚:删除下面的 revokeParticipantAccess 调用即可恢复“只删成员、不撤凭证”的旧行为;
   * 把 notifyKicked 换回 notifyLifecycle(key, "members", nextRoom) 即可恢复“踢人不断流”的旧行为;
   * 删除 room.closed 检查即可恢复“关闭房间仍可离开/踢人”的旧行为。
   */
  const leave = (id: string, accessToken: string, clientId: string): { id: string; version: number; members: RoomMember[] } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    const leavingClientId = clientId || participant.id;
    const kicked = leavingClientId !== participant.id;
    if (kicked && participant.role !== "owner") {
      throw new CollaborationError("ROOM_FORBIDDEN", "只有房间创建者可以移除其他成员");
    }
    if (kicked) revokeParticipantAccess(key, leavingClientId);
    const removable = (member: RoomMember) => member.clientId === leavingClientId
      && (participant.role === "owner" || member.role === participant.role);
    const nextRoom = { ...room, members: room.members.filter((member) => !removable(member)) };
    rooms.set(key, nextRoom);
    touch(key);
    if (kicked) notifyKicked(key, nextRoom, leavingClientId);
    else notifyLifecycle(key, "members", nextRoom);
    return { id: room.id, version: nextRoom.version, members: membersOf(nextRoom) };
  };

  const setAccess = (id: string, accessToken: string, clientId: string, action: "set-readonly" | "close"): { id: string; version: number; readonly: boolean; closed: boolean } => {
    const participant = authorize(id, accessToken, "read");
    const key = id.toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
    if (room.closed) throw new CollaborationError("ROOM_CLOSED", "共享房间已关闭");
    // 以凭证角色判定,而不是比对自报的 createdBy:clientId 可以被伪造,role 只能由邀请签发。
    if (participant.role !== "owner") throw new CollaborationError("FORBIDDEN", "只有创建者可以修改房间权限");
    const updatedAt = new Date(now()).toISOString();
    const nextRoom = action === "set-readonly"
      ? { ...room, readonly: !room.readonly, updatedAt }
      : { ...room, closed: true, updatedAt };
    rooms.set(key, nextRoom);
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

  return { create, get, createInvitation, join, authorize, apply, subscribe, listParticipants, refreshMember, leave, setAccess, getOperations, subscribeLifecycle } as RoomStore;
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
}
