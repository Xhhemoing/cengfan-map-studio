import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { StudioEditorShell } from "./StudioEditorShell";
import { StudioUiThemeProvider } from "./StudioUiThemeProvider";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "../lib/editor-layout";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderShell({
  rightRail,
  rightRailLabel,
  leftRail = <div aria-label="编辑器左侧栏">左栏</div>,
  theme = "light",
  skin = "atelier",
}: {
  rightRail?: ReactNode;
  rightRailLabel?: string;
  leftRail?: ReactNode | null;
  theme?: string;
  skin?: string;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const renderPalette = (nextTheme: string, nextSkin: string) => flushSync(() => root.render(
    <StudioUiThemeProvider theme={nextTheme} skin={nextSkin}>
      <StudioEditorShell
        stage="map"
        leftRail={leftRail ?? undefined}
        rightRail={rightRail}
        rightRailLabel={rightRailLabel}
      >
        <div>中心</div>
      </StudioEditorShell>
    </StudioUiThemeProvider>,
  ));
  renderPalette(theme, skin);
  return { container, root, renderPalette };
}

function click(element: Element | null): void {
  if (!element) throw new Error("element missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioEditorShell", () => {
  it.each([
    ["light", "atelier"], ["dark", "atelier"], ["light", "classic"], ["dark", "classic"],
  ])("keeps the %s/%s scope on the portalled right rail", (theme, skin) => {
    const { container, renderPalette } = renderShell({
      theme, skin, rightRail: <button type="button" className="secondary-button">导出工程包</button>, rightRailLabel: "交付检查",
    });
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="打开交付检查"]');
    click(toggle);
    const paper = document.querySelector(".studio-editor-shell__drawer-paper");
    expect(paper?.classList.contains("app-shell")).toBe(true);
    expect(paper?.getAttribute("data-editor-theme")).toBe(theme);
    expect(paper?.getAttribute("data-editor-skin")).toBe(skin);
    expect(paper?.getAttribute("role")).toBe("dialog");
    const titleId = paper?.getAttribute("aria-labelledby");
    expect(document.getElementById(titleId ?? "")?.textContent).toBe("交付检查");
    expect(document.getElementById(toggle?.getAttribute("aria-controls") ?? "")?.textContent).toContain("导出工程包");

    const nextTheme = theme === "dark" ? "light" : "dark";
    const nextSkin = skin === "atelier" ? "classic" : "atelier";
    renderPalette(nextTheme, nextSkin);
    expect(paper?.getAttribute("data-editor-theme")).toBe(nextTheme);
    expect(paper?.getAttribute("data-editor-skin")).toBe(nextSkin);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders the persistent left rail, center region and an optional labelled right rail", () => {
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const shell = container.querySelector(".studio-editor-shell")!;
    expect(shell?.getAttribute("data-stage")).toBe("map");
    expect(shell?.getAttribute("data-has-right-rail")).toBe("true");
    expect(container.querySelector('[aria-label="编辑器左侧栏"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图属性"]')?.textContent).toContain("右栏内容");
    expect(container.querySelector(".studio-editor-shell__main")?.textContent).toContain("中心");
  });

  it("prepends the collapsible stage guide line to the right rail and the drawer", () => {
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const dockedGuide = container.querySelector(".studio-editor-shell__right .studio-stage-guide");
    expect(dockedGuide?.textContent).toContain("选择呈现方式并调整地图外观");
    expect(dockedGuide?.getAttribute("aria-label")).toBe("地图说明");
    expect(dockedGuide?.textContent).toContain("请确认本阶段效果，导出前查看交付检查");
    expect(dockedGuide?.textContent).not.toContain("已完成");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开地图属性"]')!);
    const drawerGuide = document.querySelector(".studio-editor-shell__drawer .studio-stage-guide");
    expect(drawerGuide?.textContent).toContain("选择呈现方式并调整地图外观");
    expect(drawerGuide?.textContent).toContain("请确认本阶段效果，导出前查看交付检查");
  });

  it("expands the center region when no right rail is supplied", () => {
    const { container } = renderShell();

    expect(container.querySelector('[data-has-right-rail="false"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图属性"]')).toBeNull();
  });

  it("omits the left rail for the old-style top guidance and marks the shell", () => {
    const { container } = renderShell({ leftRail: null, rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    expect(container.querySelector('[data-has-left-rail="false"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="编辑器左侧栏"]')).toBeNull();
    expect(container.querySelector(".studio-editor-shell__main")?.textContent).toContain("中心");
    // Only the inspector separator remains when there is no left rail.
    const separators = container.querySelectorAll<HTMLElement>('[role="separator"]');
    expect(separators).toHaveLength(1);
    expect(separators[0]?.getAttribute("aria-label")).toBe("调整右侧栏宽度");
  });

  it("owns keyboard-accessible separators and persists panel widths", async () => {
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 280, inspectorWidth: 260 }));
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const separators = container.querySelectorAll<HTMLElement>('[role="separator"]');
    expect(separators).toHaveLength(2);
    expect(separators[0]?.getAttribute("aria-label")).toBe("调整左侧栏宽度");
    expect(separators[1]?.getAttribute("aria-label")).toBe("调整右侧栏宽度");

    await act(async () => {
      separators[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    const stored = JSON.parse(window.localStorage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY) ?? "{}");
    expect(stored.sidebarWidth).toBe(284);
  });

  it("exposes the right rail through a labelled drawer toggle on narrow screens", async () => {
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="打开地图属性"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    toggle?.focus();
    click(toggle);
    expect(document.querySelector(".MuiDrawer-root")).not.toBeNull();
    expect(document.querySelector(".MuiDrawer-root")?.textContent).toContain("右栏内容");

    // Dispatch on an element inside the drawer paper so MUI Modal's document-level listener catches it.
    await act(async () => {
      document.querySelector(".studio-editor-shell__drawer")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    // jsdom does not fire transitionend; react-transition-group falls back to its
    // timeout after the exit transition duration, so poll generously.
    await vi.waitFor(() => expect(document.querySelector(".MuiDrawer-root")).toBeNull(), { timeout: 3000, interval: 50 });
    expect(document.activeElement).toBe(toggle);
  });
});
