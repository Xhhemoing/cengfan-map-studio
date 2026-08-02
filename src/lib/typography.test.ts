import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { applyTypographyFont } from "./typography";

describe("applyTypographyFont", () => {
  it("sets one province label font without changing other provinces", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });

    const next = applyTypographyFont(project, { type: "province-label", province: "陕西省" }, "font-system-kaiti", false);

    expect(next.map.provinceStyles?.["陕西省"]?.labelFontId).toBe("font-system-kaiti");
    expect(next.map.provinceLabelFontId).toBeUndefined();
  });

  it("applies a province label font to all and clears per-province overrides", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.provinceStyles = {
      陕西省: { labelFontId: "font-system-serif" },
      浙江省: { labelFontId: "font-system-mono" },
    };

    const next = applyTypographyFont(project, { type: "province-label", province: "陕西省" }, "font-system-kaiti", true);

    expect(next.map.provinceLabelFontId).toBe("font-system-kaiti");
    expect(next.map.provinceStyles?.["陕西省"]?.labelFontId).toBeUndefined();
    expect(next.map.provinceStyles?.["浙江省"]?.labelFontId).toBeUndefined();
  });

  it("sets one guest font or applies it to every guest", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests.people = [
      { id: "guest-1", name: "张老师", visibility: true },
      { id: "guest-2", name: "李老师", visibility: true, fontId: "font-system-serif" },
    ];

    const one = applyTypographyFont(project, { type: "guest-person", id: "guest-1" }, "font-system-kaiti", false);
    expect(one.guests.people[0]?.fontId).toBe("font-system-kaiti");
    expect(one.guests.people[1]?.fontId).toBe("font-system-serif");

    const all = applyTypographyFont(one, { type: "guest-person", id: "guest-1" }, "font-system-mono", true);
    expect(all.guests.peopleFontId).toBe("font-system-mono");
    expect(all.guests.people.every((person) => person.fontId === undefined)).toBe(true);
  });

  it("applies the personnel-list font to every name fragment", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });

    const next = applyTypographyFont(project, { type: "card-field", field: "name" }, "font-system-rounded", true);

    expect(next.cards.fieldFonts?.name).toBe("font-system-rounded");
  });
});
