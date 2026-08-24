import { describe, expect, it } from "vitest";
import { applyFontIdRemap } from "./apply-font-remap";
import { createProjectDocument, type ProjectDocument } from "./project-document";

/** createProjectDocument 会保留模板自带的文本，按 id 取回本测试关心的那两条。 */
function fontIdOf(project: ProjectDocument, id: string): string | undefined {
  return project.textElements.find((text) => text.id === id)?.fontId;
}

function projectWithFonts(): ProjectDocument {
  const base = createProjectDocument({
    students: [],
    templateId: "original",
    dataView: "province",
    textElements: [
      { id: "text-title", content: "标题", x: 10, y: 10, fontSize: 24, color: "#000", fontId: "font-pack" },
      { id: "text-note", content: "备注", x: 10, y: 40, fontSize: 14, color: "#333", fontId: "font-kept" },
    ],
  });
  return {
    ...base,
    map: {
      ...base.map,
      provinceLabelFontId: "font-pack",
      provinceStyles: { 浙江省: { ...base.map.provinceStyles?.["浙江省"], labelFontId: "font-pack" } },
    },
    cards: { ...base.cards, fieldFonts: { name: "font-pack", university: "font-kept" } },
    guests: {
      ...base.guests,
      titleFontId: "font-pack",
      peopleFontId: "font-kept",
      people: [
        { id: "guest-1", name: "王老师", fontId: "font-pack", visibility: true },
        { id: "guest-2", name: "李老师", visibility: true },
      ],
    },
  };
}

describe("applyFontIdRemap", () => {
  it("rewrites every reference to a deduped font id", () => {
    const project = projectWithFonts();

    const { project: next, rewritten } = applyFontIdRemap(project, { "font-pack": "font-kept" });

    expect(rewritten).toBe(6);
    expect(fontIdOf(next, "text-title")).toBe("font-kept");
    expect(fontIdOf(next, "text-note")).toBe("font-kept");
    expect(next.map.provinceLabelFontId).toBe("font-kept");
    expect(next.map.provinceStyles?.["浙江省"]?.labelFontId).toBe("font-kept");
    expect(next.cards.fieldFonts).toEqual({ name: "font-kept", university: "font-kept" });
    expect(next.guests.titleFontId).toBe("font-kept");
    expect(next.guests.people.map((person) => person.fontId)).toEqual(["font-kept", undefined]);
  });

  it("also follows the family key a legacy scene may reference a dropped font by", () => {
    const project = projectWithFonts();
    const withFamilyReference: ProjectDocument = {
      ...project,
      textElements: project.textElements.map((text) => (
        text.id === "text-title" ? { ...text, fontId: "PackHand" } : text
      )),
    };

    const { project: next } = applyFontIdRemap(withFamilyReference, { "font-pack": "font-kept", PackHand: "font-kept" });

    expect(fontIdOf(next, "text-title")).toBe("font-kept");
  });

  it("follows a chain of remapped ids to the copy that survived", () => {
    const project = projectWithFonts();

    const { project: next } = applyFontIdRemap(project, { "font-pack": "font-middle", "font-middle": "font-kept" });

    expect(fontIdOf(next, "text-title")).toBe("font-kept");
    expect(next.guests.titleFontId).toBe("font-kept");
  });

  it("stops on a cyclic remap instead of looping forever", () => {
    const project = projectWithFonts();

    const { project: next, rewritten } = applyFontIdRemap(project, { "font-pack": "font-kept", "font-kept": "font-pack" });

    expect(rewritten).toBeGreaterThan(0);
    expect(fontIdOf(next, "text-title")).toBe("font-kept");
    expect(fontIdOf(next, "text-note")).toBe("font-pack");
  });

  it("returns the same project when the remap is empty", () => {
    const project = projectWithFonts();

    const result = applyFontIdRemap(project, {});

    expect(result.project).toBe(project);
    expect(result.rewritten).toBe(0);
  });

  it("returns the same project when no reference points at a deduped font", () => {
    const project = projectWithFonts();

    const result = applyFontIdRemap(project, { "font-elsewhere": "font-kept" });

    expect(result.project).toBe(project);
    expect(result.rewritten).toBe(0);
  });

  it("leaves history untouched so undo still reaches the pre-import state", () => {
    const project = projectWithFonts();

    const { project: next } = applyFontIdRemap(project, { "font-pack": "font-kept" });

    expect(next.history).toBe(project.history);
  });
});
