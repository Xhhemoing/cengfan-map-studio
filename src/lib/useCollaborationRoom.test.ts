import { afterEach, describe, expect, it } from "vitest";
import { COLLABORATION_CLIENT_ID_KEY } from "./app-constants";
import { loadCollaborationClientId } from "./useCollaborationRoom";

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
