import { listSystemAssets, type StudioAsset, type UserAsset } from "./assets";
import { BUILT_IN_FONTS, type UserFont } from "./fonts";
import { mapImageElementPlacement } from "./map-alignment";
import { CSS_PX_PER_INCH } from "./print-bleed";
import type { ProjectDocument } from "./project-document";
import type { DisplayFrameDefinition } from "./display-frame";

export type ResourceHealthKind = "resource" | "font";
export type ResourceHealthSeverity = "warning" | "error";
export type ResourceHealthCode = "missing-resource" | "missing-font" | "low-print-resolution";

export interface ResourceHealthIssue {
  kind: ResourceHealthKind;
  target: string;
  detail: string;
  severity: ResourceHealthSeverity;
  /** 机器可读的问题类型；旧调用方只读 kind/severity 时可忽略。 */
  code?: ResourceHealthCode;
}

interface ResourceReference {
  target: string;
  id?: string;
  src?: string;
  label: string;
}

function findResource(reference: ResourceReference, assets: readonly UserAsset[]): StudioAsset | undefined {
  const available: StudioAsset[] = [...listSystemAssets(), ...assets];
  return available.find((asset) => (
    reference.id && asset.id === reference.id
  ) || (
    reference.src && asset.src === reference.src
  ));
}

function addMissingResource(
  issues: ResourceHealthIssue[],
  reference: ResourceReference,
  assets: readonly UserAsset[],
): void {
  if (!reference.id && !reference.src) return;
  if (findResource(reference, assets)) return;
  issues.push({
    kind: "resource",
    target: reference.target,
    detail: `${reference.label}缺失${reference.id ? `（${reference.id}）` : ""}`,
    severity: "error",
    code: "missing-resource",
  });
}

function hasFont(fontId: string | undefined, fonts: readonly UserFont[]): boolean {
  if (!fontId) return true;
  return BUILT_IN_FONTS.some((font) => font.id === fontId)
    || fonts.some((font) => font.id === fontId || font.family === fontId);
}

function addMissingFont(
  issues: ResourceHealthIssue[],
  target: string,
  fontId: string | undefined,
  label: string,
  fonts: readonly UserFont[],
): void {
  if (!fontId || hasFont(fontId, fonts)) return;
  issues.push({
    kind: "font",
    target,
    detail: `${label}字体缺失（${fontId}）`,
    severity: "error",
    code: "missing-font",
  });
}

/**
 * 打印分辨率检查。
 *
 * 单位与 `lib/print-bleed` 一致：画布坐标 = 96dpi CSS 像素，所以一张位图铺在
 * W 个画布像素宽度上时，成品精度是 `原图宽 / W * 96` dpi。印厂常规要求
 * 300dpi，低于这个值放大付印会糊。
 *
 * 只在确实知道原图像素尺寸时才判定：素材记录上的显式尺寸字段、地图对齐里记录的
 * sourceWidth/sourceHeight，或能从 base64 data URL 文件头解出尺寸的光栅格式。
 * 矢量（SVG）与解不出尺寸的格式一律跳过——缺元数据不等于有问题，不能误报。
 */
export const PRINT_DPI_TARGET = 300;

/** 舍入余量：299.7dpi 与 300dpi 在印刷上没有区别。 */
const PRINT_DPI_TOLERANCE = 0.5;

/** 尺寸信息都在文件头，只解码前若干字节，避免把整张图 base64 解一遍。 */
const MAX_HEADER_BYTES = 64 * 1024;

export interface IntrinsicImageSize {
  width: number;
  height: number;
}

type ImageFit = "cover" | "contain" | "stretch";

function positiveSize(width: unknown, height: unknown): IntrinsicImageSize | null {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) return null;
  if (numericWidth <= 0 || numericHeight <= 0) return null;
  return { width: numericWidth, height: numericHeight };
}

/** 素材记录上可能带的原图尺寸；老素材没有这些字段，返回 null 表示未知。 */
export function readRecordedImageSize(source: unknown): IntrinsicImageSize | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  return positiveSize(record.width, record.height)
    ?? positiveSize(record.naturalWidth, record.naturalHeight);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index] ?? 0);
  return text;
}

function decodeDataUrlHeader(src: string): Uint8Array | null {
  const match = /^data:([^;,]*);base64,/i.exec(src);
  if (!match) return null;
  if (match[1]!.toLowerCase().startsWith("image/svg")) return null;
  const body = src.slice(match[0].length).replace(/\s+/g, "");
  const wanted = Math.min(body.length, Math.ceil(MAX_HEADER_BYTES / 3) * 4);
  const chunk = body.slice(0, wanted - (wanted % 4));
  if (!chunk) return null;
  try {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function readPngSize(bytes: Uint8Array): IntrinsicImageSize | null {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((byte, index) => bytes[index] !== byte)) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  return positiveSize(readUint32(bytes, 16), readUint32(bytes, 20));
}

function readGifSize(bytes: Uint8Array): IntrinsicImageSize | null {
  if (bytes.length < 10) return null;
  const header = ascii(bytes, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return positiveSize(bytes[6]! | (bytes[7]! << 8), bytes[8]! | (bytes[9]! << 8));
}

function readJpegSize(bytes: Uint8Array): IntrinsicImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // 填充字节与无载荷标记（RSTn/SOI/TEM）后面不跟长度字段。
    if (marker === 0xff || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // 进入扫描数据后再没有帧头可读。
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return null;
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return positiveSize((bytes[offset + 7]! << 8) | bytes[offset + 8]!, (bytes[offset + 5]! << 8) | bytes[offset + 6]!);
    }
    offset += 2 + length;
  }
  return null;
}

/** 从 base64 data URL 的文件头解析光栅尺寸；非光栅或解析不出时返回 null。 */
export function decodeRasterImageSize(src: string | undefined): IntrinsicImageSize | null {
  if (!src) return null;
  const bytes = decodeDataUrlHeader(src);
  if (!bytes) return null;
  return readPngSize(bytes) ?? readJpegSize(bytes) ?? readGifSize(bytes);
}

/** 图片在给定框内的实际绘制尺寸（对应 SVG preserveAspectRatio 的 meet/slice/none）。 */
export function fittedDrawSize(
  intrinsic: IntrinsicImageSize,
  box: IntrinsicImageSize,
  fit: ImageFit,
): IntrinsicImageSize {
  if (fit === "stretch") return { width: box.width, height: box.height };
  const scaleX = box.width / intrinsic.width;
  const scaleY = box.height / intrinsic.height;
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  return { width: intrinsic.width * scale, height: intrinsic.height * scale };
}

/** 成品打印精度（dpi），取两个方向里更差的一侧。尺寸非法时返回 null。 */
export function effectivePrintDpi(intrinsic: IntrinsicImageSize, drawn: IntrinsicImageSize): number | null {
  if (!positiveSize(intrinsic.width, intrinsic.height) || !positiveSize(drawn.width, drawn.height)) return null;
  return Math.min(
    (intrinsic.width / drawn.width) * CSS_PX_PER_INCH,
    (intrinsic.height / drawn.height) * CSS_PX_PER_INCH,
  );
}

function formatDpi(dpi: number): string {
  return dpi >= 10 ? String(Math.round(dpi)) : String(Math.round(dpi * 10) / 10);
}

function addLowPrintResolution(
  issues: ResourceHealthIssue[],
  reference: ResourceReference,
  assets: readonly UserAsset[],
  placement: { box: IntrinsicImageSize; fit: ImageFit; recordedSize?: IntrinsicImageSize | null },
): void {
  const box = positiveSize(placement.box.width, placement.box.height);
  if (!box) return;
  const asset = findResource(reference, assets);
  // 素材缺失已由 addMissingResource 报错，这里不重复计一笔。
  if (!asset) return;
  const intrinsic = placement.recordedSize
    ?? readRecordedImageSize(asset)
    ?? decodeRasterImageSize(asset.src);
  if (!intrinsic) return;
  const drawn = fittedDrawSize(intrinsic, box, placement.fit);
  const dpi = effectivePrintDpi(intrinsic, drawn);
  if (dpi === null || dpi >= PRINT_DPI_TARGET - PRINT_DPI_TOLERANCE) return;
  const neededWidth = Math.ceil((drawn.width * PRINT_DPI_TARGET) / CSS_PX_PER_INCH);
  const neededHeight = Math.ceil((drawn.height * PRINT_DPI_TARGET) / CSS_PX_PER_INCH);
  issues.push({
    kind: "resource",
    target: reference.target,
    detail: `${reference.label}打印分辨率不足：原图 ${intrinsic.width}×${intrinsic.height}，`
      + `铺满 ${Math.round(drawn.width)}×${Math.round(drawn.height)} 画布像素后约 ${formatDpi(dpi)} dpi`
      + `（${PRINT_DPI_TARGET}dpi 需要 ${neededWidth}×${neededHeight}）`,
    severity: "warning",
    code: "low-print-resolution",
  });
}

function mapImageDrawBox(project: ProjectDocument): { box: IntrinsicImageSize; fit: ImageFit; recordedSize?: IntrinsicImageSize | null } | null {
  const source = project.map.renderSource;
  if (source?.kind !== "image") return null;
  const scale = Number.isFinite(project.map.scale) && project.map.scale > 0 ? project.map.scale : 1;
  if (source.alignment) {
    // alignment 描述的是地图局部像素，地图层整体再乘 settings.scale 才落到画布上。
    const placement = mapImageElementPlacement(source.alignment);
    return {
      box: { width: placement.width * scale, height: placement.height * scale },
      fit: "stretch",
      // alignment.width/height 是落位尺寸，原图尺寸只看 sourceWidth/sourceHeight。
      recordedSize: positiveSize(source.alignment.sourceWidth, source.alignment.sourceHeight),
    };
  }
  return {
    box: { width: project.map.width * scale, height: project.map.height * scale },
    fit: source.fit,
  };
}

function displayFrameFontReferences(frame: DisplayFrameDefinition | undefined): Array<{ target: string; fontId?: string; label: string }> {
  if (!frame) return [];
  return [
    { target: "display-frame:style", fontId: frame.style.fontId, label: "展示框" },
    ...frame.fixed.items.map((item) => ({ target: `display-frame:${item.id}`, fontId: item.fontId ?? item.style?.fontId, label: `展示框 ${item.id}` })),
    ...frame.flow.blocks.map((block) => ({ target: `display-frame:${block.id}`, fontId: block.fontId ?? block.style?.fontId, label: `展示框 ${block.id}` })),
  ];
}

export function listResourceHealthIssues(
  project: ProjectDocument,
  userAssets: readonly UserAsset[],
  userFonts: readonly UserFont[],
): ResourceHealthIssue[] {
  const issues: ResourceHealthIssue[] = [];
  const backgroundReference: ResourceReference = {
    target: "background",
    src: project.canvas.backgroundImageSrc,
    label: "背景素材",
  };
  addMissingResource(issues, backgroundReference, userAssets);
  if (project.canvas.backgroundImageSrc) {
    addLowPrintResolution(issues, backgroundReference, userAssets, {
      box: { width: project.canvas.width, height: project.canvas.height },
      fit: project.canvas.backgroundFit,
    });
  }

  const mapSource = project.map.renderSource;
  if (mapSource?.kind === "image") {
    const mapReference: ResourceReference = {
      target: "map",
      id: mapSource.assetId,
      src: mapSource.src,
      label: "地图图片",
    };
    addMissingResource(issues, mapReference, userAssets);
    const mapPlacement = mapImageDrawBox(project);
    if (mapPlacement) addLowPrintResolution(issues, mapReference, userAssets, mapPlacement);
  }

  for (const [province, style] of Object.entries(project.map.provinceStyles ?? {})) {
    const appearance = style?.appearance;
    if (!appearance || appearance.kind === "manual-color") continue;
    addMissingResource(issues, {
      target: `province:${province}`,
      id: appearance.assetId,
      src: appearance.src,
      label: `${province} 外观素材`,
    }, userAssets);
  }

  for (const element of project.assetElements) {
    const reference: ResourceReference = {
      target: `asset:${element.id}`,
      id: element.assetId,
      src: element.src,
      label: `素材实例 ${element.label}`,
    };
    addMissingResource(issues, reference, userAssets);
    // 画布素材统一按 xMidYMid meet 绘制（见 DecorationLayer/RegionalAssetLayer）。
    addLowPrintResolution(issues, reference, userAssets, {
      box: { width: element.width, height: element.height },
      fit: "contain",
    });
  }

  for (const text of project.textElements) {
    addMissingFont(issues, `text:${text.id}`, text.fontId, `文字 ${text.content || text.id}`, userFonts);
  }
  for (const [field, fontId] of Object.entries(project.cards.fieldFonts ?? {})) {
    addMissingFont(issues, `cards:${field}`, fontId, `卡片 ${field}`, userFonts);
  }
  addMissingFont(issues, "map-labels", project.map.provinceLabelFontId, "地图标签", userFonts);
  for (const [province, style] of Object.entries(project.map.provinceStyles ?? {})) {
    addMissingFont(issues, `map-label:${province}`, style?.labelFontId, `${province} 标签`, userFonts);
  }
  addMissingFont(issues, "guests:title", project.guests.titleFontId, "嘉宾标题", userFonts);
  addMissingFont(issues, "guests:people", project.guests.peopleFontId, "嘉宾名单", userFonts);
  for (const person of project.guests.people) {
    addMissingFont(issues, `guest:${person.id}`, person.fontId, `嘉宾 ${person.name}`, userFonts);
  }
  for (const reference of displayFrameFontReferences(project.cards.displayFrame)) {
    addMissingFont(issues, reference.target, reference.fontId, reference.label, userFonts);
  }

  return issues;
}
