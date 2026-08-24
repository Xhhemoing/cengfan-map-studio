import { describe, expect, it } from "vitest";
import { COLLABORATION_DISPLAY_NAME, COLLABORATION_DISPLAY_NAME_KEY } from "./app-constants";
import type { RoomMember } from "./collaboration-client";
import {
  MAX_DISPLAY_NAME_LENGTH,
  describeRole,
  loadDisplayName,
  mergeRoomRoster,
  normalizeDisplayName,
  saveDisplayName,
} from "./collaboration-identity";

function memoryStorage(initial: Record<string, string> = {}): { storage: Storage; values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  } as unknown as Storage;
  return { storage, values };
}

function member(clientId: string, role: RoomMember["role"], joinedAt: string): RoomMember {
  return { clientId, role, joinedAt, lastSeenAt: joinedAt };
}

describe("normalizeDisplayName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeDisplayName("  小 林  ")).toBe("小 林");
    expect(normalizeDisplayName("张   委员")).toBe("张 委员");
  });

  it("removes control characters and newlines", () => {
    expect(normalizeDisplayName("a\nb\tc\rd")).toBe("abcd");
  });

  it("truncates to the max length by code points without splitting surrogate pairs", () => {
    expect(normalizeDisplayName("甲".repeat(30))).toBe("甲".repeat(MAX_DISPLAY_NAME_LENGTH));
    const emoji = "😀".repeat(MAX_DISPLAY_NAME_LENGTH + 5);
    const result = normalizeDisplayName(emoji);
    expect(result).toBe("😀".repeat(MAX_DISPLAY_NAME_LENGTH));
    expect(Array.from(result)).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it("falls back to the default name for empty input", () => {
    expect(normalizeDisplayName("")).toBe(COLLABORATION_DISPLAY_NAME);
    expect(normalizeDisplayName("   ")).toBe(COLLABORATION_DISPLAY_NAME);
    expect(normalizeDisplayName("\n\t")).toBe(COLLABORATION_DISPLAY_NAME);
    expect(normalizeDisplayName(null)).toBe(COLLABORATION_DISPLAY_NAME);
    expect(normalizeDisplayName(undefined)).toBe(COLLABORATION_DISPLAY_NAME);
  });

  it("is idempotent", () => {
    for (const sample of ["  小 林  ", "a\nb", "甲".repeat(30), "", "😀".repeat(25)]) {
      const once = normalizeDisplayName(sample);
      expect(normalizeDisplayName(once)).toBe(once);
    }
  });
});

describe("loadDisplayName / saveDisplayName", () => {
  it("round-trips through storage, normalizing on write", () => {
    const { storage, values } = memoryStorage();
    saveDisplayName("  张 委员  ", storage);
    expect(values.get(COLLABORATION_DISPLAY_NAME_KEY)).toBe("张 委员");
    expect(loadDisplayName(storage)).toBe("张 委员");
  });

  it("returns the default name when nothing was stored", () => {
    expect(loadDisplayName(memoryStorage().storage)).toBe(COLLABORATION_DISPLAY_NAME);
  });

  it("normalizes corrupted stored values on read", () => {
    const { storage } = memoryStorage({ [COLLABORATION_DISPLAY_NAME_KEY]: "   " });
    expect(loadDisplayName(storage)).toBe(COLLABORATION_DISPLAY_NAME);
    const { storage: overlong } = memoryStorage({ [COLLABORATION_DISPLAY_NAME_KEY]: "乙".repeat(99) });
    expect(loadDisplayName(overlong)).toBe("乙".repeat(MAX_DISPLAY_NAME_LENGTH));
  });

  it("never throws on storage failures", () => {
    const broken = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
    } as unknown as Storage;
    expect(loadDisplayName(broken)).toBe(COLLABORATION_DISPLAY_NAME);
    expect(() => saveDisplayName("小林", broken)).not.toThrow();
  });
});

describe("describeRole", () => {
  it("gives each role a distinct text label and capability", () => {
    expect(describeRole("owner")).toEqual({ label: "创建者", capability: "可编辑并邀请" });
    expect(describeRole("editor")).toEqual({ label: "编辑者", capability: "可编辑" });
    expect(describeRole("viewer")).toEqual({ label: "仅查看", capability: "不可修改" });
    const labels = new Set([describeRole("owner").label, describeRole("editor").label, describeRole("viewer").label]);
    expect(labels.size).toBe(3);
  });

  it("keeps the pending-permission wording for null", () => {
    expect(describeRole(null).label).toBe("正在确认权限");
  });
});

describe("mergeRoomRoster", () => {
  it("puts the own row first with the local nickname", () => {
    const entries = mergeRoomRoster({
      members: [
        member("client-owner", "owner", "2026-08-24T10:00:00.000Z"),
        member("client-self", "viewer", "2026-08-24T10:05:00.000Z"),
      ],
      ownClientId: "client-self",
      ownDisplayName: "张委员",
    });
    expect(entries[0]).toMatchObject({ clientId: "client-self", displayName: "张委员", isSelf: true, isAnonymous: false });
  });

  it("labels other members with a clientId slice and marks them anonymous", () => {
    const entries = mergeRoomRoster({
      members: [
        member("client-self", "owner", "2026-08-24T10:00:00.000Z"),
        member("abcdef123456", "editor", "2026-08-24T10:05:00.000Z"),
      ],
      ownClientId: "client-self",
      ownDisplayName: "张委员",
    });
    const other = entries.find((entry) => !entry.isSelf)!;
    expect(other.displayName).toBe("成员 abcdef");
    expect(other.isAnonymous).toBe(true);
  });

  it("orders owner → editor → viewer, then by joinedAt", () => {
    const entries = mergeRoomRoster({
      members: [
        member("viewer-late", "viewer", "2026-08-24T10:20:00.000Z"),
        member("editor-late", "editor", "2026-08-24T10:15:00.000Z"),
        member("editor-early", "editor", "2026-08-24T10:05:00.000Z"),
        member("the-owner", "owner", "2026-08-24T10:00:00.000Z"),
      ],
      ownClientId: "client-self",
      ownDisplayName: "张委员",
    });
    expect(entries.map((entry) => entry.clientId)).toEqual(["the-owner", "editor-early", "editor-late", "viewer-late"]);
  });

  it("normalizes the own display name and never yields an empty name", () => {
    const entries = mergeRoomRoster({
      members: [member("client-self", "owner", "2026-08-24T10:00:00.000Z")],
      ownClientId: "client-self",
      ownDisplayName: "   ",
    });
    expect(entries[0]!.displayName).toBe(COLLABORATION_DISPLAY_NAME);
  });

  it("returns an empty roster for no members", () => {
    expect(mergeRoomRoster({ members: [], ownClientId: "client-self", ownDisplayName: "张委员" })).toEqual([]);
  });
});
