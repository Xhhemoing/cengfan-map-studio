import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { applyTransaction } from "./project-document";
import { MAX_USER_FONT_BYTES } from "./fonts";
import {
  createProjectPackage,
  createProjectPackageEnvelope,
  MAX_PACKAGE_ASSET_BYTES,
  parseProjectPackage,
  projectPackageDisplayName,
  restoreProjectPackage,
  serializeProjectPackage,
} from "./project-package";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { createDefaultDisplayFrame } from "./display-frame";
import { createSystemTemplate } from "./template-document";

const asset = {
  id: "asset-1",
  label: "浙江贴图",
  kind: "province-texture" as const,
  src: "data:image/png;base64,AA==",
  provinceIds: ["浙江省"],
  source: "user" as const,
};
const font = {
  id: "font-1",
  label: "手写体",
  family: "font-1",
  src: "data:font/ttf;base64,AA==",
  format: "truetype" as const,
  source: "user" as const,
};

/** Build a base64 data URL whose decoded payload is at least `bytes` long. */
function dataUrlOfBytes(mime: string, bytes: number, fill = "A"): string {
  return `data:${mime};base64,${fill.repeat(Math.ceil(bytes / 3) * 4)}`;
}

describe("project package", () => {
  it("round-trips the complete project and local resources", () => {
    const project = createProjectDocument({ students: [{ id: "s1", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true }], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, citySubgroups: false };
    const pack = createProjectPackage({ project, assets: [asset], fonts: [font], now: new Date("2026-07-27T00:00:00.000Z") });
    const parsed = parseProjectPackage(serializeProjectPackage(pack));

    expect(parsed.project.students[0]?.name).toBe("苏禾");
    expect(parsed.project.cards.citySubgroups).toBe(false);
    expect(parsed.assets).toEqual([asset]);
    expect(parsed.fonts).toEqual([font]);
  });

  it("round-trips all workspace content including templates and render settings", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const template = {
      id: "custom-1",
      name: "我的完整模板",
      baseTemplateId: "original" as const,
      scope: "visual" as const,
      document: createSystemTemplate("original"),
      createdAt: "2026-07-27T00:00:00.000Z",
    };
    const pack = createProjectPackage({
      project,
      assets: [asset],
      fonts: [font],
      customTemplates: [template],
      renderSettings: { mode: "fixed", fixedFps: 17 },
      now: new Date("2026-07-27T00:00:00.000Z"),
    });

    const parsed = parseProjectPackage(serializeProjectPackage(pack));

    expect(parsed.version).toBe(2);
    expect(parsed.customTemplates).toEqual([template]);
    expect(parsed.renderSettings).toEqual({ mode: "fixed", fixedFps: 17 });
  });

  it("imports v1 packages with defaults for newly bundled workspace settings", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const parsed = parseProjectPackage(JSON.stringify({
      kind: "cengfan-project-package",
      version: 1,
      exportedAt: "2026-07-27T00:00:00.000Z",
      project,
      assets: [],
      fonts: [],
    }));

    expect(parsed.customTemplates).toEqual([]);
    expect(parsed.renderSettings).toEqual(DEFAULT_RENDER_SETTINGS);
  });

  it("repairs legacy font family references so imported typography remains editable", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards.fieldFonts = { title: "LegacyHand", name: "missing-legacy-font" };
    project.textElements = project.textElements.map((text) => ({ ...text, fontId: "LegacyHand" }));
    project.map = {
      ...project.map,
      provinceLabelFontId: "LegacyHand",
      provinceStyles: { 浙江省: { labelFontId: "missing-legacy-font" } },
    };
    project.guests = {
      ...project.guests,
      titleFontId: "LegacyHand",
      peopleFontId: "missing-legacy-font",
      people: [{ id: "guest-1", name: "林老师", visibility: true, fontId: "LegacyHand" }],
    };

    const parsed = restoreProjectPackage({
      kind: "cengfan-project-package",
      version: 1,
      exportedAt: "2026-07-27T00:00:00.000Z",
      project,
      assets: [],
      fonts: [{ ...font, id: "font-user-imported", family: "LegacyHand" }],
    });

    expect(parsed.project.cards.fieldFonts).toEqual({ title: "font-user-imported" });
    expect(parsed.project.textElements.every((text) => text.fontId === "font-user-imported")).toBe(true);
    expect(parsed.project.map.provinceLabelFontId).toBe("font-user-imported");
    expect(parsed.project.map.provinceStyles?.浙江省?.labelFontId).toBeUndefined();
    expect(parsed.project.guests.titleFontId).toBe("font-user-imported");
    expect(parsed.project.guests.peopleFontId).toBeUndefined();
    expect(parsed.project.guests.people[0]?.fontId).toBe("font-user-imported");
  });

  it("rejects unrelated or empty JSON payloads", () => {
    expect(() => parseProjectPackage("{}" )).toThrow("不是蹭饭图工程包");
    expect(() => parseProjectPackage("not-json")).toThrow("工程包不是有效的 JSON");
  });

  it("round-trips projects that have no custom assets or fonts", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const pack = createProjectPackage({ project, assets: [], fonts: [], now: new Date("2026-07-27T00:00:00.000Z") });

    const parsed = parseProjectPackage(serializeProjectPackage(pack));

    expect(parsed.project.schemaVersion).toBe(project.schemaVersion);
    expect(parsed.assets).toEqual([]);
    expect(parsed.fonts).toEqual([]);
  });

  it("round-trips display frame variants without changing final card positions", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const frame = createDefaultDisplayFrame();
    frame.mode = "flow";
    frame.flow.blocks = frame.flow.blocks.map((block) => block.id === "name" ? { ...block, spacing: 24 } : block);
    project.cards = {
      ...project.cards,
      positions: { 北京市: { x: 901, y: 402 } },
      displayFrame: frame,
    };

    const parsed = parseProjectPackage(serializeProjectPackage(createProjectPackage({ project, assets: [], fonts: [] })));

    expect(parsed.project.cards.displayFrame?.mode).toBe("flow");
    expect(parsed.project.cards.displayFrame?.flow.blocks.find((block) => block.id === "name")?.spacing).toBe(24);
    expect(parsed.project.cards.positions).toEqual({ 北京市: { x: 901, y: 402 } });
  });

  it("wraps immutable editor state without cloning it for collaboration transport", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const assets = [asset];
    const fonts = [font];

    const pack = createProjectPackageEnvelope({
      project,
      assets,
      fonts,
      now: new Date("2026-07-27T00:00:00.000Z"),
    });

    expect(pack.project).toBe(project);
    expect(pack.assets).toBe(assets);
    expect(pack.fonts).toBe(fonts);
    expect(restoreProjectPackage(JSON.parse(JSON.stringify(pack)))).toEqual(createProjectPackage({
      project,
      assets,
      fonts,
      now: new Date("2026-07-27T00:00:00.000Z"),
    }));
  });

  it("omits runtime undo history so many province textures remain exportable", () => {
    const textureSrc = `data:image/png;base64,${"A".repeat(128 * 1024)}`;
    let project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const assets = Array.from({ length: 31 }, (_, index) => ({
      id: `texture-${index}`,
      label: `省份贴图 ${index}`,
      kind: "province-texture" as const,
      src: `${textureSrc}${index}`,
      provinceIds: [`省份 ${index}`],
      source: "user" as const,
    }));
    for (const [index, texture] of assets.entries()) {
      project = applyTransaction(project, {
        id: `apply-texture-${index}`,
        label: `应用贴图 ${index}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          map: {
            ...current.map,
            provinceStyles: {
              ...current.map.provinceStyles,
              [`省份 ${index}`]: {
                appearance: { kind: "texture", assetId: texture.id, src: texture.src, fit: "contain" },
              },
            },
          },
        }),
      });
    }

    const serialized = serializeProjectPackage(createProjectPackage({ project, assets, fonts: [] }));
    const parsed = parseProjectPackage(serialized);
    const collaborationPack = createProjectPackageEnvelope({ project, assets, fonts: [] });

    expect(project.history.past).toHaveLength(31);
    expect(parsed.project.history).toEqual({ past: [], future: [] });
    expect(collaborationPack.project.history).toEqual({ past: [], future: [] });
    expect(collaborationPack.assets).toBe(assets);
    expect(serialized.length).toBeLessThan(assets.reduce((total, item) => total + item.src.length, 0) * 3);
    expect(parsed.project.map.provinceStyles?.["省份 30"]?.appearance).toMatchObject({ assetId: "texture-30" });
  });

  it("repairs duplicate and malformed catalog data while relinking project references", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.provinceStyles = {
      浙江省: { appearance: { kind: "texture", assetId: "stale-id", src: "data:image/png;base64,SAME", fit: "contain" } },
      北京市: { appearance: { kind: "texture", assetId: "missing-src", src: "", fit: "contain" } },
    };
    const parsed = restoreProjectPackage({
      kind: "cengfan-project-package",
      version: 2,
      exportedAt: "invalid-date",
      project,
      assets: [
        { id: "texture-good", label: "有效贴图", kind: "province-texture", src: "data:image/png;base64,SAME", provinceIds: ["浙江省", "浙江省", 42], source: "user" },
        { id: "texture-good", label: "重复 ID", kind: "province-texture", src: "data:image/png;base64,OTHER", provinceIds: ["北京市"], source: "user" },
        { id: "same-content", label: "重复内容", kind: "province-texture", src: "data:image/png;base64,SAME", provinceIds: ["江苏省"], source: "user" },
        { id: "missing-src", label: "北京贴图", kind: "province-texture", src: "data:image/png;base64,BEIJING", provinceIds: ["北京市"], source: "user" },
        { id: "broken", label: "损坏素材", kind: "province-texture", src: "", provinceIds: [], source: "user" },
      ],
      fonts: [],
    });

    expect(parsed.exportedAt).toBe(new Date(0).toISOString());
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.assets[0]?.provinceIds).toEqual(["浙江省", "江苏省"]);
    expect(parsed.project.map.provinceStyles?.浙江省?.appearance).toMatchObject({ assetId: "texture-good", src: "data:image/png;base64,SAME" });
    expect(parsed.project.map.provinceStyles?.北京市?.appearance).toMatchObject({ assetId: "missing-src", src: "data:image/png;base64,BEIJING" });
  });

  it("drops fonts past the collaboration ceiling and relinks their references to the default font", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards.fieldFonts = { title: "font-huge", name: "font-1" };
    project.textElements = project.textElements.map((text) => ({ ...text, fontId: "font-huge" }));
    project.guests = { ...project.guests, titleFontId: "font-huge", peopleFontId: "font-1" };

    const parsed = restoreProjectPackage({
      kind: "cengfan-project-package",
      version: 2,
      exportedAt: "2026-07-27T00:00:00.000Z",
      project,
      assets: [],
      fonts: [
        font,
        {
          id: "font-huge",
          label: "全字库宋体",
          family: "font-huge",
          src: dataUrlOfBytes("font/ttf", MAX_USER_FONT_BYTES + 3, "B"),
          format: "truetype",
          source: "user",
        },
      ],
    });

    expect(parsed.fonts).toEqual([font]);
    expect(parsed.project.cards.fieldFonts).toEqual({ name: "font-1" });
    expect(parsed.project.textElements.every((text) => text.fontId === undefined)).toBe(true);
    expect(parsed.project.guests.titleFontId).toBeUndefined();
    expect(parsed.project.guests.peopleFontId).toBe("font-1");
    expect(parsed.warnings).toEqual([expect.stringContaining("字体超过 5MB 上限")]);
  });

  it("keeps text on the surviving copy when two fonts carry the same bytes under different ids", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards.fieldFonts = { title: "font-copy", name: "手写体副本" };
    project.textElements = project.textElements.map((text) => ({ ...text, fontId: "font-copy" }));
    project.map = {
      ...project.map,
      provinceLabelFontId: "font-copy",
      provinceStyles: { 浙江省: { labelFontId: "手写体副本" } },
    };
    project.guests = {
      ...project.guests,
      titleFontId: "font-copy",
      peopleFontId: "font-1",
      people: [{ id: "guest-1", name: "林老师", visibility: true, fontId: "手写体副本" }],
    };

    const parsed = restoreProjectPackage({
      kind: "cengfan-project-package",
      version: 2,
      exportedAt: "2026-07-27T00:00:00.000Z",
      project,
      assets: [],
      fonts: [
        font,
        { ...font, id: "font-copy", label: "手写体副本", family: "手写体副本", src: "data:application/octet-stream;base64,AA==" },
      ],
    });

    expect(parsed.fonts).toEqual([font]);
    expect(parsed.project.cards.fieldFonts).toEqual({ title: "font-1", name: "font-1" });
    expect(parsed.project.textElements.every((text) => text.fontId === "font-1")).toBe(true);
    expect(parsed.project.map.provinceLabelFontId).toBe("font-1");
    expect(parsed.project.map.provinceStyles?.浙江省?.labelFontId).toBe("font-1");
    expect(parsed.project.guests.titleFontId).toBe("font-1");
    expect(parsed.project.guests.people[0]?.fontId).toBe("font-1");
    expect(parsed.warnings).toEqual([expect.stringContaining("字体与包内其他字体内容相同")]);
  });

  it("drops oversized assets together with the scene references that inline their bytes", () => {
    const hugeSrc = dataUrlOfBytes("image/png", MAX_PACKAGE_ASSET_BYTES + 3, "C");
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map = {
      ...project.map,
      renderSource: { kind: "image", assetId: "asset-huge", src: hugeSrc, fit: "cover", opacity: 1 },
      provinceStyles: {
        浙江省: { appearance: { kind: "texture", assetId: "asset-1", src: asset.src, fit: "contain" } },
        北京市: { appearance: { kind: "texture", assetId: "asset-huge", src: hugeSrc, fit: "contain" } },
      },
    };
    project.assetElements = [{
      id: "element-huge",
      assetId: "asset-huge",
      label: "巨幅装饰",
      src: hugeSrc,
      kind: "decoration",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visibility: true,
    }];

    const parsed = restoreProjectPackage({
      kind: "cengfan-project-package",
      version: 2,
      exportedAt: "2026-07-27T00:00:00.000Z",
      project,
      assets: [asset, { id: "asset-huge", label: "巨幅装饰", kind: "decoration", src: hugeSrc, provinceIds: [], source: "user" }],
      fonts: [],
    });

    expect(parsed.assets).toEqual([asset]);
    expect(parsed.project.map.renderSource).toEqual({ kind: "vector" });
    expect(parsed.project.map.provinceStyles?.浙江省?.appearance).toMatchObject({ assetId: "asset-1" });
    expect(parsed.project.map.provinceStyles?.北京市?.appearance).toBeUndefined();
    expect(parsed.project.assetElements).toEqual([]);
    expect(parsed.warnings).toEqual([expect.stringContaining("素材超过 5.0 MB 上限")]);
    expect(serializeProjectPackage(parsed)).not.toContain("warnings");
  });

  it("drops oversized inline images that no catalog entry covers", () => {
    const hugeSrc = dataUrlOfBytes("image/jpeg", MAX_PACKAGE_ASSET_BYTES + 3, "D");
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.canvas = { ...project.canvas, backgroundImageSrc: hugeSrc };
    project.guests = {
      ...project.guests,
      people: [
        { id: "guest-1", name: "林老师", visibility: true, avatarSrc: hugeSrc },
        { id: "guest-2", name: "苏禾", visibility: true, avatarSrc: "data:image/png;base64,AA==" },
      ],
    };

    const parsed = restoreProjectPackage({
      kind: "cengfan-project-package",
      version: 2,
      exportedAt: "2026-07-27T00:00:00.000Z",
      project,
      assets: [],
      fonts: [],
    });

    expect(parsed.project.canvas.backgroundImageSrc).toBeUndefined();
    expect(parsed.project.guests.people[0]?.avatarSrc).toBeUndefined();
    expect(parsed.project.guests.people[1]?.avatarSrc).toBe("data:image/png;base64,AA==");
    expect(parsed.warnings).toEqual([expect.stringContaining("2 处画面内嵌图片超过 5.0 MB 上限")]);
  });

  it("keeps compliant resources untouched across an export and re-import round trip", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map = {
      ...project.map,
      provinceStyles: { 浙江省: { appearance: { kind: "texture", assetId: "asset-1", src: asset.src, fit: "contain" } } },
    };
    project.textElements = project.textElements.map((text) => ({ ...text, fontId: "font-1" }));

    const serialized = serializeProjectPackage(createProjectPackage({ project, assets: [asset], fonts: [font], now: new Date("2026-07-27T00:00:00.000Z") }));
    const parsed = parseProjectPackage(serialized);
    const reimported = parseProjectPackage(serializeProjectPackage(parsed));

    expect(serialized).not.toContain("warnings");
    expect(parsed.warnings).toBeUndefined();
    expect(reimported.assets).toEqual([asset]);
    expect(reimported.fonts).toEqual([font]);
    expect(reimported.project.map.provinceStyles?.浙江省?.appearance).toMatchObject({ assetId: "asset-1", src: asset.src });
    expect(reimported.project.textElements.every((text) => text.fontId === "font-1")).toBe(true);
  });

  it("strips json and cengfan extensions from imported package names", () => {
    expect(projectPackageDisplayName("示例项目.cengfan")).toBe("示例项目");
    expect(projectPackageDisplayName("project.json")).toBe("project");
    expect(projectPackageDisplayName(".json")).toBe("导入的项目");
  });

  it("keeps the published sample package importable", () => {
    const raw = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/示例数据/示例项目.cengfan"), "utf8");
    const pack = parseProjectPackage(raw);
    expect(pack.kind).toBe("cengfan-project-package");
    expect(pack.project.students.length).toBeGreaterThan(0);
  });
});
