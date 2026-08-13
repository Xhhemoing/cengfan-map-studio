import { describe, it, expect } from "vitest";
import { listCardTemplates, getCardTemplateById, applyCardTemplate, getLegacyPresetTemplateId } from "./card-templates";
import type { CardSettings } from "./scene-document";
import { normalizeDisplayFrame } from "./display-frame";

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
    const flow = applyCardTemplate("three-line", baseCards);
    expect(flow.templateId).toBe("three-line");
    expect(flow.displayFrame?.mode).toBe("flow");
  });

  it("legacy preset mapping works for standard/ticket/photo/borderless/compact", () => {
    expect(getLegacyPresetTemplateId("standard")).toBe("standard");
    expect(getLegacyPresetTemplateId("ticket")).toBe("ticket");
    expect(getLegacyPresetTemplateId("photo")).toBe("photo");
    expect(getLegacyPresetTemplateId("borderless")).toBe("borderless");
    expect(getLegacyPresetTemplateId("compact")).toBe("compact");
    expect(getLegacyPresetTemplateId("unknown")).toBe("standard");
  });

  it("templates with displayFrame have valid normalized frames", () => {
    const flowTemplates = listCardTemplates().filter(t => t.displayFrame);
    expect(flowTemplates.length).toBeGreaterThanOrEqual(2);
    flowTemplates.forEach(t => {
      expect(() => normalizeDisplayFrame(t.displayFrame!)).not.toThrow();
    });
  });
});
