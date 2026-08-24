import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEditorChromeEffects } from "./editor-chrome-effects";
import {
  DEFAULT_EDITOR_PANEL_LAYOUT,
  EDITOR_PANEL_LAYOUT_STORAGE_KEY,
  normalizeEditorPanelLayout,
  type EditorPanelLayout,
} from "./editor-layout";
import type { SceneSelection } from "./scene-document";
import { SKIN_STORAGE_KEY, THEME_STORAGE_KEY, type ResolvedTheme, type StudioSkin, type ThemeMode } from "./theme";
import { DEFAULT_WORKSPACE_SESSION, WORKSPACE_SESSION_STORAGE_KEY } from "./workspace-session";
import type { WorkflowStageId } from "./workflow-stages";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

interface ProbeProps {
  themeMode?: ThemeMode;
  skin?: StudioSkin;
  resolvedTheme?: ResolvedTheme;
  activeStage?: WorkflowStageId;
  selection?: SceneSelection;
}

let latestPrefersDark = false;
let latestPanelLayout: EditorPanelLayout = { ...DEFAULT_EDITOR_PANEL_LAYOUT };

function Probe(props: ProbeProps) {
  const [prefersDark, setPrefersDark] = useState(false);
  const [panelLayout, setPanelLayout] = useState<EditorPanelLayout>({ ...DEFAULT_EDITOR_PANEL_LAYOUT });
  // 渲染期不写外部变量:探针在提交之后再把这一帧的状态交出去。
  useEffect(() => {
    latestPrefersDark = prefersDark;
    latestPanelLayout = panelLayout;
  });
  useEditorChromeEffects({
    workspaceSession: DEFAULT_WORKSPACE_SESSION,
    activeStage: props.activeStage ?? "map",
    selection: props.selection ?? { type: "canvas" },
    themeMode: props.themeMode ?? "dark",
    skin: props.skin ?? "classic",
    resolvedTheme: props.resolvedTheme ?? "dark",
    panelLayout,
    userFonts: [],
    setPrefersDark,
    setPanelLayout,
  });
  return null;
}

function mount(props: ProbeProps = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(<Probe {...props} />));
  return { rerender: (next: ProbeProps) => act(() => root.render(<Probe {...next} />)) };
}

/** jsdom 没有真的 matchMedia,补一个可以手动翻转的实现。 */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: initialMatches,
    addEventListener: (_event: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_event: string, listener: () => void) => { listeners.delete(listener); },
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    flip(matches: boolean) {
      media.matches = matches;
      act(() => listeners.forEach((listener) => listener()));
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.editorTheme;
  delete document.documentElement.dataset.editorSkin;
});

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useEditorChromeEffects", () => {
  it("persists the workspace session, theme mode, skin and panel layout", () => {
    mount({ activeStage: "content", selection: { type: "province", province: "浙江省" } });

    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!)).toMatchObject({
      stage: "content",
      selectedProvince: "浙江省",
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe("classic");
    expect(JSON.parse(window.localStorage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY)!))
      .toEqual({ ...DEFAULT_EDITOR_PANEL_LAYOUT });
  });

  it("mirrors the resolved theme and skin onto the document root", () => {
    const harness = mount({ resolvedTheme: "dark", skin: "classic" });
    expect(document.documentElement.dataset.editorTheme).toBe("dark");
    expect(document.documentElement.dataset.editorSkin).toBe("classic");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    harness.rerender({ resolvedTheme: "light", skin: "atelier" });

    expect(document.documentElement.dataset.editorTheme).toBe("light");
    expect(document.documentElement.dataset.editorSkin).toBe("atelier");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows the system colour-scheme change and unsubscribes on unmount", () => {
    const media = installMatchMedia(false);
    mount();

    media.flip(true);
    expect(latestPrefersDark).toBe(true);

    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
    expect(media.listenerCount()).toBe(0);
  });

  it("renormalizes the panel layout when the viewport shrinks", () => {
    mount();
    const originalWidth = window.innerWidth;

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 820 });
      window.dispatchEvent(new Event("resize"));
    });

    const defaultTotal = DEFAULT_EDITOR_PANEL_LAYOUT.sidebarWidth + DEFAULT_EDITOR_PANEL_LAYOUT.inspectorWidth;
    expect(latestPanelLayout.sidebarWidth + latestPanelLayout.inspectorWidth).toBeLessThan(defaultTotal);
    expect(latestPanelLayout).toEqual(normalizeEditorPanelLayout(DEFAULT_EDITOR_PANEL_LAYOUT, 820));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });

  it("keeps the editor usable when panel-layout persistence throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => mount()).not.toThrow();
  });
});
