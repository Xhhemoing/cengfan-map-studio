/**
 * 印前体检（print preflight）：把「这份导出能不能直接送印」聚合成一份可定位的清单。
 *
 * 与相邻模块的分工：
 * - `layout-health` 已经负责出血区里的对象几何（object-in-bleed），这里不重复；
 * - `resource-health` 已经走过工程里全部字体引用，缺字体直接复用它的结果，
 *   避免两套遍历各自漂移；
 * - 本模块只补导出参数相关的三件事：缺字体的印刷后果、位图在成品尺寸下的
 *   有效分辨率、透明背景与出血的冲突。
 *
 * 单位沿用 `print-bleed` 的约定：画布坐标 = 96dpi CSS 像素，所以
 * `有效分辨率 = 原生像素 × 96 ÷ 画面占用的画布像素`。
 *
 * 不做 CMYK / ICC：浏览器只能导出 sRGB PNG，四色分色与输出意图必须留给印前
 * 软件按纸张油墨曲线处理。这里给出的每个数字都是画布几何推导出来的事实。
 */
import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";
import { mapImageElementPlacement } from "./map-alignment";
import { CSS_PX_PER_INCH, mmToPx, normalizePrintBleedMm } from "./print-bleed";
import type { ProjectDocument } from "./project-document";
import { listResourceHealthIssues } from "./resource-health";
import type { MapSettings, ProvinceAppearance } from "./scene-document";

/** 商业印刷惯例的分辨率下限。 */
export const PRINT_TARGET_DPI = 300;

/** 分辨率比较留 0.5% 余量，避免浮点噪声把刚好达标的素材判成不达标。 */
const DPI_MATCH_TOLERANCE = 0.995;

/** 只解码 data URL 的头部：PNG/GIF/WebP 几十字节即可，JPEG 的 SOF 可能排在 EXIF 之后。 */
const MAX_HEADER_BASE64_CHARS = 64 * 1024;

export type PrintPreflightIssueKind =
  | "missing-font"
  | "low-resolution-raster"
  | "transparent-bleed"
  | "export-resolution";

export interface PrintPreflightIssue {
  kind: PrintPreflightIssueKind;
  /** 与 resource-health 同一套定位串，可直接交给 `resolveDeliveryIssueLocation`。 */
  target: string;
  detail: string;
  severity: "warning" | "error";
  /** `low-resolution-raster` 实测到的有效分辨率（dpi）。 */
  dpi?: number;
}

export interface PrintPreflightAsset extends UserAsset {
  /** 上传时量到的原生像素尺寸；缺省时从 data URL 头部解码。 */
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface PrintPreflightOptions {
  assets: readonly PrintPreflightAsset[];
  fonts: readonly UserFont[];
  /** PNG 导出倍率，1× = 96dpi。默认 1。 */
  pngScale?: number;
  /** 导出设置里的「透明背景」。 */
  transparentExport?: boolean;
  /** 分辨率下限，默认 300dpi。 */
  targetDpi?: number;
}

export interface PrintPreflightResult {
  issues: PrintPreflightIssue[];
  /** PNG 导出的实际分辨率 = 96 × pngScale。 */
  exportDpi: number;
  /** 本次判定采用的下限 = min(targetDpi, exportDpi)：导出本身达不到的分辨率不苛求素材。 */
  requiredDpi: number;
  targetDpi: number;
  bleedMm: number;
  /** 量到原生尺寸并参与判定的位图数量。 */
  measuredRasters: number;
  /** 无法判定原生尺寸（远程链接 / 未知格式）的位图定位串，需人工确认。 */
  unmeasured: string[];
  ready: boolean;
}

export interface RasterPixelSize {
  width: number;
  height: number;
}

interface RasterPlacement {
  target: string;
  label: string;
  src: string;
  assetId?: string;
  /** 画面占用的画布像素（96dpi 坐标系）。 */
  width: number;
  height: number;
  /** contain 会整幅缩进框内，最软的方向由较宽松的一轴决定；其余按最差一轴算。 */
  fit: "contain" | "fill";
  /** 工程里已记录的原生像素尺寸（省份贴图会存）。 */
  natural?: RasterPixelSize;
}

function positiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function pixelSize(width: number, height: number): RasterPixelSize | null {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readUint(bytes: Uint8Array, offset: number, size: number, littleEndian = false): number {
  if (offset < 0 || offset + size > bytes.length) return 0;
  let value = 0;
  for (let index = 0; index < size; index += 1) {
    value += bytes[offset + (littleEndian ? index : size - 1 - index)]! * 256 ** index;
  }
  return value;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length), (byte) => String.fromCharCode(byte)).join("");
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** SOF0..SOF15 去掉 DHT(C4) / JPG(C8) / DAC(CC) 这三个非帧头标记。 */
const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readPngSize(bytes: Uint8Array): RasterPixelSize | null {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
  return pixelSize(readUint(bytes, 16, 4), readUint(bytes, 20, 4));
}

function readGifSize(bytes: Uint8Array): RasterPixelSize | null {
  if (ascii(bytes, 0, 3) !== "GIF") return null;
  return pixelSize(readUint(bytes, 6, 2, true), readUint(bytes, 8, 2, true));
}

function readJpegSize(bytes: Uint8Array): RasterPixelSize | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // 0xff 填充字节可以连续出现，逐个跳过再看下一个标记。
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (JPEG_FRAME_MARKERS.has(marker)) {
      return pixelSize(readUint(bytes, offset + 7, 2), readUint(bytes, offset + 5, 2));
    }
    const length = readUint(bytes, offset + 2, 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function readWebpSize(bytes: Uint8Array): RasterPixelSize | null {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") return pixelSize(1 + readUint(bytes, 24, 3, true), 1 + readUint(bytes, 27, 3, true));
  if (chunk === "VP8 ") return pixelSize(readUint(bytes, 26, 2, true) & 0x3fff, readUint(bytes, 28, 2, true) & 0x3fff);
  if (chunk === "VP8L") {
    const header = readUint(bytes, 21, 4, true);
    return pixelSize(1 + (header & 0x3fff), 1 + ((header >>> 14) & 0x3fff));
  }
  return null;
}

function decodeDataUrlHeader(src: string): Uint8Array | null {
  const match = /^data:[^,]*;base64,([\s\S]*)$/i.exec(src.trim());
  if (!match) return null;
  const payload = match[1]!.replace(/\s+/g, "").slice(0, MAX_HEADER_BASE64_CHARS);
  // base64 四字符一组独立解码，按组截断后 atob 仍然可读。
  const aligned = payload.slice(0, payload.length - (payload.length % 4));
  if (!aligned) return null;
  try {
    const binary = atob(aligned);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/** 从 data URL 头部读出位图原生像素尺寸。远程链接与未知格式返回 null（交给人工确认）。 */
export function decodeRasterSize(src: string): RasterPixelSize | null {
  const bytes = decodeDataUrlHeader(src);
  if (!bytes || bytes.length < 16) return null;
  return readPngSize(bytes) ?? readJpegSize(bytes) ?? readGifSize(bytes) ?? readWebpSize(bytes);
}

/** 矢量素材按输出分辨率重新光栅化，永远不欠分辨率。 */
export function isVectorSource(src: string): boolean {
  const normalized = src.trim().toLowerCase();
  return normalized.startsWith("data:image/svg+xml") || /\.svg(?:[?#]|$)/.test(normalized);
}

function provinceTextureBox(appearance: ProvinceAppearance, map: MapSettings): RasterPixelSize | null {
  if (appearance.kind === "manual-color") return null;
  if (appearance.sizingMode === "custom") {
    return pixelSize(Number(appearance.customWidth), Number(appearance.customHeight));
  }
  const uniform = map.provinceTextureUniformSize;
  if (uniform?.enabled) return pixelSize(uniform.width, uniform.height);
  // 其余情况贴图跟随省界包围盒，几何要到渲染期才知道，这里不猜。
  return null;
}

function collectRasterPlacements(project: ProjectDocument): RasterPlacement[] {
  const placements: RasterPlacement[] = [];
  const bleedPx = mmToPx(normalizePrintBleedMm(project.canvas.printBleedMm));
  const mapScale = positiveNumber(project.map.scale, 1);

  if (project.canvas.backgroundImageSrc) {
    placements.push({
      target: "background",
      label: "背景图",
      src: project.canvas.backgroundImageSrc,
      // 导出时背景要铺满到出血框，实际印刷面积比成品框大一圈。
      width: project.canvas.width + bleedPx * 2,
      height: project.canvas.height + bleedPx * 2,
      fit: project.canvas.backgroundFit === "contain" ? "contain" : "fill",
    });
  }

  const mapSource = project.map.renderSource;
  if (mapSource?.kind === "image" && mapSource.src) {
    const box = mapSource.alignment
      ? mapImageElementPlacement(mapSource.alignment)
      : { width: project.map.width, height: project.map.height };
    placements.push({
      target: "map",
      label: "地图图片",
      src: mapSource.src,
      assetId: mapSource.assetId,
      width: box.width * mapScale,
      height: box.height * mapScale,
      fit: !mapSource.alignment && mapSource.fit === "contain" ? "contain" : "fill",
    });
  }

  for (const [province, style] of Object.entries(project.map.provinceStyles ?? {})) {
    const appearance = style?.appearance;
    if (!appearance || appearance.kind === "manual-color" || !appearance.src) continue;
    const box = provinceTextureBox(appearance, project.map);
    if (!box) continue;
    placements.push({
      target: `province:${province}`,
      label: `${province} 外观素材`,
      src: appearance.src,
      assetId: appearance.assetId,
      width: box.width * mapScale,
      height: box.height * mapScale,
      fit: appearance.sizingMode === "province" ? "fill" : "contain",
      natural: pixelSize(Number(appearance.naturalWidth), Number(appearance.naturalHeight)) ?? undefined,
    });
  }

  for (const element of project.assetElements) {
    if (element.visibility === false || !element.src) continue;
    placements.push({
      target: `asset:${element.id}`,
      label: `素材实例 ${element.label}`,
      src: element.src,
      assetId: element.assetId,
      // 素材实例画在画布坐标系里（RegionalAssetLayer 不跟随地图缩放）。
      width: element.width,
      height: element.height,
      // 省份贴图实例按 slice 铺满省界，其余按 meet 缩进框内。
      fit: element.kind === "province-texture" ? "fill" : "contain",
    });
  }

  return placements.filter((placement) => placement.width > 0 && placement.height > 0);
}

function resolveNaturalSize(
  placement: RasterPlacement,
  assets: readonly PrintPreflightAsset[],
): RasterPixelSize | null {
  if (placement.natural) return placement.natural;
  const asset = assets.find((candidate) => (
    (placement.assetId && candidate.id === placement.assetId) || candidate.src === placement.src
  ));
  const recorded = asset ? pixelSize(Number(asset.naturalWidth), Number(asset.naturalHeight)) : null;
  return recorded ?? decodeRasterSize(placement.src);
}

function effectiveDpi(natural: RasterPixelSize, placement: RasterPlacement): number {
  const horizontal = (natural.width * CSS_PX_PER_INCH) / placement.width;
  const vertical = (natural.height * CSS_PX_PER_INCH) / placement.height;
  return placement.fit === "contain" ? Math.max(horizontal, vertical) : Math.min(horizontal, vertical);
}

function roundDpi(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 印前体检主入口。纯函数：同样的工程与导出参数永远给出同样的清单，
 * 不读 DOM、不测量图片，量不到原生尺寸的位图会进 `unmeasured` 而不是被静默放过。
 */
export function runPrintPreflight(
  project: ProjectDocument,
  options: PrintPreflightOptions,
): PrintPreflightResult {
  const pngScale = positiveNumber(options.pngScale, 1);
  const targetDpi = positiveNumber(options.targetDpi, PRINT_TARGET_DPI);
  const exportDpi = CSS_PX_PER_INCH * pngScale;
  const requiredDpi = Math.min(targetDpi, exportDpi);
  const bleedMm = normalizePrintBleedMm(project.canvas.printBleedMm);
  const issues: PrintPreflightIssue[] = [];

  // 字体缺失是客观损坏（导出会静默换成系统字形），沿用 resource-health 的 error 级别。
  for (const issue of listResourceHealthIssues(project, options.assets, options.fonts)) {
    if (issue.kind !== "font") continue;
    issues.push({
      kind: "missing-font",
      target: issue.target,
      severity: "error",
      detail: `${issue.detail}，导出会回退到系统字体，印刷字形与预览不一致`,
    });
  }

  const unmeasured: string[] = [];
  let measuredRasters = 0;
  for (const placement of collectRasterPlacements(project)) {
    if (isVectorSource(placement.src)) continue;
    const natural = resolveNaturalSize(placement, options.assets);
    if (!natural) {
      unmeasured.push(placement.target);
      continue;
    }
    measuredRasters += 1;
    const dpi = effectiveDpi(natural, placement);
    if (dpi >= requiredDpi * DPI_MATCH_TOLERANCE) continue;
    // 分辨率不足是判断题（照片略软仍可接受），所以只报警告，不拦交付。
    issues.push({
      kind: "low-resolution-raster",
      target: placement.target,
      severity: "warning",
      dpi: roundDpi(dpi),
      detail: `${placement.label} 有效分辨率约 ${roundDpi(dpi)}dpi（原图 ${natural.width}×${natural.height}px，画面占 ${Math.round(placement.width)}×${Math.round(placement.height)}），低于 ${roundDpi(requiredDpi)}dpi`,
    });
  }

  if (bleedMm > 0 && options.transparentExport === true) {
    issues.push({
      kind: "transparent-bleed",
      target: "background",
      severity: "warning",
      detail: `已开启透明背景，${bleedMm}mm 出血区没有可裁切的底色，裁切偏移会露白；送印请关闭透明背景或让背景铺满出血`,
    });
  }

  if (bleedMm > 0 && exportDpi < targetDpi * DPI_MATCH_TOLERANCE) {
    issues.push({
      kind: "export-resolution",
      target: "export",
      severity: "warning",
      detail: `PNG ${pngScale}× 导出约 ${roundDpi(exportDpi)}dpi，低于 ${roundDpi(targetDpi)}dpi 印刷线；送印建议导出 SVG，由印前软件按纸张尺寸放大`,
    });
  }

  return {
    issues,
    exportDpi,
    requiredDpi,
    targetDpi,
    bleedMm,
    measuredRasters,
    unmeasured,
    ready: issues.length === 0,
  };
}
