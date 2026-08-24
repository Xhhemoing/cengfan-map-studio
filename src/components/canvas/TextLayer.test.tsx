import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextLayer, type TextLayerProps } from "./TextLayer";
import type { CanvasText } from "../../lib/scene-document";

const text: CanvasText = {
  id: "text-title",
  role: "title",
  content: "标题",
  x: 72,
  y: 126,
  fontSize: 42,
  color: "#123456",
  fontWeight: 700,
  textAlign: "center",
  maxWidth: 640,
  visibility: true,
};

/** 挂载一层可拖拽文本,并把 jsdom 缺失的指针捕获 / SVG 坐标换算补齐为恒等变换。 */
function mountDraggableLayer(props: Partial<TextLayerProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => root.render(
    <svg>
      <TextLayer textElements={[text]} {...props} />
    </svg>,
  ));

  const group = container.querySelector('[data-text-id="text-title"]') as SVGGElement;
  const svg = container.querySelector("svg") as SVGSVGElement;
  Object.assign(group, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  Object.assign(svg, {
    createSVGPoint: vi.fn(() => ({
      x: 0,
      y: 0,
      matrixTransform: vi.fn(function (this: { x: number; y: number }) { return { x: this.x, y: this.y }; }),
    })),
    getScreenCTM: vi.fn(() => ({ inverse: vi.fn(() => ({})) })),
  });

  const pointer = (type: string, clientX: number, clientY: number) => {
    flushSync(() => group.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY })));
  };

  return {
    group,
    pointer,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe("TextLayer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders text properties and selection callback", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onSelect = vi.fn();
    flushSync(() => root.render(<TextLayer textElements={[text]} onSelectText={onSelect} />));

    const group = container.querySelector('[data-text-id="text-title"]')!;
    const rendered = group.querySelector("text")!;
    expect(rendered.getAttribute("font-size")).toBe("42");
    expect(rendered.getAttribute("font-weight")).toBe("700");
    expect(rendered.getAttribute("text-anchor")).toBe("middle");
    expect(group.getAttribute("data-max-width")).toBe("640");
    expect(rendered.style.maxWidth).toBe("640px");
    flushSync(() => group.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith("text-title");

    root.unmount();
    container.remove();
  });

  it("applies a selected uploaded font to canvas text", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <TextLayer
          textElements={[{ ...text, fontId: "font-user-1" }]}
          userFonts={[{ id: "font-user-1", label: "手写体", family: "CanvasHand", src: "data:font/ttf;base64,AA==", format: "truetype", source: "user" }]}
        />
      </svg>,
    ));

    expect(container.querySelector("text")?.getAttribute("font-family")).toBe('"CanvasHand"');

    root.unmount();
    container.remove();
  });

  it("selects interactive text with the keyboard", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onSelectText = vi.fn();
    flushSync(() => root.render(
      <TextLayer
        textElements={[text]}
        selectedTextId={null}
        onSelectText={onSelectText}
        onMoveText={() => undefined}
        exportMode={false}
      />,
    ));

    const group = container.querySelector('[data-text-id="text-title"]')!;
    flushSync(() => group.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));

    expect(onSelectText).toHaveBeenCalledWith("text-title");

    root.unmount();
    container.remove();
  });

  it("selects a text box without moving it when the pointer is released without dragging", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onMoveText = vi.fn();
    const onSelectText = vi.fn();
    flushSync(() => root.render(
      <svg>
        <TextLayer
          textElements={[text]}
          selectedTextId={null}
          onSelectText={onSelectText}
          onMoveText={onMoveText}
          exportMode={false}
        />
      </svg>,
    ));

    const group = container.querySelector('[data-text-id="text-title"]') as SVGGElement;
    const svg = container.querySelector("svg") as SVGSVGElement;
    Object.assign(group, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    Object.assign(svg, {
      createSVGPoint: vi.fn(() => ({
        x: 0,
        y: 0,
        matrixTransform: vi.fn(function (this: { x: number; y: number }) { return { x: this.x, y: this.y }; }),
      })),
      getScreenCTM: vi.fn(() => ({ inverse: vi.fn(() => ({}) ) })),
    });

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 100, clientY: 140 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 100, clientY: 140 })));

    expect(onSelectText).toHaveBeenCalledWith("text-title");
    expect(onMoveText).not.toHaveBeenCalled();
    expect(text).toMatchObject({ x: 72, y: 126 });

    root.unmount();
    container.remove();
  });

  it("preserves the pointer-to-text offset when dragging", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onMoveText = vi.fn();
    flushSync(() => root.render(
      <svg>
        <TextLayer textElements={[text]} onMoveText={onMoveText} />
      </svg>,
    ));

    const group = container.querySelector('[data-text-id="text-title"]') as SVGGElement;
    const svg = container.querySelector("svg") as SVGSVGElement;
    Object.assign(group, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    Object.assign(svg, {
      createSVGPoint: vi.fn(() => ({
        x: 0,
        y: 0,
        matrixTransform: vi.fn(function (this: { x: number; y: number }) { return { x: this.x, y: this.y }; }),
      })),
      getScreenCTM: vi.fn(() => ({ inverse: vi.fn(() => ({}) ) })),
    });

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 100, clientY: 140 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 300, clientY: 400 })));

    expect(onMoveText).toHaveBeenCalledTimes(1);
    expect(onMoveText).toHaveBeenCalledWith("text-title", 272, 386);
    root.unmount();
    container.remove();
  });

  it("previews the drag by updating the transform before the pointer is released", () => {
    vi.useFakeTimers();
    const onMoveText = vi.fn();
    const { group, pointer, cleanup } = mountDraggableLayer({ onMoveText, renderIntervalMs: 100 });

    pointer("pointerdown", 100, 140);
    pointer("pointermove", 300, 400);
    expect(group.getAttribute("transform")).toBe("translate(72 126)");

    vi.advanceTimersByTime(100);
    expect(group.getAttribute("transform")).toBe("translate(272 386)");
    expect(onMoveText).not.toHaveBeenCalled();

    pointer("pointermove", 400, 500);
    vi.advanceTimersByTime(100);
    expect(group.getAttribute("transform")).toBe("translate(372 486)");
    expect(onMoveText).not.toHaveBeenCalled();

    pointer("pointerup", 400, 500);
    expect(onMoveText).toHaveBeenCalledExactlyOnceWith("text-title", 372, 486);

    cleanup();
  });

  it("throttles drag previews to one paint per render interval", () => {
    vi.useFakeTimers();
    const { group, pointer, cleanup } = mountDraggableLayer({ onMoveText: vi.fn(), renderIntervalMs: 100 });
    const setAttribute = vi.spyOn(group, "setAttribute");

    pointer("pointerdown", 100, 140);
    for (let step = 1; step <= 10; step += 1) {
      pointer("pointermove", 100 + step * 10, 140 + step * 10);
    }
    expect(setAttribute).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(setAttribute).toHaveBeenCalledExactlyOnceWith("transform", "translate(172 226)");

    setAttribute.mockRestore();
    cleanup();
  });

  it("keeps previewing below the drag threshold disabled so a plain click never shifts the text", () => {
    vi.useFakeTimers();
    const onMoveText = vi.fn();
    const { group, pointer, cleanup } = mountDraggableLayer({ onMoveText, renderIntervalMs: 100 });

    pointer("pointerdown", 100, 140);
    pointer("pointermove", 101, 140);
    vi.advanceTimersByTime(100);
    expect(group.getAttribute("transform")).toBe("translate(72 126)");

    pointer("pointerup", 101, 140);
    expect(onMoveText).not.toHaveBeenCalled();
    expect(group.getAttribute("transform")).toBe("translate(72 126)");

    cleanup();
  });

  it("restores the previewed transform when the drag ends back at the original position", () => {
    vi.useFakeTimers();
    const onMoveText = vi.fn();
    const { group, pointer, cleanup } = mountDraggableLayer({ onMoveText, renderIntervalMs: 100 });

    pointer("pointerdown", 100, 140);
    pointer("pointermove", 300, 400);
    vi.advanceTimersByTime(100);
    expect(group.getAttribute("transform")).toBe("translate(272 386)");

    pointer("pointerup", 100, 140);
    expect(onMoveText).not.toHaveBeenCalled();
    expect(group.getAttribute("transform")).toBe("translate(72 126)");

    cleanup();
  });

  it("restores the previewed transform when the drag is cancelled", () => {
    vi.useFakeTimers();
    const onMoveText = vi.fn();
    const { group, pointer, cleanup } = mountDraggableLayer({ onMoveText, renderIntervalMs: 100 });

    pointer("pointerdown", 100, 140);
    pointer("pointermove", 300, 400);
    vi.advanceTimersByTime(100);
    expect(group.getAttribute("transform")).toBe("translate(272 386)");

    pointer("pointercancel", 300, 400);
    expect(onMoveText).not.toHaveBeenCalled();
    expect(group.getAttribute("transform")).toBe("translate(72 126)");

    pointer("pointermove", 500, 600);
    vi.advanceTimersByTime(100);
    expect(group.getAttribute("transform")).toBe("translate(72 126)");

    cleanup();
  });

  it("drops a pending preview when the layer unmounts mid-drag", () => {
    vi.useFakeTimers();
    const { group, pointer, cleanup } = mountDraggableLayer({ onMoveText: vi.fn(), renderIntervalMs: 100 });

    pointer("pointerdown", 100, 140);
    pointer("pointermove", 300, 400);
    cleanup();

    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(group.getAttribute("transform")).toBe("translate(72 126)");
  });

  it("does not capture a double click so the text itself can be selected", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onSelectText = vi.fn();
    flushSync(() => root.render(<svg><TextLayer textElements={[text]} onSelectText={onSelectText} /></svg>));

    const group = container.querySelector('[data-text-id="text-title"]') as SVGGElement;
    const setPointerCapture = vi.fn();
    Object.assign(group, { setPointerCapture });
    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, detail: 2, pointerId: 1, clientX: 72, clientY: 126 })));
    flushSync(() => group.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 })));

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onSelectText).toHaveBeenCalledWith("text-title");
    root.unmount();
    container.remove();
  });

  it("omits hidden text and export selection overlays", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TextLayer
        textElements={[text, { ...text, id: "hidden", visibility: false }]}
        selectedTextId="text-title"
        exportMode
      />,
    ));

    expect(container.querySelector('[data-text-id="hidden"]')).toBeNull();
    expect(container.querySelector("[data-selection-overlay]")).toBeNull();
    expect(container.querySelector('[data-text-id="text-title"]')?.classList.contains("editable-text")).toBe(false);
    root.unmount();
    container.remove();
  });
});
