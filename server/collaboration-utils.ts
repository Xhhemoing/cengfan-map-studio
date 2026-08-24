import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CollaborationError } from "./collaboration-error";
import type { RoomParticipant } from "./collaboration-types";

export function defaultRoomId(): string {
  return randomBytes(9).toString("hex").slice(0, 12).toUpperCase();
}

export function defaultSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function tokenHash(secret: string): string {
  return hashSecret(secret);
}

export function tokenMatches(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export function publicParticipant(participant: RoomParticipant): RoomParticipant {
  return { ...participant };
}

export function assertSnapshotSize(snapshot: unknown, maxSnapshotBytes: number): void {
  if (snapshot === undefined) return;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    throw new CollaborationError("INVALID_TRANSACTION", "协作快照无法序列化");
  }
  if (serialized === undefined) {
    throw new CollaborationError("INVALID_TRANSACTION", "协作快照格式无效");
  }
  if (Buffer.byteLength(serialized, "utf8") > maxSnapshotBytes) {
    throw new CollaborationError("SNAPSHOT_TOO_LARGE", "协作快照超过大小限制");
  }
}
