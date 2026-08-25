import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  createDefaultDisplayFrame,
  createDisplayFrameDecorationItem,
  createDisplayFrameTextItem,
  type DisplayFrameDefinition,
} from "../../lib/display-frame";
import { DisplayFrameSubcanvas } from "./DisplayFrameSubcanvas";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderSubcanvas(frame: DisplayFrameDefinition, selectedItemId: string | null = null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const onSelectItem = vi.fn();
  const onChangeItem = vi.fn();
  flushSync(() => root.render(
    <DisplayFrameSubcanvas
      frame={frame}
      selectedItemId={selectedItemId}
      onSelectItem={onSelectItem}
      onChangeItem={onChangeItem}
    />,
  ));
  return { container, onSelectItem, onChangeItem };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.unstubAllGlobals();
});

describe("DisplayFrameSubcanvas boundaries", () => {
  it("previews a drag with a transform and commits it without throwing", () => {
    let animationFrame: FrameRequestCallback | undefined;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 17;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const { container, onSelectItem, onChangeItem } = renderSubcanvas(createDefaultDisplayFrame(), "title");
    const svg = container.querySelector("svg")!;
    const title = container.querySelector<SVGGElement>('[data-display-frame-item="title"]')!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 240,
      bottom: 160,
      width: 240,
      height: 160,
      toJSON: () => ({}),
    });
    Object.assign(title, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });

    flushSync(() => title.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: 12,
      clientY: 12,
      pointerId: 9,
    })));
    expect(() => {
      flushSync(() => title.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 52,
        clientY: 42,
        pointerId: 9,
      })));
    }).not.toThrow();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(animationFrame).toBeTypeOf("function");
    flushSync(() => animationFrame!(0));
    expect(title.getAttribute("transform")).toBe("translate(40 30)");
    expect(onChangeItem).not.toHaveBeenCalled();

    expect(() => {
      flushSync(() => title.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 52,
        clientY: 42,
        pointerId: 9,
      })));
    }).not.toThrow();

    expect(title.hasAttribute("transform")).toBe(false);
    expect(onSelectItem).toHaveBeenCalledWith("title");
    expect(onChangeItem).toHaveBeenCalledWith("title", { x: 52, y: 42 });
  });

  it("distinguishes text and decoration selection targets", () => {
    const base = createDefaultDisplayFrame();
    const text = createDisplayFrameTextItem(base, "毕业快乐");
    const decoration = createDisplayFrameDecorationItem(
      { ...base, fixed: { items: [...base.fixed.items, text] } },
      "line",
    );
    const frame: DisplayFrameDefinition = {
      ...base,
      fixed: { items: [...base.fixed.items, text, decoration] },
    };
    const { container, onSelectItem } = renderSubcanvas(frame);
    const textTarget = container.querySelector<SVGGElement>(`[data-display-frame-item="${text.id}"]`)!;
    const decorationTarget = container.querySelector<SVGGElement>(`[data-display-frame-item="${decoration.id}"]`)!;

    expect(textTarget.textContent).toContain("毕业快乐");
    expect(decorationTarget.querySelector("line")).not.toBeNull();

    flushSync(() => textTarget.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    flushSync(() => decorationTarget.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onSelectItem.mock.calls).toEqual([[text.id], [decoration.id]]);
    expect(textTarget.getAttribute("aria-label")).toBe("选择毕业快乐");
    expect(decorationTarget.getAttribute("aria-label")).toBe("选择分隔线");
  });
});
