import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultDisplayFrame, createDisplayFrameDecorationItem, createDisplayFrameTextItem, type DisplayFrameDefinition } from "../../lib/display-frame";
import { DisplayFrameSubcanvas } from "./DisplayFrameSubcanvas";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderSubcanvas(frame = createDefaultDisplayFrame()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onSelectItem = vi.fn();
  const onChangeItem = vi.fn();
  flushSync(() => root.render(
    <DisplayFrameSubcanvas
      frame={frame}
      selectedItemId="title"
      onSelectItem={onSelectItem}
      onChangeItem={onChangeItem}
    />,
  ));
  return { container, onSelectItem, onChangeItem };
}

describe("DisplayFrameSubcanvas", () => {
  it("selects a local item and drags it without changing its card placement", () => {
    const { container, onSelectItem, onChangeItem } = renderSubcanvas();
    const title = container.querySelector<SVGGElement>('[data-display-frame-item="title"]')!;
    Object.assign(title, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });

    flushSync(() => title.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 30, clientY: 30, pointerId: 1 })));
    flushSync(() => title.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 78, clientY: 62, pointerId: 1 })));
    flushSync(() => title.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 78, clientY: 62, pointerId: 1 })));

    expect(onSelectItem).toHaveBeenCalledWith("title");
    expect(onChangeItem).toHaveBeenCalledWith("title", expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("resizes the selected item from its local-canvas handle", () => {
    const { container, onChangeItem } = renderSubcanvas();
    const handle = container.querySelector<SVGRectElement>('[data-display-frame-resize-handle="title"]')!;
    Object.assign(handle, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });

    flushSync(() => handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 50, pointerId: 2 })));
    flushSync(() => handle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 132, clientY: 72, pointerId: 2 })));
    flushSync(() => handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 132, clientY: 72, pointerId: 2 })));

    expect(onChangeItem).toHaveBeenCalledWith("title", expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }));
  });

  it("renders custom text and decoration layers in z-index order", () => {
    const base = createDefaultDisplayFrame();
    const text = { ...createDisplayFrameTextItem(base, "毕业快乐"), zIndex: 10 };
    const decoration = { ...createDisplayFrameDecorationItem(base, "line"), zIndex: 11 };
    const frame: DisplayFrameDefinition = { ...base, fixed: { items: [...base.fixed.items, text, decoration] } };
    const { container } = renderSubcanvas(frame);

    expect(container.querySelector('[data-display-frame-item="text-1"]')).not.toBeNull();
    expect(container.querySelector('[data-display-frame-item="decoration-1"]')).not.toBeNull();
    const ordered = Array.from(container.querySelectorAll("[data-display-frame-item]")).map((item) => item.getAttribute("data-display-frame-item"));
    expect(ordered.indexOf("text-1")).toBeLessThan(ordered.indexOf("decoration-1"));
  });
});
