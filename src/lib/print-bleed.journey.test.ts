// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { serializePosterSvg } from "./export-poster";
import { createProjectDocument } from "./project-document";
import {
  createProjectPackage,
  parseProjectPackage,
  serializeProjectPackage,
} from "./project-package";

function exportedDimensions(markup: string): { width: number; height: number } {
  return {
    width: Number(markup.match(/\bwidth="([^"]+)"/)?.[1]),
    height: Number(markup.match(/\bheight="([^"]+)"/)?.[1]),
  };
}

describe("print bleed export journey", () => {
  it("exports a larger svg for 3 mm bleed and restores the setting from a project package", () => {
    const sourceProject = createProjectDocument({
      students: [{
        id: "student-print-1",
        name: "林舟",
        university: "北京大学",
        city: "北京市",
        province: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "province",
    });
    const projectWithBleed = {
      ...sourceProject,
      canvas: { ...sourceProject.canvas, printBleedMm: 3 },
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${sourceProject.canvas.width} ${sourceProject.canvas.height}`);
    svg.setAttribute("width", String(sourceProject.canvas.width));
    svg.setAttribute("height", String(sourceProject.canvas.height));
    const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
    title.textContent = "毕业去向";
    svg.appendChild(title);

    const noBleedMarkup = serializePosterSvg(svg, { printBleedMm: 0 });
    const bleedMarkup = serializePosterSvg(svg, {
      printBleedMm: projectWithBleed.canvas.printBleedMm,
    });
    const noBleed = exportedDimensions(noBleedMarkup);
    const bleed = exportedDimensions(bleedMarkup);

    expect(bleed.width).toBeGreaterThan(noBleed.width);
    expect(bleed.height).toBeGreaterThan(noBleed.height);
    expect(bleedMarkup).toContain("毕业去向");

    const restored = parseProjectPackage(serializeProjectPackage(createProjectPackage({
      project: projectWithBleed,
      assets: [],
      fonts: [],
      now: new Date("2026-08-24T00:00:00.000Z"),
    })));
    expect(restored.project.canvas.printBleedMm).toBe(3);
  });
});
