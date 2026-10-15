import { describe, expect, it } from "vitest";
import { buildProjectCardContents } from "./resolved-card-content";
import { diagnoseCardTypography } from "./card-typography-diagnostics";
import { createSampleProject } from "./project-store";

describe("card typography diagnostics", () => {
  it("locates a no-wrap field and reports the estimated measurement source", () => {
    const project = createSampleProject().pack.project;
    project.students = project.students.map((student) => ({ ...student, name: "超长展示框姓名超长展示框姓名" }));
    project.cards = {
      ...project.cards,
      visibleFields: ["name"],
      noWrapFields: ["name"],
      maxWidth: 80,
      minWidth: 80,
      minFontSize: 14,
      fontSize: 10,
    };
    const cards = buildProjectCardContents(project);
    const issues = diagnoseCardTypography(project, cards);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringContaining(":no-wrap:name"), kind: "text-overflow", source: "estimated" }),
      expect.objectContaining({ id: expect.stringContaining(":font-size"), kind: "unreadable-text", source: "estimated" }),
    ]));
  });

  it("uses the measured source when callers provide an explicit measured callback", () => {
    const project = createSampleProject().pack.project;
    project.cards = { ...project.cards, minFontSize: 48, fontSize: 10 };
    const cards = buildProjectCardContents(project, undefined, {
      measureText: () => 10,
      measurementStatus: "measured",
    });
    expect(diagnoseCardTypography(project, cards, { measureText: () => 10, measurementStatus: "measured" })
      .find((issue) => issue.kind === "unreadable-text")?.source).toBe("measured");
  });
});
