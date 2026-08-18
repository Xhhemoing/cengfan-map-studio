import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_SESSION,
  LEGACY_EDITOR_STORAGE_KEY,
  loadWorkspaceSession,
  parseWorkspaceSession,
  saveWorkspaceSession,
  serializeWorkspaceSession,
  type WorkspaceSession,
} from "./workspace-session";

describe("workspace session", () => {
  it("keeps the retired legacy editor storage key for old browsers", () => {
    expect(LEGACY_EDITOR_STORAGE_KEY).toBe("cengfan-legacy-editor");
  });
  it("round-trips a valid session without putting it in the project document", () => {
    const session: WorkspaceSession = {
      stage: "content",
      selectedProvince: "浙江省",
      selectedObject: "card-1",
      savedAt: "2026-08-05T10:00:00.000Z",
    };

    expect(parseWorkspaceSession(serializeWorkspaceSession(session))).toEqual(session);
  });

  it("falls back to the template stage for missing, malformed, or invalid sessions", () => {
    expect(parseWorkspaceSession(null)).toEqual(DEFAULT_WORKSPACE_SESSION);
    expect(parseWorkspaceSession("not-json")).toEqual(DEFAULT_WORKSPACE_SESSION);
    expect(parseWorkspaceSession(JSON.stringify({ stage: "roster" }))).toEqual(DEFAULT_WORKSPACE_SESSION);
  });

  it("safely loads and saves through a storage-like object", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const session: WorkspaceSession = { ...DEFAULT_WORKSPACE_SESSION, stage: "map", savedAt: "now" };

    saveWorkspaceSession(storage, session);
    expect(loadWorkspaceSession(storage)).toEqual(session);

    expect(loadWorkspaceSession({
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    })).toEqual(DEFAULT_WORKSPACE_SESSION);
  });
});
