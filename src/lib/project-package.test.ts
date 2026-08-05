import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { applyTransaction } from "./project-document";
import {
  createProjectPackage,
  createProjectPackageEnvelope,
  parseProjectPackage,
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
});
