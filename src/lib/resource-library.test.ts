import { describe, expect, it } from "vitest";
import {
  addAssetToLibrary,
  buildAssetUsageLabels,
  describeAssetRemoval,
  describeFontRemoval,
  EMPTY_ASSET_MESSAGE,
  mergeImportedResourcePack,
  prepareResourcePackExport,
  removeAssetFromLibrary,
  removeFontFromLibrary,
  replaceAssetInLibrary,
} from "./resource-library";
import { createDecorationElement } from "./asset-elements";
import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createResourcePack, serializeResourcePack } from "./resource-pack";

function userAsset(id: string, overrides: Partial<UserAsset> = {}): UserAsset {
  return {
    id,
    label: `素材 ${id}`,
    kind: "decoration",
    src: `data:image/png;base64,${id}`,
    provinceIds: [],
    source: "user",
    ...overrides,
  };
}

function userFont(id: string): UserFont {
  return { id, label: `字体 ${id}`, family: id, src: `data:font/woff2;base64,${id}`, format: "woff2", source: "user" };
}

function documentFixture(): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

describe("addAssetToLibrary", () => {
  it("adds a new asset and names it in the confirmation", () => {
    const outcome = addAssetToLibrary([], userAsset("a1"));

    expect(outcome.assets).toHaveLength(1);
    expect(outcome.message).toBe("已加入素材库：素材 a1");
  });

  it("keeps the stored entry when the same content arrives under a new id", () => {
    const existing = [userAsset("a1")];

    const outcome = addAssetToLibrary(existing, userAsset("a2", { src: existing[0]!.src, label: "重复素材" }));

    expect(outcome.assets).toBe(existing);
    expect(outcome.message).toBe("素材库已有相同素材：重复素材");
  });

  it("treats the same image scoped to a different province as a distinct asset", () => {
    const existing = [userAsset("a1", { provinceIds: ["浙江省"] })];

    const outcome = addAssetToLibrary(existing, userAsset("a2", { src: existing[0]!.src, provinceIds: ["江苏省"] }));

    expect(outcome.assets).toHaveLength(2);
  });

  it("has a dedicated message for content that carries nothing to store", () => {
    expect(EMPTY_ASSET_MESSAGE).toBe("素材内容为空，未保存");
  });
});

describe("library removal and replacement", () => {
  it("replaces one entry in place and leaves the rest untouched", () => {
    const assets = [userAsset("a1"), userAsset("a2")];
    const replacement = userAsset("a1", { label: "新素材" });

    const next = replaceAssetInLibrary(assets, "a1", replacement);

    expect(next[0]).toBe(replacement);
    expect(next[1]).toBe(assets[1]);
  });

  it("names the removed asset and font, and falls back when the id is unknown", () => {
    const assets = [userAsset("a1")];
    const fonts = [userFont("f1")];

    expect(describeAssetRemoval(assets, "a1")).toBe("已从素材库删除：素材 a1");
    expect(describeAssetRemoval(assets, "missing")).toBe("已从素材库删除素材");
    expect(describeFontRemoval(fonts, "f1")).toBe("已删除字体：字体 f1");
    expect(describeFontRemoval(fonts, "missing")).toBe("已删除字体");
  });

  it("drops the removed entry from the returned catalogue", () => {
    expect(removeAssetFromLibrary([userAsset("a1"), userAsset("a2")], "a1").assets.map((item) => item.id)).toEqual(["a2"]);
    expect(removeFontFromLibrary([userFont("f1"), userFont("f2")], "f2").fonts.map((item) => item.id)).toEqual(["f1"]);
  });
});

describe("buildAssetUsageLabels", () => {
  it("has no entry for an asset the project never references", () => {
    expect(buildAssetUsageLabels(documentFixture(), [userAsset("a1")])).toEqual({});
  });

  it("counts canvas instances of a used asset", () => {
    const project = documentFixture();
    const used: ProjectDocument = {
      ...project,
      assetElements: [
        createDecorationElement(userAsset("a1"), { x: 0, y: 0 }),
        createDecorationElement(userAsset("a1"), { x: 40, y: 40 }),
      ],
    };

    expect(buildAssetUsageLabels(used, [userAsset("a1")])["a1"]).toBe("使用中 · 2 个实例");
  });

  it("marks a catalogue asset used as the canvas background", () => {
    const project = documentFixture();
    const asset = userAsset("bg");
    const withBackground: ProjectDocument = {
      ...project,
      canvas: { ...project.canvas, backgroundImageSrc: asset.src },
    };

    expect(buildAssetUsageLabels(withBackground, [asset])["bg"]).toBe("使用中 · 背景");
  });

  it("trims administrative suffixes off province names in the badge", () => {
    const project = documentFixture();
    const asset = userAsset("tex", { kind: "province-texture" });
    const withProvince: ProjectDocument = {
      ...project,
      map: {
        ...project.map,
        provinceStyles: { 浙江省: { appearance: { kind: "texture", assetId: "tex", src: asset.src, fit: "cover" } } },
      },
    };

    expect(buildAssetUsageLabels(withProvince, [asset])["tex"]).toBe("使用中 · 浙江");
  });
});

describe("resource pack export", () => {
  it("refuses to build a pack from an empty catalogue", () => {
    const outcome = prepareResourcePackExport({ assets: [], fonts: [] });

    expect(outcome.pack).toBeNull();
    expect(outcome.message).toBe("本地素材库为空，请先上传图片或字体");
  });

  it("reports what went into the pack", () => {
    const outcome = prepareResourcePackExport({ assets: [userAsset("a1")], fonts: [userFont("f1"), userFont("f2")] });

    expect(outcome.pack?.assets).toHaveLength(1);
    expect(outcome.message).toBe("已导出资源包：1 个素材，2 个字体");
  });
});

describe("resource pack import", () => {
  it("merges a valid pack and reports how much of it was new", () => {
    const incoming = serializeResourcePack(createResourcePack({ assets: [userAsset("a1")], fonts: [userFont("f1")] }));

    const outcome = mergeImportedResourcePack({ text: incoming, existingAssets: [], existingFonts: [] });

    expect(outcome.merged?.assets).toHaveLength(1);
    expect(outcome.merged?.fonts).toHaveLength(1);
    expect(outcome.message).toBe("资源包已导入：新增 1/1 素材，1/1 字体");
  });

  it("counts an already-present asset as seen but not added", () => {
    const existing = userAsset("a1");
    const incoming = serializeResourcePack(createResourcePack({ assets: [existing], fonts: [] }));

    const outcome = mergeImportedResourcePack({ text: incoming, existingAssets: [existing], existingFonts: [] });

    expect(outcome.message).toBe("资源包已导入：新增 0/1 素材，0/0 字体");
  });

  it("keeps the catalogue untouched and surfaces the reason when the file is not a pack", () => {
    const outcome = mergeImportedResourcePack({ text: "not json", existingAssets: [], existingFonts: [] });

    expect(outcome.merged).toBeNull();
    expect(outcome.message.length).toBeGreaterThan(0);
  });
});
