import type { CollaborationOperation } from "../src/lib/collaboration-operations";

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

export type LifecycleEvent =
  | { kind: "members"; room: CollaborationRoom; members: RoomMember[] }
  | { kind: "access"; room: CollaborationRoom; members: RoomMember[] }
  | { kind: "closed"; room: CollaborationRoom; members: RoomMember[] };

export interface RoomStoreOptions {
  generateId?: () => string;
  generateSecret?: () => string;
  maxRooms?: number;
  maxSubscribers?: number;
  maxSnapshotBytes?: number;
  roomTtlMs?: number;
  invitationTtlMs?: number;
  now?: () => number;
}

type Listener = (room: CollaborationRoom) => void;
type LifecycleListener = (event: LifecycleEvent) => void;

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
