import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSettingsScreen } from "./GlobalSettingsScreen";
import { createProjectDocument } from "../lib/project-document";
import { computeWorkflowProgress } from "../lib/workflow-progress";

type ScreenProps = ComponentProps<typeof GlobalSettingsScreen>;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderScreen(overrides: Partial<ScreenProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const baseProps: ScreenProps = {
    project,
    canUndo: false,
    canRedo: false,
    undoLabel: "撤销",
    redoLabel: "重做",
    onClose: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onPatch: vi.fn(),
    onReset: vi.fn(),
    selectedStudentId: null,
    onSelectStudent: vi.fn(),
    onChangeDataView: vi.fn(),
    onAppendStudents: vi.fn(),
    onReplaceStudents: vi.fn(),
    onUpdateStudent: vi.fn(),
    onToggleStudentVisibility: vi.fn(),
    onDeleteStudent: vi.fn(),
    onSetStudentsVisibility: vi.fn(),
    provinces: [],
    onApplyFont: vi.fn(),
    workflowProgress: computeWorkflowProgress(project),
    workflowActiveStep: "layout",
    templates: [],
    currentTemplateId: "original",
    customTemplates: [],
    onApplyTemplate: vi.fn(),
    onApplyCustomTemplate: vi.fn(),
    onSaveTemplate: vi.fn(),
  };
  const props = { ...baseProps, ...overrides };
  flushSync(() => root.render(<GlobalSettingsScreen {...props} />));
  const rerender = (nextOverrides: Partial<ScreenProps>) => {
    const next = { ...props, ...nextOverrides };
    flushSync(() => root.render(<GlobalSettingsScreen {...next} />));
    return next;
  };
  return { container, props, rerender };
}

function press(target: Element, key: string): void {
  flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })));
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
  vi.restoreAllMocks();
});

describe("GlobalSettingsScreen tablist keyboard support", () => {
  it("navigates sections with arrows, wraps at the edges, and supports Home/End", () => {
    const { container } = renderScreen();
    const selectedTab = () => container.querySelector('[role="tab"][aria-selected="true"]');
    expect(selectedTab()?.id).toBe("global-settings-tab-canvas");

    const canvasTab = container.querySelector<HTMLButtonElement>("#global-settings-tab-canvas")!;
    canvasTab.focus();
    press(canvasTab, "ArrowRight");
    expect(selectedTab()?.id).toBe("global-settings-tab-map");
    expect(document.activeElement?.id).toBe("global-settings-tab-map");

    // ArrowLeft from the first tab wraps to the last section.
    press(document.activeElement as HTMLElement, "Home");
    expect(selectedTab()?.id).toBe("global-settings-tab-canvas");
    press(document.activeElement as HTMLElement, "ArrowLeft");
    expect(selectedTab()?.id).toBe("global-settings-tab-advanced");

    press(document.activeElement as HTMLElement, "End");
    expect(selectedTab()?.id).toBe("global-settings-tab-advanced");
    press(document.activeElement as HTMLElement, "Home");
    expect(selectedTab()?.id).toBe("global-settings-tab-canvas");
  });

  it("keeps a roving tabindex: only the selected tab is tabbable", () => {
    const { container } = renderScreen();
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(tabs.find((tab) => tab.tabIndex === 0)?.id).toBe("global-settings-tab-canvas");
  });
});

describe("GlobalSettingsScreen history announcements", () => {
  it("announces undo/redo through a persistent polite live region in the header", () => {
    const { container, props } = renderScreen({
      canUndo: true,
      canRedo: true,
      undoLabel: "撤销：更新画布",
      redoLabel: "重做：更新画布",
    });

    // The region exists before any interaction (live regions must be in the
    // DOM ahead of the change to announce reliably), screen-reader-only and
    // initially empty. It sits outside the 全局设置历史 group whose buttons the
    // narrow-screen CSS shrinks/hides, and uses its own data attribute so
    // topbar selectors (data-topbar-history-announcement) never collide.
    const region = container.querySelector(".global-settings-header [data-settings-history-announcement]");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.classList.contains("sr-only")).toBe(true);
    expect(region?.textContent).toBe("");
    expect(region?.closest('[role="group"]')).toBeNull();

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="撤销：更新画布"]');
    click(undo);
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新画布");

    // Undoing a second, identically labelled step still mutates the DOM text
    // (an invisible NBSP suffix toggles), so aria-live re-announces it.
    const firstAnnouncement = region?.textContent;
    click(undo);
    expect(props.onUndo).toHaveBeenCalledTimes(2);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新画布");
    expect(region?.textContent).not.toBe(firstAnnouncement);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="重做：更新画布"]'));
    expect(props.onRedo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已重做：更新画布");
    // Same node throughout: announcements never rely on a remount.
    expect(region?.isConnected).toBe(true);
  });

  it("announces the pre-click label and keeps it when history labels move on afterwards", () => {
    const { container, props, rerender } = renderScreen({ canUndo: true, undoLabel: "撤销：更新画布" });

    click(container.querySelector<HTMLButtonElement>('button[aria-label="撤销：更新画布"]'));
    const region = container.querySelector("[data-settings-history-announcement]");
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新画布");

    // After the undo the parent re-renders with the next history top; the
    // announcement still reports the step that was actually undone.
    rerender({ undoLabel: "撤销：移动卡片" });
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新画布");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="撤销：移动卡片"]'));
    expect(props.onUndo).toHaveBeenCalledTimes(2);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：移动卡片");
  });
});
