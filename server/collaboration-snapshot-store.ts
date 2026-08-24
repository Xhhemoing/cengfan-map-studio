import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { CollaborationOperation } from "../src/lib/collaboration-operations";
import type {
  CollaborationRoom,
  CollaborationRole,
  RoomMember,
  RoomParticipant,
} from "./collaboration-types";

export interface PersistedInvitationRecord {
  role: Exclude<CollaborationRole, "owner">;
  expiresAt: number;
}

export interface PersistedRevokedAccessRecord {
  participant: RoomParticipant;
  leaveResult: { id: string; version: number; members: RoomMember[] };
}

export interface PersistedRoomState {
  schemaVersion: 1;
  room: CollaborationRoom;
  lastActivity: number;
  accessRecords: Array<[string, RoomParticipant]>;
  revokedAccessRecords: Array<[string, PersistedRevokedAccessRecord]>;
  invitations: Array<[string, PersistedInvitationRecord]>;
  transactions: string[];
  operationHistory: Array<{ version: number; operations: CollaborationOperation[] }>;
  legacy: boolean;
}

export interface RoomSnapshotStore {
  load(): PersistedRoomState[];
  save(state: PersistedRoomState): void;
  delete(roomId: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRole(value: unknown): value is CollaborationRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

function isMember(value: unknown): value is RoomMember {
  return isRecord(value)
    && typeof value.clientId === "string"
    && isRole(value.role)
    && typeof value.joinedAt === "string"
    && typeof value.lastSeenAt === "string";
}

function isParticipant(value: unknown): value is RoomParticipant {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.displayName === "string"
    && isRole(value.role)
    && !("accessToken" in value);
}

function isHashedRecord<T>(
  value: unknown,
  validate: (record: unknown) => record is T,
): value is Array<[string, T]> {
  return Array.isArray(value) && value.every((entry) =>
    Array.isArray(entry)
    && entry.length === 2
    && typeof entry[0] === "string"
    && /^[a-f0-9]{64}$/.test(entry[0])
    && validate(entry[1])
  );
}

function isRoom(value: unknown): value is CollaborationRoom {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && Number.isInteger(value.version)
    && typeof value.ready === "boolean"
    && typeof value.createdBy === "string"
    && typeof value.updatedBy === "string"
    && typeof value.updatedAt === "string"
    && Array.isArray(value.members)
    && value.members.every(isMember);
}

function isInvitation(value: unknown): value is PersistedInvitationRecord {
  return isRecord(value)
    && (value.role === "editor" || value.role === "viewer")
    && typeof value.expiresAt === "number"
    && Number.isFinite(value.expiresAt);
}

function isRevokedAccess(value: unknown): value is PersistedRevokedAccessRecord {
  return isRecord(value)
    && isParticipant(value.participant)
    && isRecord(value.leaveResult)
    && typeof value.leaveResult.id === "string"
    && Number.isInteger(value.leaveResult.version)
    && Array.isArray(value.leaveResult.members)
    && value.leaveResult.members.every(isMember);
}

function isPersistedRoomState(value: unknown): value is PersistedRoomState {
  return isRecord(value)
    && value.schemaVersion === 1
    && isRoom(value.room)
    && typeof value.lastActivity === "number"
    && Number.isFinite(value.lastActivity)
    && isHashedRecord(value.accessRecords, isParticipant)
    && isHashedRecord(value.revokedAccessRecords, isRevokedAccess)
    && isHashedRecord(value.invitations, isInvitation)
    && Array.isArray(value.transactions)
    && value.transactions.every((transaction) => typeof transaction === "string")
    && Array.isArray(value.operationHistory)
    && value.operationHistory.every((entry) =>
      isRecord(entry)
      && Number.isInteger(entry.version)
      && Array.isArray(entry.operations)
    )
    && typeof value.legacy === "boolean";
}

function roomFileName(roomId: string): string {
  return /^[A-Z0-9]+$/.test(roomId)
    ? `${roomId}.json`
    : `${Buffer.from(roomId, "utf8").toString("base64url")}.json`;
}

export function createFileRoomSnapshotStore(directory: string): RoomSnapshotStore {
  const storeDirectory = resolve(directory);
  mkdirSync(storeDirectory, { recursive: true, mode: 0o700 });

  return {
    load() {
      const states: PersistedRoomState[] = [];
      for (const entry of readdirSync(storeDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const parsed = JSON.parse(readFileSync(resolve(storeDirectory, entry.name), "utf8")) as unknown;
          if (isPersistedRoomState(parsed)) states.push(parsed);
        } catch {
          // A corrupt or partially copied snapshot must not prevent other rooms from loading.
        }
      }
      return states;
    },
    save(state) {
      const target = resolve(storeDirectory, roomFileName(state.room.id));
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      try {
        writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, target);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
    },
    delete(roomId) {
      const target = resolve(storeDirectory, roomFileName(roomId));
      if (existsSync(target)) unlinkSync(target);
    },
  };
}
