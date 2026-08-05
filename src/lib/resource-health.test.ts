import { describe, expect, it } from "vitest";
import { createUserAsset } from "./assets";
import { createUserFont } from "./fonts";
import { createProjectDocument } from "./project-document";
import { createDefaultDisplayFrame } from "./display-frame";
import { listResourceHealthIssues } from "./resource-health";

const projectWithResources = () => {
  const project = createProjectDocument({
    students: [{ id: "student-1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
    templateId: "original",
    dataView: "province",
  });
  project.canvas.backgroundImageSrc = "missing-background";
  project.map.renderSource = {
    kind: "image",
    assetId: "missing-map",
    src: "missing-map-src",
    fit: "contain",
    opacity: 1,
  };
  project.map.provinceStyles = {
    北京市: {
      appearance: { kind: "texture", assetId: "missing-province", src: "missing-province-src", fit: "cover" },
    },
  };
  project.assetElements = [{
    id: "asset-instance-1",
    assetId: "missing-instance",
    label: "缺失装饰",
    src: "missing-instance-src",
    kind: "decoration",
    x: 0,
    y: 0,
    width: 80,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visibility: true,
  }];
  project.textElements = project.textElements.map((text) => ({ ...text, fontId: "missing-text-font" }));
  project.cards.fieldFonts = { name: "missing-card-font" };
  project.map.provinceLabelFontId = "missing-label-font";
  project.guests.titleFontId = "missing-guest-font";
  project.cards.displayFrame = createDefaultDisplayFrame();
  project.cards.displayFrame.style.fontId = "missing-frame-font";
  project.cards.displayFrame.fixed.items[0] = {
    ...project.cards.displayFrame.fixed.items[0]!,
    fontId: "missing-frame-item-font",
  };
  return project;
};

describe("resource health", () => {
  it("reports missing map, background, province appearance, and asset instance resources", () => {
    const issues = listResourceHealthIssues(projectWithResources(), [], []);
    const resourceIssues = issues.filter((issue) => issue.kind === "resource");

    expect(resourceIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "map", severity: "error" }),
      expect.objectContaining({ target: "background", severity: "error" }),
      expect.objectContaining({ target: "province:北京市", severity: "error" }),
      expect.objectContaining({ target: "asset:asset-instance-1", severity: "error" }),
    ]));
  });

  it("reports missing fonts used by text, cards, labels, guests, and display frame", () => {
    const issues = listResourceHealthIssues(projectWithResources(), [], []);
    const fontTargets = issues.filter((issue) => issue.kind === "font").map((issue) => issue.target);

    expect(fontTargets).toEqual(expect.arrayContaining([
      "text:text-title",
      "cards:name",
      "map-labels",
      "guests:title",
      "display-frame:style",
      "display-frame:title",
    ]));
  });

  it("treats built-in assets, built-in fonts, and supplied user resources as available", () => {
    const project = createProjectDocument({
      students: [],
      templateId: "original",
      dataView: "province",
    });
    const asset = createUserAsset({ label: "背景", src: "data:image/png;base64,ok", kind: "background" });
    const font = createUserFont({ label: "手写", src: "data:font/ttf;base64,ok", format: "truetype" });
    project.canvas.backgroundImageSrc = asset.src;
    project.map.provinceLabelFontId = "font-system-serif";
    project.textElements = project.textElements.map((text) => ({ ...text, fontId: font.id }));

    expect(listResourceHealthIssues(project, [asset], [font])).toEqual([]);
  });
});
