import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { StudioAssistantDrawer } from "./StudioAssistantDrawer";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderDrawer({
  open = true,
  onClose = vi.fn(),
  label = "AI 助手",
  returnFocusTo,
}: {
  open?: boolean;
  onClose?: () => void;
  label?: string;
  returnFocusTo?: HTMLElement | null;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <StudioAssistantDrawer
      open={open}
      onClose={onClose}
      label={label}
      returnFocusTo={returnFocusTo}
    >
      <div className="studio-assistant-rail">AI 助手内容</div>
    </StudioAssistantDrawer>,
  ));
  return { container, root, onClose };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("StudioAssistantDrawer", () => {
  it("renders a labelled drawer with the assistant content and a labelled close button", () => {
    renderDrawer();
    const drawerRoot = document.querySelector(".MuiDrawer-root");
    expect(drawerRoot).not.toBeNull();
    expect(drawerRoot?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.querySelector(".studio-assistant-drawer__paper")).not.toBeNull();
    expect(document.querySelector(".studio-assistant-drawer__head strong")?.textContent).toBe("AI 助手");
    expect(document.querySelector(".studio-assistant-drawer__body")?.textContent).toContain("AI 助手内容");
    expect(document.querySelector('button[aria-label="关闭AI 助手"]')).not.toBeNull();
  });

  it("calls onClose when the labelled close button is pressed", () => {
    const { onClose } = renderDrawer();

    flushSync(() => document.querySelector<HTMLButtonElement>('button[aria-label="关闭AI 助手"]')?.click());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener element after closing", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const { root, onClose } = renderDrawer({ returnFocusTo: opener });

    // Simulate the parent closing the drawer, then let the focus effect run.
    flushSync(() => root.render(
      <StudioAssistantDrawer open={false} onClose={onClose} label="AI 助手" returnFocusTo={opener}>
        <div>AI 助手内容</div>
      </StudioAssistantDrawer>,
    ));
    await act(async () => {});
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });
});
