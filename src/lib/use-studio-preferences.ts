/**
 * Studio 外观与面板偏好:主题模式、皮肤、系统深色偏好、左右面板宽度与拖拽态,
 * 以及它们对 localStorage / documentElement 的持久化。从 App.tsx 原样搬出
 * (2026-08-24),存储键、默认值与 effect 依赖均未改动。
 */
import { useEffect, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import {
  getPanelWidthBounds,
  normalizeEditorPanelLayout,
  readEditorPanelLayout,
  writeEditorPanelLayout,
  type EditorPanelLayout,
  type PanelSide,
  type PanelWidthBounds,
} from "./editor-layout";
import {
  loadStudioSkin,
  loadThemeMode,
  resolveTheme,
  saveStudioSkin,
  saveThemeMode,
  type ResolvedTheme,
  type StudioSkin,
  type ThemeMode,
} from "./theme";

export interface StudioPreferences {
  themeMode: ThemeMode;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  skin: StudioSkin;
  setSkin: Dispatch<SetStateAction<StudioSkin>>;
  prefersDark: boolean;
  resolvedTheme: ResolvedTheme;
  panelLayout: EditorPanelLayout;
  resizingPanel: PanelSide | null;
  setResizingPanel: Dispatch<SetStateAction<PanelSide | null>>;
  sidebarBounds: PanelWidthBounds;
  inspectorBounds: PanelWidthBounds;
  /** 供 workspace 容器消费的 CSS 自定义属性(面板宽度)。 */
  workspaceStyle: CSSProperties;
  updatePanelWidth: (side: PanelSide, value: number) => void;
}

export function useStudioPreferences(): StudioPreferences {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => typeof window === "undefined" ? "system" : loadThemeMode());
  const [skin, setSkin] = useState<StudioSkin>(() => typeof window === "undefined" ? "atelier" : loadStudioSkin());
  const [prefersDark, setPrefersDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  const [panelLayout, setPanelLayout] = useState<EditorPanelLayout>(() => readEditorPanelLayout());
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);

  const resolvedTheme = resolveTheme(themeMode, prefersDark);
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const sidebarBounds = getPanelWidthBounds("sidebar", viewportWidth, panelLayout.inspectorWidth);
  const inspectorBounds = getPanelWidthBounds("inspector", viewportWidth, panelLayout.sidebarWidth);
  const workspaceStyle = {
    "--sidebar-width": `${panelLayout.sidebarWidth}px`,
    "--inspector-width": `${panelLayout.inspectorWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    saveStudioSkin(skin);
  }, [skin]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.editorTheme = resolvedTheme;
    root.dataset.editorSkin = skin;
    root.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  }, [resolvedTheme, skin]);

  useEffect(() => {
    try {
      writeEditorPanelLayout(window.localStorage, panelLayout, window.innerWidth);
    } catch {
      // Panel sizing remains usable when browser storage is unavailable.
    }
  }, [panelLayout]);

  useEffect(() => {
    const onResize = () => {
      setPanelLayout((current) => normalizeEditorPanelLayout(current, window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const updatePanelWidth = (side: PanelSide, value: number) => {
    setPanelLayout((current) => normalizeEditorPanelLayout({
      ...current,
      [side === "sidebar" ? "sidebarWidth" : "inspectorWidth"]: value,
    }, viewportWidth));
  };

  return {
    themeMode,
    setThemeMode,
    skin,
    setSkin,
    prefersDark,
    resolvedTheme,
    panelLayout,
    resizingPanel,
    setResizingPanel,
    sidebarBounds,
    inspectorBounds,
    workspaceStyle,
    updatePanelWidth,
  };
}
