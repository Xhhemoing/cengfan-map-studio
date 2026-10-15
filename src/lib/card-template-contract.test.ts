import { describe, expect, it } from "vitest";
import { applyCardTemplate, getCardTemplateLayoutSuggestions, listCardTemplates } from "./card-templates";
import { createDefaultScene } from "./scene-document";

describe("card template application contract", () => {
  const current = {
    ...createDefaultScene("original").cards,
    grouping: "university" as const,
    positions: { kept: { x: 312, y: 178 } },
    layoutMode: "grid" as const,
    maxWidth: 314,
    gap: 19,
    allowMapOverlap: false,
    showCount: false,
    citySubgroups: false,
    visibleFields: ["name"] as const,
    fieldFonts: { name: "user-font" },
    fieldTypography: { name: { fontSize: 24, color: "#004488" } },
  };
  // Keep mutable document arrays independent of the assertion fixture.
  const cards = () => ({ ...current, visibleFields: [...current.visibleFields] });

  it.each(listCardTemplates().map(({ id }) => id))(
    "changing appearance to %s preserves content, user typography and layout intent",
    (id) => {
      const before = cards();
      const after = { ...before, ...applyCardTemplate(id, before) };
      for (const key of ["grouping", "positions", "layoutMode", "maxWidth", "gap", "allowMapOverlap", "showCount", "citySubgroups", "visibleFields", "fontSize", "fieldFonts", "fieldTypography"] as const) {
        expect(after[key], `${id}.${key}`).toEqual(before[key]);
      }
    },
  );

  it("changing A then B produces the same result as choosing B directly", () => {
    for (const first of listCardTemplates()) {
      for (const second of listCardTemplates()) {
        const original = cards();
        const intermediate = { ...original, ...applyCardTemplate(first.id, original) };
        const sequential = { ...intermediate, ...applyCardTemplate(second.id, intermediate) };
        const direct = { ...original, ...applyCardTemplate(second.id, original) };
        expect(sequential, `${first.id} → ${second.id}`).toEqual(direct);
      }
    }
  });

  it("applies structural and space suggestions only when requested explicitly", () => {
    const before = cards();
    const suggestions = getCardTemplateLayoutSuggestions("city-label", before);
    expect(suggestions).toMatchObject({ grouping: "city", maxWidth: 220, allowMapOverlap: true });
    expect(suggestions.positions).toBeUndefined();
    expect(suggestions.fieldTypography).toBeUndefined();
    expect({ ...before, ...applyCardTemplate("city-label", before, "visual-and-layout") }).toMatchObject({
      ...suggestions,
      positions: before.positions,
      layoutMode: before.layoutMode,
      fieldTypography: before.fieldTypography,
    });
    expect(getCardTemplateLayoutSuggestions("missing", before)).toEqual({});
  });

  it("does not suggest fields that already match the template", () => {
    const before = { ...cards(), grouping: "city" as const, maxWidth: 220, showCount: false, allowMapOverlap: true };
    expect(getCardTemplateLayoutSuggestions("city-label", before)).toEqual({});
  });
});
