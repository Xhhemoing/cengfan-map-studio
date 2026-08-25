import { describe, expect, it } from "vitest";
import { applyCardTemplate, listCardTemplates } from "./card-templates";
import type { CardSettings } from "./scene-document";

const colorPillCards: CardSettings = {
  preset: "borderless",
  presentation: "color-pill",
  templateId: "color-pill",
  x: 0,
  y: 0,
  compactLayout: true,
  showCount: false,
  grouping: "province",
  connectorStyle: "straight",
  connectorDash: "dotted",
  connectorColor: "#1c3154",
  connectorWidth: 1.5,
  visibleFields: ["name", "university", "city"],
  background: "#ffffff",
  textColor: "#1c3154",
  opacity: 1,
  fontSize: 13,
  gap: 12,
  padding: 9,
  horizontalPadding: 15,
  bottomPadding: 10,
  maxWidth: 210,
  columns: "auto",
  allowMapOverlap: false,
  showProvinceTexture: false,
  citySubgroups: false,
  autoBalance: true,
  layoutMode: "quadrant",
};

describe("applyCardTemplate presentation reset", () => {
  it("switches from color-pill to the standard DestinationCard presentation", () => {
    const patch = applyCardTemplate("standard", colorPillCards);

    expect(patch).toMatchObject({
      templateId: "standard",
      preset: "standard",
      presentation: "standard",
    });
  });

  it.each(
    listCardTemplates()
      .filter((template) => template.cards.presentation === undefined)
      .map((template) => [template.id] as const),
  )("resets presentation for builtin non-reference template %s", (templateId) => {
    expect(applyCardTemplate(templateId, colorPillCards).presentation).toBe("standard");
  });
});
