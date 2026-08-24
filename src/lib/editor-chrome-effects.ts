/**
 * 编辑器外壳与浏览器之间的单向同步:会话落盘、主题/皮肤持久化与根节点数据属性、
 * 面板宽度写回与视口重排、用户字体挂载。这一组 effect 都只把已有状态推给浏览器,
 * 不派生任何新状态,因此整组一起从 App 搬出;声明顺序照旧,便于逐条对照原实现。
 */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { loadBrowserValue } from "./app-initialization";
import { mountUserFontFaces, nextWorkspaceSession } from "./editor-chrome";
import {
  normalizeEditorPanelLayout,
  writeEditorPanelLayout,
  type EditorPanelLayout,
} from "./editor-layout";
import { ensureUserFontsLoaded, type UserFont } from "./fonts";
import type { SceneSelection } from "./scene-document";
import {
  saveStudioSkin,
  saveThemeMode,
  type ResolvedTheme,
  type StudioSkin,
  type ThemeMode,
} from "./theme";
import type { WorkflowStageId } from "./workflow-stages";
import { saveWorkspaceSession, type WorkspaceSession } from "./workspace-session";

export interface EditorChromeEffectsOptions {
  workspaceSession: WorkspaceSession;
  activeStage: WorkflowStageId;
  selection: SceneSelection;
  themeMode: ThemeMode;
  skin: StudioSkin;
  resolvedTheme: ResolvedTheme;
  panelLayout: EditorPanelLayout;
  userFonts: UserFont[];
  setPrefersDark: Dispatch<SetStateAction<boolean>>;
  setPanelLayout: Dispatch<SetStateAction<EditorPanelLayout>>;
}

export function useEditorChromeEffects(options: EditorChromeEffectsOptions): void {
  const {
    workspaceSession,
    activeStage,
    selection,
    themeMode,
    skin,
    resolvedTheme,
    panelLayout,
    userFonts,
    setPrefersDark,
    setPanelLayout,
  } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = loadBrowserValue(() => window.localStorage, null);
    if (!storage) return;
    saveWorkspaceSession(storage, nextWorkspaceSession(workspaceSession, { stage: activeStage, selection }));
  }, [activeStage, selection, workspaceSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [setPrefersDark]);

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
  }, [setPanelLayout]);

  useEffect(() => {
    mountUserFontFaces(userFonts);
  }, [userFonts]);

  useEffect(() => {
    void ensureUserFontsLoaded(userFonts);
  }, [userFonts]);
}
