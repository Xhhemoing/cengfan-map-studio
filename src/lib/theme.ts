export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export const THEME_STORAGE_KEY = "cengfan-map-studio:theme-mode";

export type StudioSkin = "atelier" | "classic";

export const SKIN_STORAGE_KEY = "cengfan-map-studio:ui-skin";

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function loadThemeMode(storage?: Storage): ThemeMode {
  try {
    const value = (storage ?? window.localStorage).getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

export function saveThemeMode(mode: ThemeMode, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private browsing and quota errors should not block editor use.
  }
}

export function loadStudioSkin(storage?: Storage): StudioSkin {
  try {
    return (storage ?? window.localStorage).getItem(SKIN_STORAGE_KEY) === "classic"
      ? "classic"
      : "atelier";
  } catch {
    return "atelier";
  }
}

export function saveStudioSkin(skin: StudioSkin, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // Private browsing and quota errors should not block editor use.
  }
}
