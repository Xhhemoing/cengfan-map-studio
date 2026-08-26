/**
 * 印刷出血（print bleed）几何。
 *
 * 单位约定：场景画布坐标 = SVG 用户单位 = 96dpi CSS 像素，所以毫米一律按
 * 96dpi 换算（1mm = 96/25.4 px）。需要 300dpi 成品时用 PNG 导出的放大倍数
 * （300/96 = 3.125）整体缩放，出血几何本身不随 dpi 改变。
 *
 * 三层框（沿用印前术语）：
 * - trim：成品裁切框，即原画布；
 * - bleed：出血框，画面必须铺满到这里，裁切误差才不会露白；
 * - media：媒体框，= 导出 viewBox，出血框外再留出裁切标记的位置。
 *
 * 不做 ICC / CMYK：浏览器 canvas 只能输出 sRGB PNG，既无法嵌入输出意图
 * （output intent），也无法做四色分色；印厂需要的 CMYK 转换必须在印前软件
 * （Acrobat / Illustrator / Scribus）里按纸张与油墨曲线完成。这里只负责把
 * 出血尺寸和裁切标记做对，让印前环节有正确的几何可用。
 *
 * 生产路径尚未接线，仅测试引用。
 */

export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_INCH = 96;
export const CSS_PX_PER_MM = CSS_PX_PER_INCH / MM_PER_INCH;
export const PT_PER_INCH = 72;

/** 常见印厂出血为 3mm，留出更大的上限以兼容大幅面拼版。 */
export const MAX_PRINT_BLEED_MM = 20;
export const DEFAULT_PRINT_BLEED_MM = 0;
export const DEFAULT_CROP_MARK_LENGTH_MM = 3;
export const DEFAULT_CROP_MARK_STROKE_PT = 0.5;
export const DEFAULT_CROP_MARK_COLOR = "#000000";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintBleedOptions {
  /** 出血尺寸（毫米）。0 或缺省表示不做出血。 */
  printBleedMm?: number;
  /** 是否绘制裁切标记，默认 true；出血为 0 时永远不绘制。 */
  cropMarks?: boolean;
  /** 单条裁切标记的长度（毫米），默认 3mm。 */
  cropMarkLengthMm?: number;
  /** 裁切标记线宽（磅），默认 0.5pt。 */
  cropMarkStrokePt?: number;
  /** 裁切标记颜色，默认纯黑。 */
  cropMarkColor?: string;
}

export interface PrintBleedGeometry {
  bleedMm: number;
  bleedPx: number;
  trim: Box;
  bleed: Box;
  media: Box;
  cropMarks: boolean;
  cropMarkLengthPx: number;
  cropMarkStrokePx: number;
  cropMarkColor: string;
}

export interface CropMarkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** SVG 属性只保留 4 位小数，避免浮点噪声让导出结果不可比对。 */
function roundPx(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function mmToPx(mm: number): number {
  return roundPx(mm * CSS_PX_PER_MM);
}

export function pxToMm(px: number): number {
  return roundPx(px / CSS_PX_PER_MM);
}

export function ptToPx(pt: number): number {
  return roundPx((pt * CSS_PX_PER_INCH) / PT_PER_INCH);
}

/** 归一化出血毫米数：非法值与负数归零，超过上限截断，保留两位小数。 */
export function normalizePrintBleedMm(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PRINT_BLEED_MM;
  return Math.min(MAX_PRINT_BLEED_MM, Math.round(numeric * 100) / 100);
}

function expandBox(box: Box, distance: number): Box {
  return {
    x: roundPx(box.x - distance),
    y: roundPx(box.y - distance),
    width: roundPx(box.width + distance * 2),
    height: roundPx(box.height + distance * 2),
  };
}

export function resolvePrintBleedGeometry(trim: Box, options: PrintBleedOptions = {}): PrintBleedGeometry {
  const bleedMm = normalizePrintBleedMm(options.printBleedMm);
  const bleedPx = mmToPx(bleedMm);
  const cropMarks = bleedMm > 0 && options.cropMarks !== false;
  const cropMarkLengthPx = cropMarks
    ? mmToPx(Math.max(0, Number(options.cropMarkLengthMm ?? DEFAULT_CROP_MARK_LENGTH_MM) || 0))
    : 0;
  const bleed = expandBox(trim, bleedPx);
  return {
    bleedMm,
    bleedPx,
    trim: { ...trim },
    bleed,
    media: expandBox(bleed, cropMarkLengthPx),
    cropMarks,
    cropMarkLengthPx,
    cropMarkStrokePx: ptToPx(Math.max(0, Number(options.cropMarkStrokePt ?? DEFAULT_CROP_MARK_STROKE_PT) || 0)),
    cropMarkColor: options.cropMarkColor || DEFAULT_CROP_MARK_COLOR,
  };
}

/**
 * 八条裁切标记：每个角一横一竖，从出血框边缘起向外延伸，
 * 延长线正好指向成品框的边，所以标记本身永不进入画面。
 */
export function cropMarkSegments(geometry: PrintBleedGeometry): CropMarkSegment[] {
  if (!geometry.cropMarks || geometry.cropMarkLengthPx <= 0) return [];
  const { trim, bleedPx, cropMarkLengthPx } = geometry;
  const left = trim.x;
  const right = roundPx(trim.x + trim.width);
  const top = trim.y;
  const bottom = roundPx(trim.y + trim.height);
  const outerLeft = roundPx(left - bleedPx);
  const outerRight = roundPx(right + bleedPx);
  const outerTop = roundPx(top - bleedPx);
  const outerBottom = roundPx(bottom + bleedPx);
  const markLeft = roundPx(outerLeft - cropMarkLengthPx);
  const markRight = roundPx(outerRight + cropMarkLengthPx);
  const markTop = roundPx(outerTop - cropMarkLengthPx);
  const markBottom = roundPx(outerBottom + cropMarkLengthPx);
  return [
    { x1: markLeft, y1: top, x2: outerLeft, y2: top },
    { x1: markLeft, y1: bottom, x2: outerLeft, y2: bottom },
    { x1: outerRight, y1: top, x2: markRight, y2: top },
    { x1: outerRight, y1: bottom, x2: markRight, y2: bottom },
    { x1: left, y1: markTop, x2: left, y2: outerTop },
    { x1: right, y1: markTop, x2: right, y2: outerTop },
    { x1: left, y1: outerBottom, x2: left, y2: markBottom },
    { x1: right, y1: outerBottom, x2: right, y2: markBottom },
  ];
}

export function cropMarkPathData(geometry: PrintBleedGeometry): string {
  return cropMarkSegments(geometry)
    .map((segment) => `M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`)
    .join(" ");
}

export const CROP_MARK_GROUP_ATTRIBUTE = "data-print-crop-marks";

/** 解析成品框：优先 viewBox，其次 width/height 属性。两者都缺失时返回 null。 */
export function parseTrimBox(svg: SVGSVGElement): Box | null {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isFinite(part)) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = parseLength(svg.getAttribute("width"));
  const height = parseLength(svg.getAttribute("height"));
  if (width && height && width.value > 0 && height.value > 0) {
    return { x: 0, y: 0, width: width.value, height: height.value };
  }
  return null;
}

function parseLength(value: string | null): { value: number; unit: string } | null {
  if (!value) return null;
  const match = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i.exec(value);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? { value: numeric, unit: match[2] ?? "" } : null;
}

function scaleLengthAttribute(svg: SVGSVGElement, attribute: "width" | "height", factor: number): void {
  const parsed = parseLength(svg.getAttribute(attribute));
  if (!parsed) return;
  svg.setAttribute(attribute, `${roundPx(parsed.value * factor)}${parsed.unit}`);
}

/**
 * 把画布底色 / 背景图铺满到出血框。没有这一步，扩出去的 viewBox 只是空白，
 * 裁切偏移时纸边会露白，出血就失去意义。
 */
function expandBackgroundToBleed(svg: SVGSVGElement, geometry: PrintBleedGeometry): void {
  svg.querySelectorAll("[data-canvas-background], [data-background-image]").forEach((node) => {
    node.setAttribute("x", String(geometry.bleed.x));
    node.setAttribute("y", String(geometry.bleed.y));
    node.setAttribute("width", String(geometry.bleed.width));
    node.setAttribute("height", String(geometry.bleed.height));
  });
}

function appendCropMarks(svg: SVGSVGElement, geometry: PrintBleedGeometry): void {
  const pathData = cropMarkPathData(geometry);
  if (!pathData) return;
  const namespace = "http://www.w3.org/2000/svg";
  const group = svg.ownerDocument.createElementNS(namespace, "g");
  group.setAttribute(CROP_MARK_GROUP_ATTRIBUTE, "true");
  group.setAttribute("fill", "none");
  group.setAttribute("stroke", geometry.cropMarkColor);
  group.setAttribute("stroke-width", String(geometry.cropMarkStrokePx));
  const path = svg.ownerDocument.createElementNS(namespace, "path");
  path.setAttribute("d", pathData);
  group.appendChild(path);
  svg.appendChild(group);
}

/**
 * 就地把出血几何应用到一份 SVG 副本上：扩展 viewBox 与 width/height、
 * 铺满背景、在成品框外追加裁切标记。出血为 0 时不做任何改动。
 */
export function applyPrintBleedToSvg(svg: SVGSVGElement, options: PrintBleedOptions = {}): PrintBleedGeometry | null {
  if (normalizePrintBleedMm(options.printBleedMm) <= 0) return null;
  const trim = parseTrimBox(svg);
  if (!trim) return null;
  const geometry = resolvePrintBleedGeometry(trim, options);
  scaleLengthAttribute(svg, "width", geometry.media.width / trim.width);
  scaleLengthAttribute(svg, "height", geometry.media.height / trim.height);
  svg.setAttribute("viewBox", `${geometry.media.x} ${geometry.media.y} ${geometry.media.width} ${geometry.media.height}`);
  expandBackgroundToBleed(svg, geometry);
  appendCropMarks(svg, geometry);
  return geometry;
}

/** 位图导出尺寸：出血 > 0 时按媒体框（含裁切标记）放大。 */
export function resolveBleedExportSize(
  trim: { width: number; height: number },
  options: PrintBleedOptions & { scale?: number } = {},
): { width: number; height: number } {
  const scale = Number.isFinite(options.scale) && (options.scale as number) > 0 ? (options.scale as number) : 1;
  const geometry = resolvePrintBleedGeometry({ x: 0, y: 0, width: trim.width, height: trim.height }, options);
  return {
    width: Math.max(1, Math.round(geometry.media.width * scale)),
    height: Math.max(1, Math.round(geometry.media.height * scale)),
  };
}
