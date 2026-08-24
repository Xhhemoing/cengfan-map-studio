import { afterEach, describe, expect, it } from "vitest";
import { COLLABORATION_CLIENT_ID_KEY, ROOM_ACCESS_STORAGE_PREFIX, ROOM_LAST_ACTIVE_KEY } from "./app-constants";
import { loadCollaborationClientId, loadRecentRoomId } from "./useCollaborationRoom";

describe("loadCollaborationClientId", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("creates the clientId once and reuses it on later loads (I-12-03)", () => {
    const first = loadCollaborationClientId(() => "collab-client-fixed01");

    expect(first).toBe("collab-client-fixed01");
    expect(window.localStorage.getItem(COLLABORATION_CLIENT_ID_KEY)).toBe("collab-client-fixed01");

    // 第二次加载不再新建：刷新回连仍是同一个「我」。
    const second = loadCollaborationClientId(() => "collab-client-other02");
    expect(second).toBe("collab-client-fixed01");
  });

  it("generates a random default clientId when none is persisted", () => {
    const generated = loadCollaborationClientId();

    expect(generated.startsWith("collab-client-")).toBe(true);
    expect(window.localStorage.getItem(COLLABORATION_CLIENT_ID_KEY)).toBe(generated);
  });
});

describe("loadRecentRoomId", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("prefers the last active room whose credential is still stored (I-13-02)", () => {
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOMAAAA0001`, "token-a");
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOMBBBB0002`, "token-b");
    window.localStorage.setItem(ROOM_LAST_ACTIVE_KEY, "ROOMBBBB0002");

    expect(loadRecentRoomId()).toBe("ROOMBBBB0002");
  });

  it("falls back to a stored room credential when no last-active marker exists", () => {
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOMCCCC0003`, "token-c");

    expect(loadRecentRoomId()).toBe("ROOMCCCC0003");
  });

  it("ignores a stale last-active marker without a credential and returns empty when none exist", () => {
    window.localStorage.setItem(ROOM_LAST_ACTIVE_KEY, "ROOMGONE0004");

    expect(loadRecentRoomId()).toBe("");
  });
});
