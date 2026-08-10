import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { StudioEditorShell } from "./StudioEditorShell";
import { StudioLeftRail } from "./StudioLeftRail";
import { createProjectDocument } from "../lib/project-document";
import { sampleStudents } from "../lib/project-data";
import { computeWorkflowProgress } from "../lib/workflow-progress";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "../lib/editor-layout";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderShell({
  rightRail,
  rightRailLabel,
}: {
  rightRail?: ReactNode;
  rightRailLabel?: string;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const progress = computeWorkflowProgress(project);
  flushSync(() => root.render(
    <StudioEditorShell
      stage="map"
      leftRail={
        <StudioLeftRail activeStage="map" project={project} progress={progress} onChangeStage={vi.fn()} />
      }
      rightRail={rightRail}
      rightRailLabel={rightRailLabel}
    >
      <div>中心</div>
    </StudioEditorShell>,
  ));
  return { container, root };
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
  it("renders the persistent left rail, center region and an optional labelled right rail", () => {
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const shell = container.querySelector(".studio-editor-shell")!;
    expect(shell?.getAttribute("data-stage")).toBe("map");
    expect(shell?.getAttribute("data-has-right-rail")).toBe("true");
    expect(container.querySelector('[aria-label="编辑器左侧栏"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图属性"]')?.textContent).toContain("右栏内容");
    expect(container.querySelector(".studio-editor-shell__main")?.textContent).toContain("中心");
  });

  it("expands the center region when no right rail is supplied", () => {
    const { container } = renderShell();

    expect(container.querySelector('[data-has-right-rail="false"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="地图属性"]')).toBeNull();
  });

  it("owns keyboard-accessible separators and persists panel widths", async () => {
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 220, inspectorWidth: 260 }));
    const { container } = renderShell({ rightRail: <div>右栏内容</div>, rightRailLabel: "地图属性" });

    const separators = container.querySelectorAll<HTMLElement>('[role="separator"]');
    expect(separators).toHaveLength(2);
    expect(separators[0]?.getAttribute("aria-label")).toBe("调整左侧栏宽度");
    expect(separators[1]?.getAttribute("aria-label")).toBe("调整右侧栏宽度");

    await act(async () => {
      separators[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    const stored = JSON.parse(window.localStorage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY) ?? "{}");
    expect(stored.sidebarWidth).toBe(228);
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
