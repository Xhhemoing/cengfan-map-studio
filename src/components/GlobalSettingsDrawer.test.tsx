import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSettingsDrawer } from "./GlobalSettingsDrawer";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderDrawer({
  open = true,
  onClose = vi.fn(),
  title,
  children = (
    <>
      <button type="button" data-testid="first">第一项</button>
      <button type="button" data-testid="last">最后一项</button>
    </>
  ),
}: {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  children?: React.ReactNode;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const render = (isOpen: boolean) => flushSync(() => root.render(
    <GlobalSettingsDrawer open={isOpen} onClose={onClose} title={title}>
      {children}
    </GlobalSettingsDrawer>,
  ));
  render(open);
  return { container, root, onClose, render };
}

function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): void {
  flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("GlobalSettingsDrawer", () => {
  it("renders a labelled modal dialog and nothing when closed", () => {
    const { container, render } = renderDrawer();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)?.textContent).toBe("全局设置");

    render(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves focus to the labelled close button when opened", () => {
    const { container } = renderDrawer({ title: "渲染设置" });
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭渲染设置"]');
    expect(close).not.toBeNull();
    expect(document.activeElement).toBe(close);
  });

  it("closes on Escape and on backdrop click", () => {
    const { container, onClose } = renderDrawer();

    pressKey(document.activeElement!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    flushSync(() => container.querySelector<HTMLElement>(".global-settings-drawer__backdrop")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab and Shift+Tab inside the dialog", () => {
    const { container } = renderDrawer();
    const close = container.querySelector<HTMLButtonElement>(".global-settings-drawer__close")!;
    const last = container.querySelector<HTMLButtonElement>('[data-testid="last"]')!;

    // Tab from the last focusable wraps to the first (the close button).
    last.focus();
    pressKey(last, "Tab");
    expect(document.activeElement).toBe(close);

    // Shift+Tab from the first focusable wraps to the last.
    pressKey(close, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the opener when the drawer closes", () => {
    const opener = document.createElement("button");
    opener.textContent = "打开设置";
    document.body.append(opener);
    opener.focus();

    const { render } = renderDrawer();
    expect(document.activeElement).not.toBe(opener);

    render(false);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
