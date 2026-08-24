import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { StudioEditorShell } from "./StudioEditorShell";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "../lib/editor-layout";
import { useStudioPreferences, type StudioPreferences } from "../lib/use-studio-preferences";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

const RIGHT_RAIL_PROBE_ID = "right-rail-probe";

/** Kept in sync with the shell's breakpoint and the `@media` rules in styles.css. */
const NARROW_VIEWPORT_QUERY = "(max-width: 760px)";

/** Stable-id probe: a duplicated rail would collide on this id. */
const rightRailProbe = <div id={RIGHT_RAIL_PROBE_ID}>右栏内容</div>;

function probeCount(): number {
  return document.querySelectorAll(`#${RIGHT_RAIL_PROBE_ID}`).length;
}

type MediaListener = (event: MediaQueryListEvent) => void;

let restoreMatchMedia: (() => void) | null = null;

function setMatchMedia(value: unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const previousRestore = restoreMatchMedia;
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value });
  restoreMatchMedia = () => {
    if (descriptor) Object.defineProperty(window, "matchMedia", descriptor);
    else Reflect.deleteProperty(window, "matchMedia");
    restoreMatchMedia = previousRestore;
  };
}

/** Drives `(max-width: 760px)` so tests can pick a viewport and cross the breakpoint. */
function mockViewport(initialNarrow: boolean) {
  const listeners = new Set<MediaListener>();
  let narrow = initialNarrow;
  setMatchMedia((query: string) => ({
    get matches() {
      return query === NARROW_VIEWPORT_QUERY ? narrow : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: MediaListener) => { listeners.delete(listener); },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList));
  return {
    async setNarrow(next: boolean) {
      narrow = next;
      await act(async () => {
        listeners.forEach((listener) => listener({ matches: next, media: NARROW_VIEWPORT_QUERY } as MediaQueryListEvent));
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function renderShell({
  rightRail,
  rightRailLabel,
  leftRail = <div aria-label="编辑器左侧栏">左栏</div>,
}: {
  rightRail?: ReactNode;
  rightRailLabel?: string;
  leftRail?: ReactNode | null;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <StudioEditorShell
      stage="map"
      leftRail={leftRail ?? undefined}
      rightRail={rightRail}
      rightRailLabel={rightRailLabel}
    >
      <div>中心</div>
    </StudioEditorShell>,
  ));
  return { container, root };
}

/** App 侧的偏好消费者:与外壳共享同一份面板宽度状态。 */
function mountStudioPreferences(): () => StudioPreferences {
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

async function flushEffects(): Promise<void> {
  await act(async () => {});
}

function click(element: Element | null): void {
  if (!element) throw new Error("element missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function pointer(type: string, clientX: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

function storedLayout(): { sidebarWidth?: number; inspectorWidth?: number } {
  return JSON.parse(window.localStorage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY) ?? "{}");
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
  restoreMatchMedia?.();
  restoreMatchMedia = null;
  vi.restoreAllMocks();
});

describe("StudioEditorShell", () => {
  it("renders the persistent left rail, center region and an optional labelled right rail", () => {
    mockViewport(false);
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const shell = container.querySelector(".studio-editor-shell")!;
    expect(shell?.getAttribute("data-stage")).toBe("map");
    expect(shell?.getAttribute("data-has-right-rail")).toBe("true");
    expect(container.querySelector('[aria-label="编辑器左侧栏"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图属性"]')?.textContent).toContain("右栏内容");
    expect(container.querySelector(".studio-editor-shell__main")?.textContent).toContain("中心");
  });

  it("prepends the collapsible stage guide line to the docked right rail", () => {
    mockViewport(false);
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const dockedGuide = container.querySelector(".studio-editor-shell__right .studio-stage-guide");
    expect(dockedGuide?.textContent).toContain("确定地图表达与外观");
    expect(dockedGuide?.getAttribute("aria-label")).toBe("地图样式说明");
  });

  it("prepends the collapsible stage guide line to the drawer copy", async () => {
    mockViewport(true);
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });
    await flushEffects();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开地图属性"]')!);
    expect(document.querySelector(".studio-editor-shell__drawer .studio-stage-guide")?.textContent).toContain("确定地图表达与外观");
  });

  it("expands the center region when no right rail is supplied", () => {
    const { container } = renderShell();

    expect(container.querySelector('[data-has-right-rail="false"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图属性"]')).toBeNull();
  });

  it("omits the left rail for the old-style top guidance and marks the shell", () => {
    mockViewport(false);
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
    mockViewport(false);
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 280, inspectorWidth: 260 }));
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const separators = container.querySelectorAll<HTMLElement>('[role="separator"]');
    expect(separators).toHaveLength(2);
    expect(separators[0]?.getAttribute("aria-label")).toBe("调整左侧栏宽度");
    expect(separators[1]?.getAttribute("aria-label")).toBe("调整右侧栏宽度");

    await act(async () => {
      separators[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    expect(storedLayout().sidebarWidth).toBe(284);
  });

  it("keeps a dragged width after a viewport resize while the studio preferences hook is mounted", async () => {
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 280, inspectorWidth: 260 }));
    const preferences = mountStudioPreferences();
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });
    const sidebarResizer = container.querySelector<HTMLElement>('[role="separator"][aria-label="调整左侧栏宽度"]')!;

    await act(async () => {
      sidebarResizer.dispatchEvent(pointer("pointerdown", 200));
      sidebarResizer.dispatchEvent(pointer("pointermove", 190));
      sidebarResizer.dispatchEvent(pointer("pointerup", 190));
    });
    expect(storedLayout().sidebarWidth).toBe(270);
    expect(preferences().panelLayout.sidebarWidth).toBe(270);

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(storedLayout()).toEqual({ sidebarWidth: 270, inspectorWidth: 260 });
    expect(sidebarResizer.getAttribute("aria-valuenow")).toBe("270");
  });

  it("exposes the right rail through a labelled drawer toggle on narrow screens", async () => {
    mockViewport(true);
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });
    await flushEffects();

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

  it("mounts the right rail only in the docked aside on wide viewports", async () => {
    mockViewport(false);
    const { container } = renderShell({ rightRail: rightRailProbe, rightRailLabel: "地图属性" });
    await flushEffects();

    expect(container.querySelector(".studio-editor-shell__right")).not.toBeNull();
    expect(container.querySelector('button[aria-label="打开地图属性"]')).toBeNull();
    expect(document.querySelector(".MuiDrawer-root")).toBeNull();
    expect(probeCount()).toBe(1);
  });

  it("mounts the right rail only inside the drawer on narrow viewports", async () => {
    mockViewport(true);
    const { container } = renderShell({ rightRail: rightRailProbe, rightRailLabel: "地图属性" });
    await flushEffects();

    expect(container.querySelector(".studio-editor-shell__right")).toBeNull();
    expect(container.querySelector('[role="separator"][aria-label="调整右侧栏宽度"]')).toBeNull();
    expect(probeCount()).toBe(0);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开地图属性"]'));
    expect(document.querySelector(".studio-editor-shell__drawer")).not.toBeNull();
    expect(probeCount()).toBe(1);
  });

  it("swaps presentations without double-mounting when the viewport crosses the breakpoint", async () => {
    const viewport = mockViewport(false);
    const { container } = renderShell({ rightRail: rightRailProbe, rightRailLabel: "地图属性" });
    await flushEffects();
    expect(probeCount()).toBe(1);

    await viewport.setNarrow(true);
    expect(container.querySelector(".studio-editor-shell__right")).toBeNull();
    expect(probeCount()).toBe(0);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开地图属性"]'));
    expect(probeCount()).toBe(1);

    await viewport.setNarrow(false);
    await vi.waitFor(() => expect(document.querySelector(".MuiDrawer-root")).toBeNull(), { timeout: 3000, interval: 50 });
    expect(container.querySelector(".studio-editor-shell__right")).not.toBeNull();
    expect(probeCount()).toBe(1);
  });

  it("drops the media query listener on unmount", async () => {
    const viewport = mockViewport(false);
    const { root, container } = renderShell({ rightRail: rightRailProbe, rightRailLabel: "地图属性" });
    await flushEffects();
    expect(viewport.listenerCount).toBe(1);

    await act(async () => root.unmount());
    container.remove();
    const index = roots.findIndex((entry) => entry.container === container);
    if (index >= 0) roots.splice(index, 1);

    expect(viewport.listenerCount).toBe(0);
  });

  it("falls back to the docked desktop rail when matchMedia is unavailable", async () => {
    setMatchMedia(undefined);
    const { container } = renderShell({ rightRail: rightRailProbe, rightRailLabel: "地图属性" });
    await flushEffects();

    expect(container.querySelector(".studio-editor-shell__right")).not.toBeNull();
    expect(container.querySelector('button[aria-label="打开地图属性"]')).toBeNull();
    expect(probeCount()).toBe(1);
  });
});
