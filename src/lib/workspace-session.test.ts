import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_SESSION,
  LEGACY_EDITOR_STORAGE_KEY,
  loadWorkspaceSession,
  parseWorkspaceSession,
  saveWorkspaceSession,
  serializeWorkspaceSession,
  workspaceSessionStorageKey,
  type WorkspaceSession,
} from "./workspace-session";
import type { SceneSelection } from "./scene-document";

describe("workspace session", () => {
  it("exports the explicit legacy compatibility storage key", () => {
    expect(LEGACY_EDITOR_STORAGE_KEY).toBe("cengfan-legacy-editor");
  });
  it("keeps project sessions separate from each other and the public editor", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const publicSession: WorkspaceSession = { stage: "export", savedAt: "public" };
    const projectSession: WorkspaceSession = { stage: "map", savedAt: "a" };
    saveWorkspaceSession(storage, publicSession);
    saveWorkspaceSession(storage, projectSession, workspaceSessionStorageKey("project-a"));

    expect(loadWorkspaceSession(storage, workspaceSessionStorageKey("project-a"))).toEqual(projectSession);
    expect(loadWorkspaceSession(storage, workspaceSessionStorageKey("project-b"))).toEqual(DEFAULT_WORKSPACE_SESSION);
    expect(loadWorkspaceSession(storage, workspaceSessionStorageKey())).toEqual(publicSession);
    expect(workspaceSessionStorageKey("a/b")).not.toBe(workspaceSessionStorageKey("a%2Fb"));
  });

  it.each<SceneSelection>([
    { type: "canvas" }, { type: "map" }, { type: "province", province: "浙江省" },
    { type: "cards" }, { type: "guests" }, { type: "text", id: "text-title" },
    { type: "asset", id: "asset-1" },
  ])("round-trips the complete $type selection", (selection) => {
    const session: WorkspaceSession = { stage: "content", selection, savedAt: "now" };
    expect(parseWorkspaceSession(serializeWorkspaceSession(session))).toEqual(session);
  });

  it.each([
    null, [], { type: "unknown" }, { type: "text" }, { type: "asset", id: "  " },
    { type: "province", province: "" },
  ])("ignores an invalid selection without discarding the stage or legacy selection: %j", (selection) => {
    expect(parseWorkspaceSession(JSON.stringify({ stage: "map", selection, selectedProvince: "浙江省", savedAt: "now" })))
      .toEqual({ stage: "map", selectedProvince: "浙江省", savedAt: "now" });
  });

  it("reads only supported selection fields", () => {
    expect(parseWorkspaceSession(JSON.stringify({ stage: "content", selection: { type: "text", id: "text-title", unexpected: "ignored" } })).selection)
      .toEqual({ type: "text", id: "text-title" });
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
