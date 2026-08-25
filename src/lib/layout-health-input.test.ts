import { describe, expect, it } from "vitest";
import { checkLayoutHealth } from "./layout-health";
import { buildProjectLayoutHealthInput } from "./layout-health-input";
import { createProjectDocument, type ProjectDocument } from "./project-document";

function baseProject(): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

function objectIds(project: ProjectDocument): string[] {
  return buildProjectLayoutHealthInput(project).objects.map((item) => item.id);
}

describe("buildProjectLayoutHealthInput", () => {
  it("scales the map bounds by the current zoom", () => {
    const project = baseProject();
    project.map = { ...project.map, x: 10, y: 20, width: 100, height: 50, scale: 2 };

    const [map] = buildProjectLayoutHealthInput(project).objects;

    expect(map).toMatchObject({ id: "map", kind: "map", bounds: { x: 10, y: 20, width: 200, height: 100 } });
  });

  it("checks the card group as one object until a card is placed by hand", () => {
    const project = baseProject();
    project.cards = { ...project.cards, positions: {} };

    expect(objectIds(project)).toContain("cards");

    project.cards = { ...project.cards, positions: { 浙江省: { x: 40, y: 60 } } };

    expect(objectIds(project)).toContain("浙江省");
    expect(objectIds(project)).not.toContain("cards");
  });

  it("leaves hidden guests out of the layout entirely", () => {
    const project = baseProject();
    project.guests = { ...project.guests, visibility: true };

    expect(objectIds(project)).toContain("guests");

    project.guests = { ...project.guests, visibility: false };

    expect(objectIds(project)).not.toContain("guests");
  });

  it("anchors centered and right-aligned text by its alignment point", () => {
    const project = baseProject();
    const [text] = project.textElements;
    project.textElements = [
      { ...text!, id: "left", x: 100, y: 100, maxWidth: 200, fontSize: 10, textAlign: "left" },
      { ...text!, id: "center", x: 100, y: 100, maxWidth: 200, fontSize: 10, textAlign: "center" },
      { ...text!, id: "right", x: 100, y: 100, maxWidth: 200, fontSize: 10, textAlign: "right" },
    ];

    const bounds = Object.fromEntries(
      buildProjectLayoutHealthInput(project).objects
        .filter((item) => item.kind === "text")
        .map((item) => [item.id, item.bounds.x]),
    );

    expect(bounds).toEqual({ left: 100, center: 0, right: -100 });
  });

  it("keeps every default text inside the safe margin so a new project reports no overflow", () => {
    const issues = checkLayoutHealth(buildProjectLayoutHealthInput(baseProject()))
      .filter((issue) => issue.kind === "out-of-bounds" || issue.kind === "overflow");

    expect(issues).toEqual([]);
  });
});
