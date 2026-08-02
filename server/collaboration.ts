import { randomBytes } from "node:crypto";
import {
  applyCollaborationOperations,
  areValidCollaborationOperations,
  collaborationPathsOverlap,
  type CollaborationOperation,
} from "../src/lib/collaboration-operations";

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

export class CollaborationError extends Error {
  constructor(
    public readonly code: "ROOM_NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSACTION" | "ROOM_LIMIT_REACHED" | "SUBSCRIBER_LIMIT_REACHED",
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
  }
}

type Listener = (room: CollaborationRoom) => void;
const MAX_TRACKED_TRANSACTIONS = 256;
const MAX_OPERATION_HISTORY = 256;

function defaultRoomId(): string {
  return randomBytes(9).toString("hex").slice(0, 12).toUpperCase();
}

export interface RoomStoreOptions {
  generateId?: () => string;
  maxRooms?: number;
  maxSubscribers?: number;
  roomTtlMs?: number;
  now?: () => number;
}

export function createRoomStore(input: (() => string) | RoomStoreOptions = {}): RoomStore {
  const options = typeof input === "function" ? { generateId: input } : input;
  const generateId = options.generateId ?? defaultRoomId;
  const maxRooms = options.maxRooms ?? 100;
  const maxSubscribers = options.maxSubscribers ?? 50;
  const roomTtlMs = options.roomTtlMs ?? 30 * 60 * 1000;
  const now = options.now ?? Date.now;
  const rooms = new Map<string, CollaborationRoom>();
  const listeners = new Map<string, Set<Listener>>();
  const transactions = new Map<string, Set<string>>();
  const operationHistory = new Map<string, Array<{ version: number; operations: CollaborationOperation[] }>>();
  const lastActivity = new Map<string, number>();

  const purgeExpired = () => {
    const threshold = now() - roomTtlMs;
    for (const [id, activity] of lastActivity) {
      if (activity > threshold) continue;
      rooms.delete(id);
      listeners.delete(id);
      transactions.delete(id);
      operationHistory.delete(id);
      lastActivity.delete(id);
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

  return {
    create<T>(snapshot: T | undefined, clientId: string): CollaborationRoom<T> {
      purgeExpired();
      if (rooms.size >= maxRooms) {
        throw new CollaborationError("ROOM_LIMIT_REACHED", "共享房间数量已达到上限");
      }
      let id = generateId().toUpperCase();
      while (rooms.has(id)) id = generateId().toUpperCase();
      const room: CollaborationRoom<T> = {
        id,
        version: 0,
        ...(snapshot === undefined ? {} : { snapshot: structuredClone(snapshot) }),
        ready: snapshot !== undefined,
        createdBy: clientId,
        updatedBy: clientId,
        updatedAt: new Date().toISOString(),
      };
      rooms.set(id, room);
      transactions.set(id, new Set());
      operationHistory.set(id, []);
      touch(id);
      return copyRoom(room);
    },
    get,
    apply<T>(id: string, transaction: RoomTransaction<T>): CollaborationRoom<T> {
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
            entry.operations.some((applied) => collaborationPathsOverlap(operation.path, applied.path))
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
        updatedAt: new Date().toISOString(),
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
    },
    subscribe(id: string, listener: Listener): () => void {
      purgeExpired();
      const key = id.toUpperCase();
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
    },
  };
}

export interface RoomStore {
  create<T>(snapshot: T | undefined, clientId: string): CollaborationRoom<T>;
  get: (id: string) => CollaborationRoom | undefined;
  apply<T>(id: string, transaction: RoomTransaction<T>): CollaborationRoom<T>;
  subscribe(id: string, listener: Listener): () => void;
}
