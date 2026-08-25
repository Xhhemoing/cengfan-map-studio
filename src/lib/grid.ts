import { NAMED_PRINT_SIZES, printSizeToPixels, type NamedPrintSize } from "./print-size";

export const DEFAULT_GRID_SIZE = 20;

function pixelsForPrintId(id: NamedPrintSize["id"]): { width: number; height: number } {
  const size = NAMED_PRINT_SIZES.find((item) => item.id === id);
  if (!size) throw new Error(`未找到印刷尺寸 ${id}`);
  return printSizeToPixels(size);
}

const a3Print = pixelsForPrintId("a3-150");
const a2Print = pixelsForPrintId("a2-150");
const boardPrint = pixelsForPrintId("board-90x60");

export const CANVAS_SIZE_PRESETS = [
  { id: "square-1080", label: "1080 方图", width: 1080, height: 1080 },
  { id: "poster-1500", label: "1500×1000 海报", width: 1500, height: 1000 },
  { id: "wide-1920", label: "1920×1080 横版", width: 1920, height: 1080 },
  { id: "story-1080", label: "1080×1920 竖版", width: 1080, height: 1920 },
  { id: "a3-150", label: "A3 展板（约 150dpi）", width: a3Print.width, height: a3Print.height },
  { id: "a2-150", label: "A2 展板（约 150dpi）", width: a2Print.width, height: a2Print.height },
  { id: "board-90x60", label: "展板 90×60cm（约 100dpi）", width: boardPrint.width, height: boardPrint.height },
] as const;

export type CanvasSizePresetId = (typeof CANVAS_SIZE_PRESETS)[number]["id"];

export function clampGridSize(value: unknown, fallback = DEFAULT_GRID_SIZE): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(200, Math.max(4, Math.round(numeric)));
}

export function snapToGrid(value: number, gridSize: number): number {
  const size = clampGridSize(gridSize);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / size) * size;
}

export function snapPoint(
  point: { x: number; y: number },
  gridSize: number,
): { x: number; y: number } {
  return {
    x: snapToGrid(point.x, gridSize),
    y: snapToGrid(point.y, gridSize),
  };
}

export function fitZoomPercent(options: {
  stageWidth: number;
  stageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  padding?: number;
  min?: number;
  max?: number;
}): number {
  const padding = options.padding ?? 56;
  const min = options.min ?? 25;
  const max = options.max ?? 300;
  const availableWidth = Math.max(1, options.stageWidth - padding);
  const availableHeight = Math.max(1, options.stageHeight - padding);
  const widthScale = availableWidth / Math.max(1, options.canvasWidth);
  const heightScale = availableHeight / Math.max(1, options.canvasHeight);
  const percent = Math.floor(Math.min(widthScale, heightScale) * 100);
  return Math.min(max, Math.max(min, percent));
}
