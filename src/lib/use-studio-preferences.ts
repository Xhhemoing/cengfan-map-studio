/**
 * Studio 外观与面板偏好:主题模式、皮肤、系统深色偏好、左右面板宽度与拖拽态,
 * 以及它们对 localStorage / documentElement 的持久化。从 App.tsx 原样搬出
 * (2026-08-24),存储键、默认值与 effect 依赖均未改动。
 *
 * 面板宽度是模块级单一状态:legacy 编辑器与六阶段外壳同时挂载时共享同一份布局、
 * 同一个 resize 归一化入口与同一次写盘,避免任一侧用未见过拖拽的旧值覆写存储。
 *
 * 生产路径尚未接线，仅测试引用(唯一的非测试引用方 DataImportConsent 同样未接线)。
 */
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
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

/**
 * 智能识别会把粘贴原文(含学生姓名)交给第三方模型,这里只保存用户对"是否允许发送"
 * 的选择。不勾选"记住"时不落盘,下次仍会重新询问。
 */
export type AiParseConsent = "granted" | "denied";

export const AI_PARSE_CONSENT_STORAGE_KEY = "cengfan-map-studio:ai-parse-consent";

export function loadAiParseConsent(storage?: Storage): AiParseConsent | null {
  try {
    const value = (storage ?? window.localStorage).getItem(AI_PARSE_CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function saveAiParseConsent(consent: AiParseConsent | null, storage?: Storage): void {
  try {
    const store = storage ?? window.localStorage;
    if (consent === null) store.removeItem(AI_PARSE_CONSENT_STORAGE_KEY);
    else store.setItem(AI_PARSE_CONSENT_STORAGE_KEY, consent);
  } catch {
    // 隐私模式或配额异常时退化为仅本次会话记住,不阻塞导入。
  }
}

export interface EditorPanelLayoutControls {
  panelLayout: EditorPanelLayout;
  resizingPanel: PanelSide | null;
  setResizingPanel: Dispatch<SetStateAction<PanelSide | null>>;
  sidebarBounds: PanelWidthBounds;
  inspectorBounds: PanelWidthBounds;
  updatePanelWidth: (side: PanelSide, value: number) => void;
}

export interface StudioPreferences extends EditorPanelLayoutControls {
  themeMode: ThemeMode;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  skin: StudioSkin;
  setSkin: Dispatch<SetStateAction<StudioSkin>>;
  prefersDark: boolean;
  resolvedTheme: ResolvedTheme;
  /** 供 workspace 容器消费的 CSS 自定义属性(面板宽度)。 */
  workspaceStyle: CSSProperties;
}

function currentViewportWidth(): number {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

const panelLayoutListeners = new Set<() => void>();
let panelLayoutSnapshot: EditorPanelLayout | null = null;

function getPanelLayoutSnapshot(): EditorPanelLayout {
  if (!panelLayoutSnapshot) panelLayoutSnapshot = readEditorPanelLayout();
  return panelLayoutSnapshot;
}

function persistPanelLayout(layout: EditorPanelLayout): void {
  try {
    writeEditorPanelLayout(window.localStorage, layout, window.innerWidth);
  } catch {
    // Panel sizing remains usable when browser storage is unavailable.
  }
}

function setPanelLayout(next: EditorPanelLayout): void {
  const current = getPanelLayoutSnapshot();
  if (next.sidebarWidth === current.sidebarWidth && next.inspectorWidth === current.inspectorWidth) return;
  panelLayoutSnapshot = next;
  persistPanelLayout(next);
  panelLayoutListeners.forEach((listener) => listener());
}

function onViewportResize(): void {
  setPanelLayout(normalizeEditorPanelLayout(getPanelLayoutSnapshot(), window.innerWidth));
}

function subscribePanelLayout(listener: () => void): () => void {
  panelLayoutListeners.add(listener);
  if (panelLayoutListeners.size === 1) {
    persistPanelLayout(getPanelLayoutSnapshot());
    window.addEventListener("resize", onViewportResize);
  }
  return () => {
    panelLayoutListeners.delete(listener);
    if (panelLayoutListeners.size === 0) {
      window.removeEventListener("resize", onViewportResize);
      // 无挂载消费者时丢弃缓存,下次挂载重新读取存储中的最新布局。
      panelLayoutSnapshot = null;
    }
  };
}

/**
 * 面板宽度的唯一持有者。所有编辑器外壳(legacy 与六阶段)共享同一份布局状态、
 * 同一个 resize 归一化与同一次写盘;拖拽态只在各自外壳内为本地 UI 状态。
 */
export function useEditorPanelLayout(): EditorPanelLayoutControls {
  const panelLayout = useSyncExternalStore(subscribePanelLayout, getPanelLayoutSnapshot, getPanelLayoutSnapshot);
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);

  const viewportWidth = currentViewportWidth();
  const sidebarBounds = getPanelWidthBounds("sidebar", viewportWidth, panelLayout.inspectorWidth);
  const inspectorBounds = getPanelWidthBounds("inspector", viewportWidth, panelLayout.sidebarWidth);

  const updatePanelWidth = (side: PanelSide, value: number) => {
    setPanelLayout(normalizeEditorPanelLayout({
      ...panelLayout,
      [side === "sidebar" ? "sidebarWidth" : "inspectorWidth"]: value,
    }, viewportWidth));
  };

  return {
    panelLayout,
    resizingPanel,
    setResizingPanel,
    sidebarBounds,
    inspectorBounds,
    updatePanelWidth,
  };
}

export function useStudioPreferences(): StudioPreferences {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => typeof window === "undefined" ? "system" : loadThemeMode());
  const [skin, setSkin] = useState<StudioSkin>(() => typeof window === "undefined" ? "atelier" : loadStudioSkin());
  const [prefersDark, setPrefersDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  const panelControls = useEditorPanelLayout();

  const resolvedTheme = resolveTheme(themeMode, prefersDark);
  const workspaceStyle = {
    "--sidebar-width": `${panelControls.panelLayout.sidebarWidth}px`,
    "--inspector-width": `${panelControls.panelLayout.inspectorWidth}px`,
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

  return {
    themeMode,
    setThemeMode,
    skin,
    setSkin,
    prefersDark,
    resolvedTheme,
    workspaceStyle,
    ...panelControls,
  };
}
