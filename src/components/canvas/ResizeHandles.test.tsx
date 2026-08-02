import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandles } from "./ResizeHandles";

afterEach(() => vi.useRealTimers());

function renderHandles(props: Partial<React.ComponentProps<typeof ResizeHandles>> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <svg>
      <ResizeHandles
        rect={{ x: 10, y: 20, width: 100, height: 80, rotation: 0 }}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        {...props}
      />
    </svg>,
  ));
  return { container, root };
}

describe("ResizeHandles", () => {
  it("coalesces device-rate preview changes and commits the final pointer position", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <ResizeHandles
          rect={{ x: 10, y: 20, width: 100, height: 80, rotation: 0 }}
          renderIntervalMs={100}
          onChange={onChange}
          onCommit={onCommit}
        />
      </svg>,
    ));
    const svg = container.querySelector("svg")!;
    Object.assign(svg, {
      createSVGPoint: () => ({
        x: 0,
        y: 0,
        matrixTransform() { return { x: this.x, y: this.y }; },
      }),
      getScreenCTM: () => ({ inverse: () => ({}) }),
    });
    const handle = container.querySelector<SVGRectElement>('[data-resize-handle="se"]')!;
    Object.assign(handle, { setPointerCapture: vi.fn() });
    const handles = container.querySelector("[data-resize-handles]")!;

    flushSync(() => handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 110, clientY: 100 })));
    flushSync(() => handles.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 130, clientY: 120 })));
    flushSync(() => handles.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 150, clientY: 140 })));
    expect(onChange).not.toHaveBeenCalled();

    flushSync(() => vi.advanceTimersByTime(100));
    expect(onChange).toHaveBeenCalledTimes(1);
    const preview = onChange.mock.calls[0]?.[0];
    flushSync(() => handles.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 170, clientY: 160 })));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].width).toBeGreaterThan(preview.width);
    expect(onCommit.mock.calls[0]?.[0].height).toBeGreaterThan(preview.height);

    flushSync(() => root.unmount());
  });

  it("does not commit when a handle is clicked without any size change", () => {
    const onCommit = vi.fn();
    const { container, root } = renderHandles({ onCommit });
    const handle = container.querySelector<Element>('[data-resize-handle="se"]')!;

    // jsdom has no getScreenCTM, so svgLocalPoint returns null and final === start
    flushSync(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 90, clientY: 80 }));
      handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 90, clientY: 80 }));
    });
    expect(onCommit).not.toHaveBeenCalled();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("does not commit when the drag is cancelled (pointer capture lost)", () => {
    const onCommit = vi.fn();
    const { container, root } = renderHandles({ onCommit });
    const handle = container.querySelector<Element>('[data-resize-handle="se"]')!;

    flushSync(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 90, clientY: 80 }));
      handle.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
    });
    expect(onCommit).not.toHaveBeenCalled();

    flushSync(() => root.unmount());
    container.remove();
  });
});
