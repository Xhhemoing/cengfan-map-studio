import { describe, expect, it } from "vitest";
import {
  createDefaultDisplayFrame,
  deriveFixedDisplayFrameFromCardSettings,
  normalizeDisplayFrame,
  type DisplayFrameDefinition,
} from "./display-frame";
import { createProjectDocument } from "./project-document";

describe("display frame boundary normalization", () => {
  it("clamps extreme shared and item styles without throwing", () => {
    const frame = createDefaultDisplayFrame();
    let normalized: DisplayFrameDefinition | undefined;

    expect(() => {
      normalized = normalizeDisplayFrame({
        ...frame,
        style: {
          ...frame.style,
          fontSize: -Number.MAX_VALUE,
          opacity: -Number.MAX_VALUE,
          padding: Number.MAX_VALUE,
          margin: Number.POSITIVE_INFINITY,
          borderWidth: Number.MAX_VALUE,
          borderRadius: Number.MAX_VALUE,
        },
        fixed: {
          items: [
            {
              ...frame.fixed.items[0],
              x: Number.NEGATIVE_INFINITY,
              y: Number.POSITIVE_INFINITY,
              width: Number.NaN,
              height: Number.MAX_VALUE,
              style: { fontSize: -1, strokeWidth: -1 },
            },
            {
              id: "maximum-text",
              kind: "text",
              content: "最大字号",
              x: Number.MAX_VALUE,
              y: Number.MAX_VALUE,
              width: Number.MAX_VALUE,
              height: Number.MAX_VALUE,
              zIndex: Number.MAX_VALUE,
              style: { fontSize: 1_000, strokeWidth: 1_000 },
            },
          ],
        },
        flow: {
          blocks: frame.flow.blocks.map((block, index) => ({
            ...block,
            order: index === 0 ? -1_000 : Number.MAX_VALUE,
            spacing: Number.MAX_VALUE,
            lineHeight: Number.MAX_VALUE,
            style: { fontSize: index === 0 ? -1_000 : 1_000 },
          })),
        },
      });
    }).not.toThrow();

    expect(normalized).toBeDefined();
    expect(normalized!.style).toMatchObject({
      fontSize: 8,
      opacity: 0,
      padding: 120,
      margin: 0,
      borderWidth: 24,
      borderRadius: 120,
    });
    expect(normalized!.fixed.items[0]).toMatchObject({
      x: 12,
      y: 12,
      width: 180,
      height: 6_000,
      style: { fontSize: 8, strokeWidth: 0 },
    });
    expect(normalized!.fixed.items[1]).toMatchObject({
      id: "maximum-text",
      x: 6_000,
      y: 6_000,
      width: 6_000,
      height: 6_000,
      zIndex: 1_000,
      style: { fontSize: 240, strokeWidth: 24 },
    });
    expect(normalized!.flow.blocks[0]).toMatchObject({
      order: 0,
      spacing: 120,
      lineHeight: 2.5,
      style: { fontSize: 8 },
    });
    expect(normalized!.flow.blocks[1]?.style).toMatchObject({ fontSize: 240 });
  });

  it("falls back to complete fixed and flow variants when persisted collections are empty", () => {
    const fallback = createDefaultDisplayFrame();
    const normalized = normalizeDisplayFrame({
      mode: "flow",
      style: fallback.style,
      fieldOrder: [],
      fixed: { items: [] },
      flow: { blocks: [] },
    });

    expect(normalized.mode).toBe("flow");
    expect(normalized.fieldOrder).toEqual(fallback.fieldOrder);
    expect(normalized.fixed.items).toEqual(fallback.fixed.items);
    expect(normalized.flow.blocks).toEqual(fallback.flow.blocks);
  });

  it("derives a title-only fixed frame from legacy cards with no visible fields", () => {
    const project = createProjectDocument({
      students: [],
      templateId: "original",
      dataView: "province",
    });
    project.cards = {
      ...project.cards,
      visibleFields: [],
      displayFrame: undefined,
      fontSize: 240,
      opacity: 0,
      padding: 10_000,
    };

    const derived = deriveFixedDisplayFrameFromCardSettings(project.cards);

    expect(project.cards.displayFrame).toBeUndefined();
    expect(derived.mode).toBe("fixed");
    expect(derived.fieldOrder).toEqual(["title"]);
    expect(derived.fixed.items.map((item) => item.id)).toEqual(["title"]);
    expect(derived.style).toMatchObject({ fontSize: 240, opacity: 0, padding: 120 });
  });
});
