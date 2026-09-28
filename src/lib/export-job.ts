import { buildExportFileName } from "./export-filename";
import { PosterExportError, serializePosterSvg } from "./export-poster";

// Product guardrails, not a promise that every browser can allocate this much.
// A2 at 300 ppi fits; larger jobs should use SVG or a lower raster scale.
export const MAX_EXPORT_PIXELS = 40_000_000;
export const MAX_EXPORT_EDGE = 16_384;

export function assertRasterSize(width: number, height: number): void {
  if (![width, height].every((value) => Number.isFinite(value) && value >= 1)
    || width > MAX_EXPORT_EDGE || height > MAX_EXPORT_EDGE || width * height > MAX_EXPORT_PIXELS) {
    throw new PosterExportError("budget", "PNG 尺寸超出导出预算（4000 万像素 / 单边 16384 px），请降低倍率或改用 SVG");
  }
}

/** Snapshot of the currently rendered frame, NOT the future RenderPlan barrier. */
export function capturePngExport(input: {
  svg: SVGSVGElement;
  width: number;
  height: number;
  scale: number;
  transparentBackground: boolean;
  projectName?: string | null;
}) {
  const width = Math.round(input.width * input.scale);
  const height = Math.round(input.height * input.scale);
  assertRasterSize(width, height);
  return Object.freeze({
    source: serializePosterSvg(input.svg, { transparentBackground: input.transparentBackground, blockFontDisplay: true }),
    fileName: buildExportFileName({ projectName: input.projectName, kind: "png", scale: input.scale }),
    width,
    height,
    transparentBackground: input.transparentBackground,
  });
}

/** Release UI state on a stuck font loader; late completion cannot settle twice. */
export async function waitForExportFonts(work: Promise<void>, timeoutMs = 15_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PosterExportError("timeout", "等待字体超时，请检查字体或更换字体后重试")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
