import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { TextLayer } from "./TextLayer";
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

describe("TextLayer", () => {
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
