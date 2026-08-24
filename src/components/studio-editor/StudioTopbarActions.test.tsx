import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantEntryButton, HistoryActionsGroup } from "./StudioTopbarActions";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("StudioTopbarActions decorative icons", () => {
  it("hides the assistant entry icon from AT (button already named via aria-label)", () => {
    const container = render(
      <AssistantEntryButton open={false} onOpen={vi.fn()} buttonRef={createRef<HTMLButtonElement>()} />,
    );
    const button = container.querySelector('button[aria-label="打开AI助手与高级功能"]');
    expect(button).not.toBeNull();
    const icon = button?.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("hides the undo/redo icons from AT (buttons already named via label)", () => {
    const container = render(
      <HistoryActionsGroup
        history={{ canUndo: true, canRedo: true, undoLabel: "撤销：更新地图", redoLabel: "重做：更新地图" }}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    for (const label of ["撤销：更新地图", "重做：更新地图"]) {
      const button = container.querySelector(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      const icon = button?.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
