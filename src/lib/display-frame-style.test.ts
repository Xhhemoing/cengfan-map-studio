import { describe, expect, it } from "vitest";
import {
  createDefaultDisplayFrame,
  createDisplayFrameDecorationItem,
  createDisplayFrameTextItem,
  normalizeDisplayFrame,
  type DisplayFrameFixedItem,
} from "./display-frame";
import {
  displayFrameFontWeightValue,
  displayFrameTextAnchor,
  displayFrameTextBaseline,
  displayFrameTextX,
  resolveDisplayFrameBlockPaint,
  resolveDisplayFrameFieldFontSize,
  resolveDisplayFrameItemPaint,
  resolveDisplayFrameSurface,
} from "./display-frame-style";

const frame = createDefaultDisplayFrame();
const surface = resolveDisplayFrameSurface(frame.style);

function itemOf(id: string): DisplayFrameFixedItem {
  const item = frame.fixed.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`missing fixture item ${id}`);
  return item;
}

describe("display frame surface tokens", () => {
  it("defaults every optional surface paint prop to the canvas fallback", () => {
    expect(surface).toMatchObject({
      background: "#ffffff",
      opacity: 1,
      borderColor: "#1c3154",
      borderWidth: 1,
      borderRadius: 6,
      padding: 12,
      color: "#1c3154",
      fontSize: 12,
      align: "left",
    });
    expect(surface.fontId).toBeUndefined();
  });

  it("falls back to the text color when no border color is stored", () => {
    const resolved = resolveDisplayFrameSurface({
      ...frame.style,
      color: "#334455",
      borderColor: undefined,
      borderWidth: undefined,
      borderRadius: undefined,
    });

    expect(resolved).toMatchObject({ borderColor: "#334455", borderWidth: 1, borderRadius: 6 });
  });

  it("keeps explicit surface overrides through normalization", () => {
    const normalized = normalizeDisplayFrame({
      ...frame,
      style: { ...frame.style, borderColor: "#123456", borderWidth: 3, borderRadius: 18, opacity: 0.4 },
    });

    expect(resolveDisplayFrameSurface(normalized.style)).toMatchObject({
      borderColor: "#123456",
      borderWidth: 3,
      borderRadius: 18,
      opacity: 0.4,
    });
  });
});

describe("display frame item paint", () => {
  it("inherits surface typography when the item carries no style", () => {
    const paint = resolveDisplayFrameItemPaint(itemOf("name"), surface);

    expect(paint).toMatchObject({ kind: "field", color: "#1c3154", fill: "#1c3154", fontSize: 12, fontWeight: 400, opacity: 1, textAnchor: "start" });
  });

  it("emphasises the title field like the canvas card header", () => {
    expect(resolveDisplayFrameItemPaint(itemOf("title"), surface).fontWeight).toBe(700);
    expect(resolveDisplayFrameItemPaint({ ...itemOf("title"), style: { fontWeight: "normal" } }, surface).fontWeight).toBe(400);
    expect(resolveDisplayFrameItemPaint({ ...itemOf("title"), style: { fontWeight: "medium" } }, surface).fontWeight).toBe(500);
  });

  it("renders the city line one step smaller, matching the card row rhythm", () => {
    expect(resolveDisplayFrameItemPaint(itemOf("city"), surface).fontSize).toBe(11);
    expect(resolveDisplayFrameFieldFontSize("city", 9)).toBe(9);
    expect(resolveDisplayFrameFieldFontSize("university", 12)).toBe(12);
    expect(resolveDisplayFrameFieldFontSize(undefined, 12)).toBe(12);
  });

  it("inherits the frame alignment until the item overrides it", () => {
    const centered = resolveDisplayFrameSurface({ ...frame.style, align: "center" });
    const item = itemOf("name");

    expect(resolveDisplayFrameItemPaint(item, centered)).toMatchObject({ align: "center", textAnchor: "middle" });
    expect(resolveDisplayFrameItemPaint({ ...item, style: { align: "right" } }, centered)).toMatchObject({ align: "right", textAnchor: "end" });
    expect(displayFrameTextAnchor("left")).toBe("start");
  });

  it("keeps decoration fill and stroke separate from the text color", () => {
    const line = createDisplayFrameDecorationItem(frame, "line");
    const rectangle = createDisplayFrameDecorationItem(frame, "rectangle");

    expect(resolveDisplayFrameItemPaint(line, surface)).toMatchObject({ color: "#1c3154", fill: "transparent", strokeWidth: 1 });
    expect(resolveDisplayFrameItemPaint(rectangle, surface)).toMatchObject({ fill: "#ffffff", strokeWidth: 1 });
    expect(resolveDisplayFrameItemPaint({ ...rectangle, style: { fill: undefined, strokeWidth: 4, color: "#aa0000" } }, surface))
      .toMatchObject({ color: "#aa0000", fill: "transparent", strokeWidth: 4 });
  });

  it("carries the item opacity token through normalization with a default of 1", () => {
    const text = createDisplayFrameTextItem(frame, "毕业快乐");
    const normalized = normalizeDisplayFrame({
      ...frame,
      fixed: { items: [{ ...text, style: { opacity: 4 } }] },
    });

    expect(normalized.fixed.items[0]?.style).toMatchObject({ opacity: 1 });
    expect(resolveDisplayFrameItemPaint({ ...text, style: { opacity: 0.25 } }, surface).opacity).toBe(0.25);
    expect(resolveDisplayFrameItemPaint(text, surface).opacity).toBe(1);
  });

  it("prefers the item font over the inherited frame font", () => {
    const inherited = resolveDisplayFrameSurface({ ...frame.style, fontId: "frame-font" });

    expect(resolveDisplayFrameItemPaint(itemOf("name"), inherited).fontId).toBe("frame-font");
    expect(resolveDisplayFrameItemPaint({ ...itemOf("name"), style: { fontId: "item-font" } }, inherited).fontId).toBe("item-font");
  });
});

describe("display frame text geometry", () => {
  it("anchors text on the aligned edge without moving the item box", () => {
    const item = { ...itemOf("name"), x: 20, y: 40, width: 100, height: 18 };

    expect(displayFrameTextX(item, resolveDisplayFrameItemPaint(item, surface))).toBe(20);
    expect(displayFrameTextX(item, resolveDisplayFrameItemPaint({ ...item, style: { align: "center" } }, surface))).toBe(70);
    expect(displayFrameTextX(item, resolveDisplayFrameItemPaint({ ...item, style: { align: "right" } }, surface))).toBe(120);
  });

  it("clips the baseline to the item height like the canvas renderer", () => {
    const item = { ...itemOf("name"), y: 40, height: 18 };

    expect(displayFrameTextBaseline(item, resolveDisplayFrameItemPaint(item, surface))).toBe(52);
    expect(displayFrameTextBaseline({ ...item, height: 8 }, resolveDisplayFrameItemPaint(item, surface))).toBe(48);
  });
});

describe("display frame flow blocks", () => {
  it("shares the fixed-mode paint defaults", () => {
    const title = frame.flow.blocks.find((block) => block.id === "title")!;
    const city = frame.flow.blocks.find((block) => block.id === "city")!;

    expect(resolveDisplayFrameBlockPaint(title, surface)).toMatchObject({ fontWeight: 700, fontSize: 12 });
    expect(resolveDisplayFrameBlockPaint(city, surface)).toMatchObject({ fontWeight: 400, fontSize: 11 });
    expect(displayFrameFontWeightValue(undefined, 700)).toBe(700);
    expect(displayFrameFontWeightValue("bold", 400)).toBe(700);
  });
});
