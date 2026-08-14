import { describe, it, expect } from "vitest";
import { listCardTemplates, getCardTemplateById, applyCardTemplate, getLegacyPresetTemplateId } from "./card-templates";
import type { CardSettings } from "./scene-document";


const baseCards: CardSettings = {
  preset: "standard",
  x: 0,
  y: 0,
  compactLayout: false,
  showCount: true,
  grouping: "province",
  connectorStyle: "curve",
  connectorDash: "solid",
  connectorColor: "#1c3154",
  connectorWidth: 1.5,
  visibleFields: ["name", "university", "city"],
  background: "#ffffff",
  textColor: "#1c3154",
  opacity: 1,
  fontSize: 13,
  gap: 12,
  padding: 10,
  horizontalPadding: 12,
  bottomPadding: 8,
  maxWidth: 240,
  columns: "auto",
  allowMapOverlap: false,
  showProvinceTexture: false,
  citySubgroups: true,
  autoBalance: true,
  layoutMode: "quadrant",
};

describe("card-templates", () => {
  it("listCardTemplates returns 8+ builtin templates with unique ids", () => {
    const templates = listCardTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(8);
    const ids = templates.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    templates.forEach(t => expect(t.builtin).toBe(true));
  });

  it("getCardTemplateById finds existing and returns undefined for missing", () => {
    expect(getCardTemplateById("standard")).toBeDefined();
    expect(getCardTemplateById("nonexistent")).toBeUndefined();
  });

  it("applyCardTemplate merges template cards and displayFrame, preserves unspecified fields", () => {
    const patch = applyCardTemplate("standard", baseCards);
    expect(patch.preset).toBe("standard");
    expect(patch.compactLayout).toBe(false);
    // records the applied template id so the selector can echo it back
    expect(patch.templateId).toBe("standard");
    // does not overwrite unrelated user fields like connectorColor
    expect(patch.connectorColor).toBeUndefined();
  });

  it("applyCardTemplate records the chosen template id even when presets collide", () => {
    const patch = applyCardTemplate("city-story", baseCards);
    expect(patch.templateId).toBe("city-story");
    expect(patch.grouping).toBe("city");
    expect(patch.preset).toBe("standard");

  });

  it.each([
    ["color-pill", "color-pill"],
    ["emblem-list", "emblem-list"],
    ["city-label", "city-label"],
    ["glass-stat", "glass-stat"],
  ] as const)("applies the reference poster template %s", (templateId, presentation) => {
    const patch = applyCardTemplate(templateId, baseCards);

    expect(patch.presentation).toBe(presentation);
    expect(patch.displayFrame).toBeUndefined();

  });

  it("applying a plain template clears a previously applied custom display frame", () => {
    const withCustomFrame: CardSettings = {
      ...baseCards,
      templateId: "three-line",
      displayFrame: {
        mode: "flow",
        style: { fontSize: 12, color: "#000000", background: "#ffffff", opacity: 1, padding: 8, margin: 0, align: "left", borderColor: "#000000", borderWidth: 1, borderRadius: 6 },
        fieldOrder: ["name", "university", "city"],
        fixed: { items: [] },
        flow: { blocks: [{ id: "block-1", kind: "field", field: "name", order: 0, spacing: 2, lineHeight: 1.2 }] },
      },
    };
    const patch = applyCardTemplate("standard", withCustomFrame);
    expect(patch.templateId).toBe("standard");
    expect(patch.displayFrame).toBeUndefined();
  });

  it("legacy preset mapping works for standard/ticket/photo/borderless/compact", () => {
    expect(getLegacyPresetTemplateId("standard")).toBe("standard");
    expect(getLegacyPresetTemplateId("ticket")).toBe("ticket");
    expect(getLegacyPresetTemplateId("photo")).toBe("photo");
    expect(getLegacyPresetTemplateId("borderless")).toBe("borderless");
    expect(getLegacyPresetTemplateId("compact")).toBe("compact");
    expect(getLegacyPresetTemplateId("unknown")).toBe("standard");
  });

  it("does not expose the retired free-form display-frame templates", () => {
    expect(getCardTemplateById("three-line")).toBeUndefined();
    expect(getCardTemplateById("flow-custom")).toBeUndefined();
    expect(listCardTemplates().every((template) => template.cards.displayFrame === undefined)).toBe(true);
  });
});
