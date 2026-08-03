import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizablePanelDivider } from "./ResizablePanelDivider";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderDivider(side: "sidebar" | "inspector" = "sidebar") {
  const container = document.createElement("div");
  document.body.append(container);
  const onChange = vi.fn();
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <ResizablePanelDivider
      side={side}
      value={side === "sidebar" ? 220 : 280}
      min={side === "sidebar" ? 180 : 220}
      max={side === "sidebar" ? 360 : 420}
      ariaLabel={side === "sidebar" ? "调整左侧栏宽度" : "调整右侧栏宽度"}
      onChange={onChange}
    />,
  ));
  return { container, onChange };
}

function pointer(type: string, clientX: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("ResizablePanelDivider", () => {
  it("exposes an accessible separator with the current bounds", () => {
    const { container } = renderDivider();
    const separator = container.querySelector<HTMLElement>('[role="separator"]');

    expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator?.getAttribute("aria-valuenow")).toBe("220");
    expect(separator?.getAttribute("aria-valuemin")).toBe("180");
    expect(separator?.getAttribute("aria-valuemax")).toBe("360");
    expect(separator?.getAttribute("aria-label")).toBe("调整左侧栏宽度");
  });

  it("reports pointer movement in the correct direction for the right panel", () => {
    const { container, onChange } = renderDivider("inspector");
    const separator = container.querySelector<HTMLElement>('[role="separator"]')!;

    separator.dispatchEvent(pointer("pointerdown", 200));
    separator.dispatchEvent(pointer("pointermove", 150));

    expect(onChange).toHaveBeenLastCalledWith(330);
  });

  it("supports keyboard step, Home, and End adjustments", () => {
    const { container, onChange } = renderDivider();
    const separator = container.querySelector<HTMLElement>('[role="separator"]')!;

    separator.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    separator.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    separator.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));

    expect(onChange.mock.calls).toEqual([[228], [180], [360]]);
  });
});
