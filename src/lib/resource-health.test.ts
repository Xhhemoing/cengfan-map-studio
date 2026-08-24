import { describe, expect, it } from "vitest";
import { createUserAsset, type UserAsset } from "./assets";
import { createUserFont } from "./fonts";
import { createProjectDocument } from "./project-document";
import { createDefaultDisplayFrame } from "./display-frame";
import { decodeRasterImageSize, listResourceHealthIssues } from "./resource-health";

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

/** 素材记录带原图尺寸（上传管线写入的字段），健康检查按它判断打印精度。 */
function sizedAsset(input: { src: string; width?: number; height?: number }): UserAsset {
  const asset = createUserAsset({ label: "照片", src: input.src, kind: "decoration" });
  if (input.width === undefined || input.height === undefined) return asset;
  return { ...asset, width: input.width, height: input.height } as UserAsset;
}

function projectWithAssetElement(asset: UserAsset, size: { width: number; height: number }) {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  project.assetElements = [{
    id: "asset-instance-1",
    assetId: asset.id,
    label: "照片",
    src: asset.src,
    kind: "decoration",
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visibility: true,
  }];
  return project;
}

function dataUrl(mime: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

/** 最小可解析 PNG 文件头：签名 + IHDR 长度/类型 + 宽高。 */
function pngDataUrl(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return dataUrl("image/png", bytes);
}

/** SOI + 一个带载荷的 APP0 段 + SOF0 帧头，宽高按 JPEG 的「先高后宽」排列。 */
function jpegDataUrl(width: number, height: number): string {
  const app0 = [0xff, 0xe0, 0x00, 0x08, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x00];
  const sof0 = [
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  return dataUrl("image/jpeg", new Uint8Array([0xff, 0xd8, ...app0, ...sof0]));
}

function gifDataUrl(width: number, height: number): string {
  const header = [..."GIF89a"].map((char) => char.charCodeAt(0));
  return dataUrl("image/gif", new Uint8Array([
    ...header,
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    0x00, 0x00, 0x00,
  ]));
}

describe("raster header decoding", () => {
  it("reads dimensions from PNG, JPEG, and GIF data URLs", () => {
    expect(decodeRasterImageSize(pngDataUrl(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(decodeRasterImageSize(jpegDataUrl(640, 480))).toEqual({ width: 640, height: 480 });
    expect(decodeRasterImageSize(gifDataUrl(300, 200))).toEqual({ width: 300, height: 200 });
  });

  it("returns null for vector, remote, truncated, and undecodable sources", () => {
    expect(decodeRasterImageSize(undefined)).toBeNull();
    expect(decodeRasterImageSize("https://example.com/photo.png")).toBeNull();
    expect(decodeRasterImageSize(`data:image/svg+xml;base64,${btoa("<svg width='10'/>")}`)).toBeNull();
    expect(decodeRasterImageSize("data:image/png;base64,iVBORw0K")).toBeNull();
    expect(decodeRasterImageSize("data:image/png;base64,不是 base64")).toBeNull();
  });
});

describe("print resolution health", () => {
  it("warns when a 10×10 raster is stretched to 1000 canvas pixels", () => {
    const asset = sizedAsset({ src: "data:image/png;base64,tiny", width: 10, height: 10 });
    const project = projectWithAssetElement(asset, { width: 1000, height: 1000 });

    const issues = listResourceHealthIssues(project, [asset], []);

    expect(issues).toEqual([expect.objectContaining({
      kind: "resource",
      target: "asset:asset-instance-1",
      severity: "warning",
      code: "low-print-resolution",
    })]);
    expect(issues[0]!.detail).toContain("原图 10×10");
    expect(issues[0]!.detail).toContain("3125×3125");
  });

  it("stays silent when the placed size keeps at least 300dpi", () => {
    // 3125 px 铺 1000 画布像素 = 300dpi，正好达标。
    const asset = sizedAsset({ src: "data:image/png;base64,big", width: 3125, height: 3125 });
    const project = projectWithAssetElement(asset, { width: 1000, height: 1000 });

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([]);
  });

  it("skips assets without intrinsic size instead of reporting a false problem", () => {
    const asset = sizedAsset({ src: "data:image/png;base64,unknown" });
    const project = projectWithAssetElement(asset, { width: 1000, height: 1000 });

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([]);
  });

  it("skips vector assets, whose resolution does not depend on placement", () => {
    const svg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    const asset = sizedAsset({ src: svg });
    const project = projectWithAssetElement(asset, { width: 1000, height: 1000 });

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([]);
  });

  it("reads intrinsic size from a base64 data URL when the record has none", () => {
    const asset = sizedAsset({ src: pngDataUrl(40, 20) });
    const project = projectWithAssetElement(asset, { width: 800, height: 400 });

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([expect.objectContaining({
      target: "asset:asset-instance-1",
      code: "low-print-resolution",
      severity: "warning",
    })]);
  });

  it("uses the drawn size, not the box, for a contained image with another aspect ratio", () => {
    // 竖图 400×3200 放进 1000×1000 的框内按 meet 缩放后只有 125×1000，
    // 短边 400/125*96 = 307dpi，长边 3200/1000*96 = 307dpi，仍然达标。
    const asset = sizedAsset({ src: "data:image/png;base64,tall", width: 400, height: 3200 });
    const project = projectWithAssetElement(asset, { width: 1000, height: 1000 });

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([]);
  });

  it("checks background images against the canvas box", () => {
    const asset = sizedAsset({ src: "data:image/png;base64,bg", width: 200, height: 200 });
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.canvas.backgroundImageSrc = asset.src;
    project.canvas.backgroundFit = "stretch";

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([expect.objectContaining({
      target: "background",
      code: "low-print-resolution",
      severity: "warning",
    })]);
  });

  it("checks map images through the map box and layer scale", () => {
    const asset = sizedAsset({ src: "data:image/png;base64,map", width: 120, height: 80 });
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.renderSource = { kind: "image", assetId: asset.id, src: asset.src, fit: "stretch", opacity: 1 };

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([expect.objectContaining({
      target: "map",
      code: "low-print-resolution",
      severity: "warning",
    })]);
  });

  it("prefers the alignment source size over the asset record for map images", () => {
    const asset = sizedAsset({ src: "data:image/png;base64,aligned", width: 8, height: 8 });
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.scale = 1;
    project.map.renderSource = {
      kind: "image",
      assetId: asset.id,
      src: asset.src,
      fit: "contain",
      opacity: 1,
      alignment: {
        sourceWidth: 6000,
        sourceHeight: 6000,
        sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        rotation: 0,
      },
    };

    // alignment.width=400 是落位尺寸；按 6000px 原图算是 1440dpi，不该告警。
    expect(listResourceHealthIssues(project, [asset], [])).toEqual([]);

    project.map.renderSource = {
      ...project.map.renderSource,
      alignment: { ...project.map.renderSource.alignment!, sourceWidth: 100, sourceHeight: 100 },
    };

    expect(listResourceHealthIssues(project, [asset], [])).toEqual([expect.objectContaining({
      target: "map",
      code: "low-print-resolution",
    })]);
  });

  it("keeps missing-resource errors and does not warn about resolution for them", () => {
    const project = projectWithAssetElement(
      sizedAsset({ src: "data:image/png;base64,gone", width: 10, height: 10 }),
      { width: 1000, height: 1000 },
    );

    const issues = listResourceHealthIssues(project, [], []);

    expect(issues).toEqual([expect.objectContaining({
      target: "asset:asset-instance-1",
      severity: "error",
      code: "missing-resource",
    })]);
  });
});
