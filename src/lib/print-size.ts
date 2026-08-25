/** Millimetres in one inch. Used to talk to print shops in cm, not only pixels. */
const MM_PER_INCH = 25.4;

export const DEFAULT_PRINT_DPI = 150;

export interface NamedPrintSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
}

/** Physical sizes a class committee would actually send to a print shop. */
export const NAMED_PRINT_SIZES: readonly NamedPrintSize[] = [
  { id: "a3-150", label: "A3 横版展板", widthMm: 420, heightMm: 297, dpi: 150 },
  { id: "a2-150", label: "A2 横版展板", widthMm: 594, heightMm: 420, dpi: 150 },
  { id: "board-90x60", label: "展板 90×60cm", widthMm: 900, heightMm: 600, dpi: 100 },
];

export function mmToPx(mm: number, dpi: number): number {
  if (!Number.isFinite(mm) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function pxToMm(px: number, dpi: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return (px / dpi) * MM_PER_INCH;
}

export function formatCentimeters(mm: number): string {
  if (!Number.isFinite(mm)) return "0";
  const cm = Math.round((mm / 10) * 10) / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1);
}

export function printSizeToPixels(size: NamedPrintSize): { width: number; height: number } {
  return {
    width: mmToPx(size.widthMm, size.dpi),
    height: mmToPx(size.heightMm, size.dpi),
  };
}

export function matchNamedPrintSize(widthPx: number, heightPx: number): NamedPrintSize | undefined {
  return NAMED_PRINT_SIZES.find((size) => {
    const pixels = printSizeToPixels(size);
    return pixels.width === widthPx && pixels.height === heightPx;
  });
}

/** Human-readable size for the canvas itself (1× pixels). */
export function describePhysicalSize(widthPx: number, heightPx: number, dpi = DEFAULT_PRINT_DPI): string {
  const named = matchNamedPrintSize(widthPx, heightPx);
  if (named) {
    return `${named.label} · ${formatCentimeters(named.widthMm)} × ${formatCentimeters(named.heightMm)} cm @ ${named.dpi}dpi`;
  }
  return `${formatCentimeters(pxToMm(widthPx, dpi))} × ${formatCentimeters(pxToMm(heightPx, dpi))} cm @ ${dpi}dpi`;
}

/**
 * Hint next to PNG export: exported pixels, spoken as print-shop centimetres.
 *
 * 画布已经是一块具名板子时，倍率买到的是精度而不是更大的板子：尺寸钉死在用户选的
 * 那块上，dpi 随倍率走。否则放大后的像素匹配不上任何具名尺寸，会掉进 150dpi 兜底，
 * 把 100dpi 的 90×60 展板说成「120 × 80 cm」——既不是原尺寸也不是整数倍。
 */
export function describeExportPrintHint(widthPx: number, heightPx: number, scale: number): string {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const named = matchNamedPrintSize(widthPx, heightPx);
  if (named) {
    const dpi = Math.round(named.dpi * safeScale);
    return `约合印刷：${named.label} · ${formatCentimeters(named.widthMm)} × ${formatCentimeters(named.heightMm)} cm @ ${dpi}dpi`;
  }
  return `约合印刷：${describePhysicalSize(widthPx * safeScale, heightPx * safeScale)}`;
}
