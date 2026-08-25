/**
 * Local collaboration identity: a per-device room nickname persisted in
 * localStorage (a preference, not an account) plus role/roster helpers for
 * the collaboration popover. The nickname only travels through the existing
 * create/join `displayName` request field — the room protocol and server are
 * untouched, so other members' live names remain clientId slices this round.
 */
import { COLLABORATION_DISPLAY_NAME, COLLABORATION_DISPLAY_NAME_KEY } from "./app-constants";
import type { CollaborationRole, RoomMember } from "./collaboration-client";

export const MAX_DISPLAY_NAME_LENGTH = 20;

/** Strips control characters, collapses whitespace, truncates by code point, and falls back to the default name. */
export function normalizeDisplayName(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_LENGTH).join("").trim();
  return truncated === "" ? COLLABORATION_DISPLAY_NAME : truncated;
}

export function loadDisplayName(storage?: Storage): string {
  try {
    return normalizeDisplayName((storage ?? window.localStorage).getItem(COLLABORATION_DISPLAY_NAME_KEY));
  } catch {
    return COLLABORATION_DISPLAY_NAME;
  }
}

export function saveDisplayName(name: string, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(COLLABORATION_DISPLAY_NAME_KEY, normalizeDisplayName(name));
  } catch {
    // Private browsing and quota errors should not block collaboration.
  }
}

export interface RoleDescription {
  /** Role name for the visible text badge: 创建者 / 编辑者 / 仅查看. */
  label: string;
  /** Capability wording for aria-labels: 可编辑并邀请 / 可编辑 / 不可修改. */
  capability: string;
}

export function describeRole(role: CollaborationRole | null): RoleDescription {
  switch (role) {
    case "owner":
      return { label: "创建者", capability: "可编辑并邀请" };
    case "editor":
      return { label: "编辑者", capability: "可编辑" };
    case "viewer":
      return { label: "仅查看", capability: "不可修改" };
    default:
      return { label: "正在确认权限", capability: "权限确认中" };
  }
}

export interface RosterEntry {
  clientId: string;
  displayName: string;
  role: CollaborationRole;
  isSelf: boolean;
  /** True when only a clientId slice is available: the SSE members event carries no displayName. */
  isAnonymous: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

const ROLE_ORDER: Record<CollaborationRole, number> = { owner: 0, editor: 1, viewer: 2 };

/**
 * Turns the live member list into a renderable roster: the own row carries
 * the local nickname and sorts first; others keep clientId-slice placeholders.
 * Ordering: self → owner → editor → viewer, ties broken by joinedAt.
 */
export function mergeRoomRoster(input: {
  members: RoomMember[];
  ownClientId: string;
  ownDisplayName: string;
}): RosterEntry[] {
  const ownDisplayName = normalizeDisplayName(input.ownDisplayName);
  return [...input.members]
    .sort((a, b) => {
      const aSelf = a.clientId === input.ownClientId;
      const bSelf = b.clientId === input.ownClientId;
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      return a.joinedAt.localeCompare(b.joinedAt);
    })
    .map((member) => {
      const isSelf = member.clientId === input.ownClientId;
      return {
        clientId: member.clientId,
        displayName: isSelf ? ownDisplayName : `成员 ${member.clientId.slice(0, 6)}`,
        role: member.role,
        isSelf,
        isAnonymous: !isSelf,
        joinedAt: member.joinedAt,
        lastSeenAt: member.lastSeenAt,
      };
    });
}
