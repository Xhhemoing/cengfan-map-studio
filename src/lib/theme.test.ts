import { describe, expect, it } from "vitest";
import {
  loadStudioSkin,
  loadThemeMode,
  resolveTheme,
  saveStudioSkin,
  saveThemeMode,
  type ThemeMode,
} from "./theme";

describe("theme preference", () => {
  it.each([
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
    ["system", false, "light"],
    ["system", true, "dark"],
  ] satisfies Array<[ThemeMode, boolean, "light" | "dark"]>)(
    "resolves %s with prefersDark=%s to %s",
    (mode, prefersDark, expected) => {
      expect(resolveTheme(mode, prefersDark)).toBe(expected);
    },
  );

  it("falls back to system for invalid stored values", () => {
    const storage = { getItem: () => "neon" } as unknown as Storage;
    expect(loadThemeMode(storage)).toBe("system");
  });

  it("persists a supported mode and ignores storage failures", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } as unknown as Storage;
    saveThemeMode("dark", storage);
    expect(loadThemeMode(storage)).toBe("dark");

    expect(() => saveThemeMode("system", { setItem: () => { throw new Error("quota"); } } as unknown as Storage)).not.toThrow();
  });

  it("uses Atelier when no valid skin preference was saved", () => {
    const storage = { getItem: () => null } as unknown as Storage;
    expect(loadStudioSkin(storage)).toBe("atelier");
  });

  it("persists Classic without changing the color-theme preference key", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } as unknown as Storage;

    saveStudioSkin("classic", storage);

    expect(loadStudioSkin(storage)).toBe("classic");
    expect(values.get("cengfan-map-studio:theme-mode")).toBeUndefined();
  });
});
