import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "./editor-layout";
import { SKIN_STORAGE_KEY, THEME_STORAGE_KEY } from "./theme";
import { useStudioPreferences, type StudioPreferences } from "./use-studio-preferences";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function mountHook(): () => StudioPreferences {
  let latest: StudioPreferences | null = null;
  function Probe() {
    latest = useStudioPreferences();
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<Probe />));
  return () => latest!;
}

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    flushSync(() => entry.root.unmount());
    entry.container.remove();
  }
  window.localStorage.clear();
});

describe("useStudioPreferences", () => {
  it("restores the persisted theme mode and skin", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.localStorage.setItem(SKIN_STORAGE_KEY, "classic");

    const preferences = mountHook();

    expect(preferences().themeMode).toBe("dark");
    expect(preferences().skin).toBe("classic");
    expect(preferences().resolvedTheme).toBe("dark");
  });

  it("persists theme and skin changes and mirrors them onto the document root", () => {
    window.localStorage.clear();
    const preferences = mountHook();

    expect(document.documentElement.dataset.editorTheme).toBe("light");
    expect(document.documentElement.dataset.editorSkin).toBe("atelier");

    flushSync(() => preferences().setThemeMode("dark"));
    flushSync(() => preferences().setSkin("classic"));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe("classic");
    expect(document.documentElement.dataset.editorTheme).toBe("dark");
    expect(document.documentElement.dataset.editorSkin).toBe("classic");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("clamps panel widths to the viewport bounds and persists the layout", () => {
    window.localStorage.clear();
    const preferences = mountHook();
    const maxSidebarWidth = preferences().sidebarBounds.max;

    flushSync(() => preferences().updatePanelWidth("sidebar", 9999));

    expect(preferences().panelLayout.sidebarWidth).toBe(maxSidebarWidth);
    expect(preferences().workspaceStyle).toMatchObject({ "--sidebar-width": `${maxSidebarWidth}px` });
    expect(JSON.parse(window.localStorage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY)!)).toEqual(preferences().panelLayout);
  });

  it("shares one panel layout across consumers so a resize cannot revert another consumer's change", () => {
    window.localStorage.clear();
    const editorShell = mountHook();
    const appShell = mountHook();

    flushSync(() => editorShell().updatePanelWidth("sidebar", 270));
    expect(appShell().panelLayout.sidebarWidth).toBe(270);

    flushSync(() => window.dispatchEvent(new Event("resize")));

    expect(editorShell().panelLayout.sidebarWidth).toBe(270);
    expect(appShell().panelLayout.sidebarWidth).toBe(270);
    expect(JSON.parse(window.localStorage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY)!)).toEqual(appShell().panelLayout);
  });

  it("tracks the panel being resized", () => {
    const preferences = mountHook();

    expect(preferences().resizingPanel).toBeNull();
    flushSync(() => preferences().setResizingPanel("inspector"));
    expect(preferences().resizingPanel).toBe("inspector");
    flushSync(() => preferences().setResizingPanel(null));
    expect(preferences().resizingPanel).toBeNull();
  });
});
