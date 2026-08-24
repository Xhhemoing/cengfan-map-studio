import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryControls, type HistoryControlsProps } from "./HistoryControls";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderControls(overrides: Partial<HistoryControlsProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props: HistoryControlsProps = {
    canUndo: true,
    canRedo: true,
    undoLabel: "撤销：更新地图",
    redoLabel: "重做：更新地图",
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(<HistoryControls {...props} />));
  const rerender = (nextOverrides: Partial<HistoryControlsProps>) => {
    const next = { ...props, ...nextOverrides };
    flushSync(() => root.render(<HistoryControls {...next} />));
    return next;
  };
  return { container, props, rerender };
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

describe("HistoryControls history announcements", () => {
  it("announces undo/redo through a persistent polite live region outside the group", () => {
    const { container, props } = renderControls();

    // The region exists before any interaction (live regions must be in the
    // DOM ahead of the change to announce reliably), screen-reader-only and
    // initially empty. It sits outside the 历史操作 group so host CSS hiding
    // the group on narrow screens cannot silence the announcement, and its
    // data attribute is distinct from the topbar/settings ones.
    const region = container.querySelector("[data-history-announcement]");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.classList.contains("sr-only")).toBe(true);
    expect(region?.textContent).toBe("");
    expect(region?.closest('[role="group"]')).toBeNull();

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="撤销：更新地图"]');
    click(undo);
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");

    // Undoing a second, identically labelled step still mutates the DOM text
    // (an invisible NBSP suffix toggles), so aria-live re-announces it.
    const firstAnnouncement = region?.textContent;
    click(undo);
    expect(props.onUndo).toHaveBeenCalledTimes(2);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");
    expect(region?.textContent).not.toBe(firstAnnouncement);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="重做：更新地图"]'));
    expect(props.onRedo).toHaveBeenCalledTimes(1);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已重做：更新地图");
    // Same node throughout: announcements never rely on a remount.
    expect(region?.isConnected).toBe(true);
  });

  it("announces the pre-click label and keeps it when history labels move on afterwards", () => {
    const { container, props, rerender } = renderControls();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="撤销：更新地图"]'));
    const region = container.querySelector("[data-history-announcement]");
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");

    // After the undo the parent re-renders with the next history top; the
    // announcement still reports the step that was actually undone.
    rerender({ undoLabel: "撤销：移动卡片" });
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：更新地图");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="撤销：移动卡片"]'));
    expect(props.onUndo).toHaveBeenCalledTimes(2);
    expect(region?.textContent?.replace(/\u00A0/g, "")).toBe("已撤销：移动卡片");
  });

  it("falls back to plain 撤销/重做 labels and disables buttons when history is empty", () => {
    const { container } = renderControls({
      canUndo: false,
      canRedo: false,
      undoLabel: undefined,
      redoLabel: undefined,
    });
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="撤销"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="重做"]')?.disabled).toBe(true);
  });
});
