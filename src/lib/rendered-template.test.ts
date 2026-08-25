import { describe, expect, it } from "vitest";
import { resolveRenderedTemplate } from "./rendered-template";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createSystemTemplate } from "./template-document";

function documentFixture(templateId: Parameters<typeof createSystemTemplate>[0] = "original"): ProjectDocument {
  return createProjectDocument({ students: [], templateId, dataView: "province" });
}

describe("resolveRenderedTemplate", () => {
  it("starts from the project's own system template", () => {
    const resolved = resolveRenderedTemplate(documentFixture("cartoon"));

    expect(resolved.id).toBe(createSystemTemplate("cartoon").id);
  });

  it("reports the live map scale and card preset rather than the template defaults", () => {
    const project = documentFixture();
    const edited: ProjectDocument = {
      ...project,
      map: { ...project.map, scale: 1.42 },
      cards: { ...project.cards, preset: "ticket" },
    };

    const resolved = resolveRenderedTemplate(edited);

    expect(resolved.map.scale).toBe(1.42);
    expect(resolved.cards.preset).toBe("ticket");
  });

  it("switches the background to image mode as soon as the canvas carries one", () => {
    const project = documentFixture();
    const withImage: ProjectDocument = {
      ...project,
      canvas: { ...project.canvas, backgroundImageSrc: "data:image/png;base64,bg" },
    };

    const resolved = resolveRenderedTemplate(withImage);

    expect(resolved.background.type).toBe("image");
    expect(resolved.background.imageSrc).toBe("data:image/png;base64,bg");
  });

  it("keeps the template's own background colour when the canvas cleared its own", () => {
    const project = documentFixture();
    const base = createSystemTemplate(project.templateId);
    const cleared: ProjectDocument = { ...project, canvas: { ...project.canvas, backgroundColor: "" } };

    expect(resolveRenderedTemplate(cleared).background.color).toBe(base.background.color);
  });

  it("fills in edge defaults that the project never set", () => {
    const project = documentFixture();
    const withoutEdges: ProjectDocument = {
      ...project,
      map: { ...project.map, edgeStyle: undefined, edgeWidth: undefined, provinceStyles: undefined },
    };

    const resolved = resolveRenderedTemplate(withoutEdges);

    expect(resolved.map.edgeStyle).toBe("solid");
    expect(resolved.map.edgeWidth).toBe(1);
    expect(resolved.map.provinceStyles).toEqual({});
  });
});
