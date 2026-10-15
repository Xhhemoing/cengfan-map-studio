// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  loadStoredRenderSettings,
  mountUserFontFaces,
  nextWorkspaceSession,
  USER_FONT_STYLE_ELEMENT_ID,
} from "./editor-chrome";
import { RENDER_SETTINGS_KEY } from "./app-constants";
import type { UserFont } from "./fonts";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { DEFAULT_WORKSPACE_SESSION, type WorkspaceSession } from "./workspace-session";
import type { SceneSelection } from "./scene-document";

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: () => value };
}

describe("loadStoredRenderSettings", () => {
  it("returns the stored settings when they parse", () => {
    const stored = JSON.stringify({ mode: "fixed", fixedFps: 12 });

    expect(loadStoredRenderSettings(() => storageWith(stored))).toEqual({ mode: "fixed", fixedFps: 12 });
  });

  it("reads under the shared render settings key", () => {
    const keys: string[] = [];
    loadStoredRenderSettings(() => ({ getItem: (key: string) => { keys.push(key); return null; } }));

    expect(keys).toEqual([RENDER_SETTINGS_KEY]);
  });

  it("falls back to defaults for absent or corrupt values", () => {
    expect(loadStoredRenderSettings(() => storageWith(null))).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(loadStoredRenderSettings(() => storageWith("{not json"))).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(loadStoredRenderSettings(() => null)).toEqual(DEFAULT_RENDER_SETTINGS);
  });

  it("survives a browser that throws on storage access instead of blocking startup", () => {
    expect(loadStoredRenderSettings(() => { throw new Error("blocked"); })).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(loadStoredRenderSettings(() => ({ getItem: () => { throw new Error("blocked"); } }))).toEqual(DEFAULT_RENDER_SETTINGS);
  });

  it("hands back a fresh default object each time so a caller cannot poison the next load", () => {
    const first = loadStoredRenderSettings(() => null);
    first.fixedFps = 1;

    expect(loadStoredRenderSettings(() => null)).toEqual(DEFAULT_RENDER_SETTINGS);
  });
});

describe("nextWorkspaceSession", () => {
  const base: WorkspaceSession = { ...DEFAULT_WORKSPACE_SESSION, stage: "data", savedAt: "2024-01-01T00:00:00.000Z" };

  it("records the province behind a province selection", () => {
    const session = nextWorkspaceSession(base, {
      stage: "map",
      selection: { type: "province", province: "浙江省" },
      savedAt: "2024-02-02T00:00:00.000Z",
    });

    expect(session).toEqual({ stage: "map", selection: { type: "province", province: "浙江省" }, selectedProvince: "浙江省", savedAt: "2024-02-02T00:00:00.000Z" });
  });

  it("records cards and guests selections under the object key", () => {
    expect(nextWorkspaceSession(base, { stage: "frame", selection: { type: "cards" }, savedAt: "t" }).selectedObject).toBe("cards");
    expect(nextWorkspaceSession(base, { stage: "content", selection: { type: "guests" }, savedAt: "t" }).selectedObject).toBe("guests");
    expect(nextWorkspaceSession(base, { stage: "content", selection: { type: "asset", id: "el-1" }, savedAt: "t" }).selectedObject).toBe("el-1");
  });

  it("drops a previously stored selection once the canvas selection clears it", () => {
    const withProvince: WorkspaceSession = { ...base, selectedProvince: "浙江省", selectedObject: "cards" };

    const session = nextWorkspaceSession(withProvince, { stage: "content", selection: { type: "canvas" }, savedAt: "t" });

    expect("selectedProvince" in session).toBe(false);
    expect("selectedObject" in session).toBe(false);
    expect(session.selection).toEqual({ type: "canvas" });
  });

  it.each<SceneSelection>([
    { type: "text", id: "text-title" }, { type: "map" }, { type: "canvas" },
  ])("remembers $type selections and clears stale legacy object keys", (selection) => {
    const session = nextWorkspaceSession({ ...base, selectedObject: "old-asset", selectedProvince: "浙江省" }, {
      stage: "content", selection, savedAt: "now",
    });
    expect(session.selection).toEqual(selection);
    expect(session.selection).not.toBe(selection);
    expect(session.selectedObject).toBeUndefined();
    expect(session.selectedProvince).toBeUndefined();
  });

  it("stamps the current time when the caller does not supply one", () => {
    const session = nextWorkspaceSession(base, { stage: "map", selection: { type: "canvas" } });

    expect(Number.isNaN(Date.parse(session.savedAt))).toBe(false);
    expect(session.savedAt).not.toBe(base.savedAt);
  });
});

describe("mountUserFontFaces", () => {
  afterEach(() => {
    document.getElementById(USER_FONT_STYLE_ELEMENT_ID)?.remove();
  });

  function fixtureFont(id: string): UserFont {
    return { id, label: id, family: id, src: `data:font/woff2;base64,${id}`, format: "woff2", source: "user" };
  }

  it("creates one style element and reuses it across updates", () => {
    mountUserFontFaces([fixtureFont("f1")]);
    mountUserFontFaces([fixtureFont("f1"), fixtureFont("f2")]);

    expect(document.querySelectorAll(`#${USER_FONT_STYLE_ELEMENT_ID}`)).toHaveLength(1);
    expect(document.getElementById(USER_FONT_STYLE_ELEMENT_ID)?.textContent).toContain("f2");
  });

  it("drops the face of a removed font instead of leaving it live", () => {
    mountUserFontFaces([fixtureFont("f1")]);
    mountUserFontFaces([]);

    expect(document.getElementById(USER_FONT_STYLE_ELEMENT_ID)?.textContent).not.toContain("f1");
  });

  it("does nothing without a document", () => {
    expect(() => mountUserFontFaces([fixtureFont("f1")], undefined)).not.toThrow();
  });
});
