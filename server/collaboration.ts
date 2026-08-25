import {
  applyCollaborationOperations,
  areValidCollaborationOperations,
  collaborationOperationsOverlap,
  type CollaborationOperation,
} from "../src/lib/collaboration-operations";
import {
  createRoomLifecycle,
  type LifecycleListener,
} from "./collaboration-lifecycle";
import type {
  CollaborationRoom,
  RoomParticipant,
  RoomStore,
  RoomStoreOptions,
  RoomTransaction,
} from "./collaboration-types";
import { CollaborationError } from "./collaboration-error";
import {
  createFileRoomSnapshotStore,
  type PersistedInvitationRecord,
  type PersistedRevokedAccessRecord,
} from "./collaboration-snapshot-store";
import {
  assertSnapshotSize,
  defaultRoomId,
  defaultSecret,
  publicParticipant,
} from "./collaboration-utils";

export type * from "./collaboration-types";
export { CollaborationError } from "./collaboration-error";

type Listener = (room: CollaborationRoom) => void;
type InvitationRecord = PersistedInvitationRecord;
const MAX_TRACKED_TRANSACTIONS = 256;
const MAX_OPERATION_HISTORY = 256;
const DEFAULT_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

type RevokedAccessRecord = PersistedRevokedAccessRecord;

export function createRoomStore(input: (() => string) | RoomStoreOptions = {}): RoomStore {
  const options = typeof input === "function" ? { generateId: input } : input;
  const generateId = options.generateId ?? defaultRoomId;
  const generateSecret = options.generateSecret ?? defaultSecret;
  const maxRooms = options.maxRooms ?? 100;
  const maxSubscribers = options.maxSubscribers ?? 50;
  const maxSnapshotBytes = options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
  const roomTtlMs = options.roomTtlMs ?? 30 * 60 * 1000;
  const invitationTtlMs = options.invitationTtlMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  const configuredStoreDir = options.storeDir ?? process.env.COLLAB_STORE_DIR;
  const snapshotStore = configuredStoreDir?.trim()
    ? createFileRoomSnapshotStore(configuredStoreDir.trim())
    : undefined;
  const rooms = new Map<string, CollaborationRoom>();
  const listeners = new Map<string, Set<Listener>>();
  const lifecycleListeners = new Map<string, Set<LifecycleListener>>();
  const transactions = new Map<string, Set<string>>();
  const operationHistory = new Map<string, Array<{ version: number; operations: CollaborationOperation[] }>>();
  const lastActivity = new Map<string, number>();
  const accessRecords = new Map<string, Map<string, RoomParticipant>>();
  const revokedAccessRecords = new Map<string, Map<string, RevokedAccessRecord>>();
  const invitations = new Map<string, Map<string, InvitationRecord>>();
  const legacyRoomIds = new Set<string>();

  for (const state of snapshotStore?.load() ?? []) {
    const id = state.room.id.toUpperCase();
    if (rooms.size >= maxRooms || rooms.has(id)) continue;
    rooms.set(id, state.room);
    accessRecords.set(id, new Map(state.accessRecords));
    revokedAccessRecords.set(id, new Map(state.revokedAccessRecords));
    invitations.set(id, new Map(state.invitations));
    transactions.set(id, new Set(state.transactions));
    operationHistory.set(id, state.operationHistory);
    lastActivity.set(id, state.lastActivity);
    if (state.legacy) legacyRoomIds.add(id);
  }

  const persistRoom = (id: string) => {
    if (!snapshotStore) return;
    const room = rooms.get(id);
    const activity = lastActivity.get(id);
    if (!room || activity === undefined) return;
    snapshotStore.save({
      schemaVersion: 1,
      room,
      lastActivity: activity,
      accessRecords: Array.from(
        accessRecords.get(id) ?? [],
        ([hash, participant]): [string, RoomParticipant] => [hash, publicParticipant(participant)],
      ),
      revokedAccessRecords: Array.from(
        revokedAccessRecords.get(id) ?? [],
        ([hash, record]): [string, RevokedAccessRecord] => [
          hash,
          { ...record, participant: publicParticipant(record.participant) },
        ],
      ),
      invitations: Array.from(invitations.get(id) ?? []),
      transactions: Array.from(transactions.get(id) ?? []),
      operationHistory: operationHistory.get(id) ?? [],
      legacy: legacyRoomIds.has(id),
    });
  };

  const purgeExpired = () => {
    const threshold = now() - roomTtlMs;
    for (const [id, activity] of lastActivity) {
      if (activity > threshold) continue;
      rooms.delete(id);
      listeners.delete(id);
      lifecycleListeners.delete(id);
      transactions.delete(id);
      operationHistory.delete(id);
      lastActivity.delete(id);
      accessRecords.delete(id);
      revokedAccessRecords.delete(id);
      invitations.delete(id);
      legacyRoomIds.delete(id);
      snapshotStore?.delete(id);
    }
  };

  const touch = (id: string) => {
    lastActivity.set(id, now());
  };

  const copyRoom = <T>(room: CollaborationRoom<T>): CollaborationRoom<T> => ({ ...room });

  const get = (id: string) => {
    purgeExpired();
    const room = rooms.get(id.toUpperCase());
    if (room) {
      touch(room.id);
      persistRoom(room.id);
    }
    return room ? copyRoom(room) : undefined;
  };

  const {
    create,
    createInvitation,
    join,
    authorize,
    listParticipants,
    refreshMember,
    leave,
    setAccess,
    subscribeLifecycle,
  } = createRoomLifecycle({
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
    initializeRoomState: (id) => {
      transactions.set(id, new Set());
      operationHistory.set(id, []);
    },
    touch,
    persistRoom,
  });

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
    assertSnapshotSize(nextSnapshot, maxSnapshotBytes);
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
    persistRoom(key);
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

  return { create, get, createInvitation, join, authorize, apply, subscribe, listParticipants, refreshMember, leave, setAccess, getOperations, subscribeLifecycle } as RoomStore;
}
