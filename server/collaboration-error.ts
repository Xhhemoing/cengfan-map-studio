export type CollaborationErrorCode =
  | "ROOM_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSACTION"
  | "ROOM_LIMIT_REACHED"
  | "SUBSCRIBER_LIMIT_REACHED"
  | "ROOM_FORBIDDEN"
  | "INVITATION_INVALID"
  | "INVITATION_EXPIRED"
  | "ALREADY_JOINED"
  | "SNAPSHOT_TOO_LARGE"
  | "FORBIDDEN"
  | "READONLY_ROOM"
  | "ROOM_CLOSED"
  | "ROOM_INITIALIZING";

export class CollaborationError extends Error {
  constructor(
    public readonly code: CollaborationErrorCode,
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
  }
}
