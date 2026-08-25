import { describe, expect, it } from "vitest";
import type { AssetElement } from "./scene-document";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { decodeRasterSize, runPrintPreflight } from "./print-preflight";

function base64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function bigEndian32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** 只造出解码器读的那一段：签名 + IHDR（宽高 / 位深 / 颜色类型）。 */
function pngDataUrl(width: number, height: number): string {
  return `data:image/png;base64,${base64([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    ...bigEndian32(width), ...bigEndian32(height),
    8, 6, 0, 0, 0,
  ])}`;
}

/** SOI + 一段 APP0 + SOF0，模拟真实 JPEG 里帧头排在其他段之后。 */
function jpegDataUrl(width: number, height: number): string {
  return `data:image/jpeg;base64,${base64([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ])}`;
}

function baseProject(): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

function decoration(src: string, size: number): AssetElement {
  return {
    id: "asset-photo",
    assetId: "asset-user-photo",
    label: "毕业合影",
    src,
    kind: "decoration",
    x: 40,
    y: 40,
    width: size,
    height: size,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visibility: true,
  };
}

const emptyOptions = { assets: [], fonts: [] };

describe("print preflight", () => {
  it("warns that a transparent export leaves the bleed area with nothing to trim", () => {
    const project = baseProject();
    project.canvas.printBleedMm = 3;

    const withTransparency = runPrintPreflight(project, { ...emptyOptions, transparentExport: true });
    expect(withTransparency.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "transparent-bleed", target: "background", severity: "warning" }),
    ]));
    expect(withTransparency.bleedMm).toBe(3);
    expect(withTransparency.ready).toBe(false);

    const opaque = runPrintPreflight(project, { ...emptyOptions, transparentExport: false });
    expect(opaque.issues.some((issue) => issue.kind === "transparent-bleed")).toBe(false);
  });

  it("keeps the transparency warning quiet when the project has no bleed", () => {
    const preflight = runPrintPreflight(baseProject(), { ...emptyOptions, transparentExport: true, pngScale: 3 });

    expect(preflight.issues).toEqual([]);
    expect(preflight.ready).toBe(true);
  });

  it("reports fonts the export would silently substitute", () => {
    const project = baseProject();
    project.textElements = project.textElements.map((text) => ({ ...text, fontId: "font-user-handwriting" }));
    project.cards.fieldFonts = { name: "font-user-handwriting" };

    const preflight = runPrintPreflight(project, emptyOptions);
    const fontIssues = preflight.issues.filter((issue) => issue.kind === "missing-font");

    expect(fontIssues.map((issue) => issue.target)).toEqual(expect.arrayContaining(["text:text-title", "cards:name"]));
    expect(fontIssues.every((issue) => issue.severity === "error")).toBe(true);
    expect(fontIssues[0]!.detail).toContain("font-user-handwriting");
  });

  it("flags a tiny bitmap stretched across the canvas", () => {
    const project = baseProject();
    project.assetElements = [decoration(pngDataUrl(4, 4), 200)];

    const preflight = runPrintPreflight(project, { ...emptyOptions, pngScale: 1 });
    const issue = preflight.issues.find((candidate) => candidate.kind === "low-resolution-raster");

    expect(issue).toMatchObject({ target: "asset:asset-photo", severity: "warning" });
    // 4px 铺满 200 画布像素 = 4 × 96 ÷ 200 ≈ 1.9dpi。
    expect(issue?.dpi).toBeCloseTo(1.9, 1);
    expect(issue?.detail).toContain("4×4px");
    expect(preflight.measuredRasters).toBe(1);
  });

  it("raises the resolution bar with the export scale", () => {
    const project = baseProject();
    // 300px 的图铺在 300 画布像素上正好 96dpi：1× 导出够用，3× 导出就欠了。
    project.assetElements = [decoration(pngDataUrl(300, 300), 300)];

    const atOneTimes = runPrintPreflight(project, { ...emptyOptions, pngScale: 1 });
    expect(atOneTimes.requiredDpi).toBe(96);
    expect(atOneTimes.issues).toEqual([]);

    const atThreeTimes = runPrintPreflight(project, { ...emptyOptions, pngScale: 3 });
    expect(atThreeTimes.requiredDpi).toBe(288);
    expect(atThreeTimes.issues).toEqual([
      expect.objectContaining({ kind: "low-resolution-raster", dpi: 96 }),
    ]);
  });

  it("measures the background against the bleed box and the map image against the map scale", () => {
    const project = baseProject();
    project.canvas.width = 800;
    project.canvas.height = 600;
    project.canvas.printBleedMm = 3;
    project.canvas.backgroundImageSrc = pngDataUrl(4000, 3000);
    project.map.width = 400;
    project.map.height = 400;
    project.map.scale = 2;
    project.map.renderSource = {
      kind: "image",
      assetId: "asset-map",
      src: jpegDataUrl(400, 400),
      fit: "cover",
      opacity: 1,
    };

    const preflight = runPrintPreflight(project, { ...emptyOptions, pngScale: 3 });
    const targets = preflight.issues.filter((issue) => issue.kind === "low-resolution-raster").map((issue) => issue.target);

    // 背景 4000px 铺满 800+2×3mm 的出血框仍有约 470dpi；地图 400px 被放大到 800 画布像素只剩 48dpi。
    expect(targets).toEqual(["map"]);
    expect(preflight.measuredRasters).toBe(2);
  });

  it("skips vector art and records raster sources it cannot measure", () => {
    const project = baseProject();
    project.canvas.backgroundImageSrc = "data:image/svg+xml,%3Csvg%2F%3E";
    project.assetElements = [decoration("https://example.com/photo.png", 200)];

    const preflight = runPrintPreflight(project, emptyOptions);

    expect(preflight.issues.some((issue) => issue.kind === "low-resolution-raster")).toBe(false);
    expect(preflight.unmeasured).toEqual(["asset:asset-photo"]);
    expect(preflight.measuredRasters).toBe(0);
  });

  it("prefers a recorded natural size over decoding the source", () => {
    const project = baseProject();
    project.assetElements = [decoration("https://example.com/photo.png", 200)];

    const preflight = runPrintPreflight(project, {
      ...emptyOptions,
      assets: [{
        id: "asset-user-photo",
        label: "毕业合影",
        kind: "decoration" as const,
        src: "https://example.com/photo.png",
        provinceIds: [],
        source: "user" as const,
        naturalWidth: 100,
        naturalHeight: 100,
      }],
    });

    expect(preflight.unmeasured).toEqual([]);
    expect(preflight.issues).toEqual([
      expect.objectContaining({ kind: "low-resolution-raster", dpi: 48 }),
    ]);
  });

  it("warns that even a 3× PNG stays under the 300dpi print line once bleed is on", () => {
    const project = baseProject();
    project.canvas.printBleedMm = 3;

    const preflight = runPrintPreflight(project, { ...emptyOptions, pngScale: 3 });

    expect(preflight.exportDpi).toBe(288);
    expect(preflight.issues).toEqual([
      expect.objectContaining({ kind: "export-resolution", target: "export", severity: "warning" }),
    ]);
  });

  it("decodes png, jpeg, gif, and webp headers", () => {
    expect(decodeRasterSize(pngDataUrl(1024, 768))).toEqual({ width: 1024, height: 768 });
    expect(decodeRasterSize(jpegDataUrl(640, 480))).toEqual({ width: 640, height: 480 });
    expect(decodeRasterSize(`data:image/gif;base64,${base64([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00, 0, 0, 0, 0, 0, 0, 0, 0,
    ])}`)).toEqual({ width: 32, height: 16 });
    expect(decodeRasterSize(`data:image/webp;base64,${base64([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x00, 0x00, 0x1f, 0x00, 0x00, 0, 0,
    ])}`)).toEqual({ width: 64, height: 32 });
    expect(decodeRasterSize("https://example.com/photo.png")).toBeNull();
  });
});
