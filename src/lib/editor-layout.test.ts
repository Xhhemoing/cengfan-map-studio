import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_PANEL_LAYOUT,
  EDITOR_PANEL_LAYOUT_STORAGE_KEY,
  getPanelWidthBounds,
  normalizeEditorPanelLayout,
  readEditorPanelLayout,
  type StorageLike,
  writeEditorPanelLayout,
} from "./editor-layout";

describe("editor panel layout", () => {
  it("defines readable defaults for both side panels", () => {
    expect(DEFAULT_EDITOR_PANEL_LAYOUT).toEqual({ sidebarWidth: 220, inspectorWidth: 280 });
  });

  it("clamps each panel to its own desktop bounds", () => {
    expect(getPanelWidthBounds("sidebar", 1440, 280)).toEqual({ min: 180, max: 360 });
    expect(getPanelWidthBounds("inspector", 1440, 220)).toEqual({ min: 220, max: 420 });
  });

  it("keeps the center canvas minimum when both panels are wide", () => {
    expect(normalizeEditorPanelLayout({ sidebarWidth: 999, inspectorWidth: 999 }, 1121)).toEqual({
      sidebarWidth: 221,
      inspectorWidth: 420,
    });
  });

  it("falls back to defaults when persisted JSON is invalid", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as StorageLike;

    adapter.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, "not-json");

    expect(readEditorPanelLayout(adapter, 1440)).toEqual(DEFAULT_EDITOR_PANEL_LAYOUT);
  });

  it("writes normalized panel widths to storage", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as StorageLike;

    writeEditorPanelLayout(adapter, { sidebarWidth: 10, inspectorWidth: 999 }, 1440);

    expect(JSON.parse(storage.get(EDITOR_PANEL_LAYOUT_STORAGE_KEY) ?? "{}")).toEqual({
      sidebarWidth: 180,
      inspectorWidth: 420,
    });
  });
});
