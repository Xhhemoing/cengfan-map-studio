import { describe, expect, it } from "vitest";
import {
  clampDisplayFrameItem,
  createDisplayFrameDecorationItem,
  createDefaultDisplayFrame,
  createDisplayFrameTextItem,
  deriveFixedDisplayFrameFromCardSettings,
  normalizeDisplayFrame,
  restoreDisplayFrameVariant,
  switchDisplayFrameMode,
} from "./display-frame";
import { createDefaultScene, normalizeScene } from "./scene-document";

const legacyCards = createDefaultScene("original").cards;

describe("display frame model", () => {
  it("creates both mutually exclusive presentation variants with shared style defaults", () => {
    const frame = createDefaultDisplayFrame();

    expect(frame.mode).toBe("fixed");
    expect(frame.style).toMatchObject({ fontSize: 12, color: "#1c3154", background: "#ffffff", padding: 12, align: "left" });
    expect(frame.fieldOrder).toEqual(["title", "name", "university", "city"]);
    expect(frame.fixed.items.length).toBeGreaterThan(0);
    expect(frame.flow.blocks.map((block) => block.order)).toEqual([0, 1, 2, 3]);
  });

  it("falls back safely and clamps malformed persisted fields", () => {
    const normalized = normalizeDisplayFrame({
      mode: "unknown",
      style: { fontSize: -10, color: "", padding: 999, align: "diagonal" },
      fieldOrder: ["name", "name", "unknown"],
      fixed: { items: [{ id: "name", kind: "field", field: "name", x: -5, y: 4, width: 0, height: 900, zIndex: Number.NaN }] },
      flow: { blocks: [{ id: "name", kind: "field", field: "name", order: -2, spacing: -4, lineHeight: 99 }] },
    });

    expect(normalized.mode).toBe("fixed");
    expect(normalized.style.fontSize).toBe(8);
    expect(normalized.style.padding).toBe(120);
    expect(normalized.style.align).toBe("left");
    expect(normalized.fieldOrder).toEqual(["name"]);
    expect(normalized.fixed.items[0]).toMatchObject({ x: 0, y: 4, width: 1, height: 900, zIndex: 0 });
    expect(normalized.flow.blocks[0]).toMatchObject({ order: 0, spacing: 0, lineHeight: 2.5 });
  });

  it("derives a fixed local frame from legacy card settings without using final card positions", () => {
    const frame = deriveFixedDisplayFrameFromCardSettings({
      ...legacyCards,
      visibleFields: ["name", "city"],
      fieldFonts: { name: "font-name" },
      fieldTypography: { name: { fontSize: 18, color: "#123456" } },
      positions: { "北京市": { x: 777, y: 333 } },
    });

    expect(frame.mode).toBe("fixed");
    expect(frame.fieldOrder).toEqual(["title", "name", "city"]);
    expect(frame.fixed.items.find((item) => item.id === "name")).toMatchObject({
      kind: "field",
      field: "name",
      style: { fontId: "font-name", fontSize: 18, color: "#123456" },
    });
    expect(JSON.stringify(frame)).not.toContain("777");
  });

  it("switches mode while preserving shared style and restores each edited variant", () => {
    const original = deriveFixedDisplayFrameFromCardSettings(legacyCards);
    const fixedEdited = {
      ...original,
      style: { ...original.style, background: "#ffeeaa" },
      fixed: { items: original.fixed.items.map((item) => item.id === "name" ? { ...item, x: 90 } : item) },
    };
    const flow = switchDisplayFrameMode(fixedEdited, "flow");
    const flowEdited = {
      ...flow,
      flow: { blocks: flow.flow.blocks.map((block) => block.id === "name" ? { ...block, spacing: 24 } : block) },
    };

    expect(flow.mode).toBe("flow");
    expect(flow.style.background).toBe("#ffeeaa");
    expect(restoreDisplayFrameVariant(flowEdited, "fixed").fixed.items.find((item) => item.id === "name")?.x).toBe(90);
    expect(restoreDisplayFrameVariant(flowEdited, "flow").flow.blocks.find((block) => block.id === "name")?.spacing).toBe(24);
  });

  it("keeps a missing frame optional while deriving a compatible render frame", () => {
    const oldScene = createDefaultScene("original");
    const withoutFrame = {
      ...oldScene,
      cards: { ...oldScene.cards, displayFrame: undefined, opacity: 0.42, fontSize: 18 },
    };

    const normalized = normalizeScene(withoutFrame);
    const derived = deriveFixedDisplayFrameFromCardSettings(normalized.cards);

    expect(oldScene.cards.displayFrame).toBeUndefined();
    expect(normalized.cards.displayFrame).toBeUndefined();
    expect(derived.style).toMatchObject({ opacity: 0.42, fontSize: 18 });
    expect(normalized.cards.positions).toEqual(oldScene.cards.positions);
  });

  it("creates and clamps custom text and decoration items inside a local frame", () => {
    const frame = createDefaultDisplayFrame();
    const text = createDisplayFrameTextItem(frame, "毕业快乐");
    const line = createDisplayFrameDecorationItem(frame, "line");
    const normalized = normalizeDisplayFrame({
      ...frame,
      fixed: {
        items: [
          ...frame.fixed.items,
          { ...text, x: -12, y: 7000, width: 0, height: -5 },
          { ...line, x: 7000, y: -12, width: 0, height: 0 },
        ],
      },
    });

    expect(clampDisplayFrameItem({ ...text, x: -1, y: 9999, width: 0, height: -2 })).toMatchObject({ x: 0, y: 6000, width: 1, height: 1 });
    expect(normalized.fixed.items.at(-2)).toMatchObject({ kind: "text", content: "毕业快乐", x: 0, width: 1 });
    expect(normalized.fixed.items.at(-1)).toMatchObject({ kind: "decoration", decoration: "line", y: 0, width: 1, height: 1 });
  });

  it("preserves local frame surface and item typography through normalization", () => {
    const frame = createDefaultDisplayFrame();
    const normalized = normalizeDisplayFrame({
      ...frame,
      style: { ...frame.style, borderColor: "#123456", borderWidth: 3, borderRadius: 18 },
      fixed: {
        items: [{
          ...frame.fixed.items[0],
          style: { fontWeight: "bold", align: "center", color: "#456789" },
        }],
      },
    });

    expect(normalized.style).toMatchObject({ borderColor: "#123456", borderWidth: 3, borderRadius: 18 });
    expect(normalized.fixed.items[0]?.style).toMatchObject({ fontWeight: "bold", align: "center", color: "#456789" });
  });
});
