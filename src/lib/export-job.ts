import { buildExportFileName } from "./export-filename";
import { PosterExportError, serializePosterSvg } from "./export-poster";
import { fingerprintProject } from "./project-digest";
import type { ProjectDocument } from "./project-document";

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

export interface ManagedPosterState {
  sceneRevision: string;
  fontRevision: number;
  layoutPending: boolean;
  measurementStatus: "estimated" | "measured";
}

/** Returns null for old/synthetic SVG callers that have no scene contract attributes. */
export function readManagedPosterState(svg: SVGSVGElement): ManagedPosterState | null {
  const scene = svg.getAttribute("data-scene-revision");
  const font = svg.getAttribute("data-font-revision");
  const pending = svg.getAttribute("data-layout-pending");
  if (scene === null && font === null && pending === null) return null;
  const fontRevision = Number(font);
  if (!scene || !Number.isFinite(fontRevision) || (pending !== "true" && pending !== "false")) {
    throw new PosterExportError("stale", "海报状态不完整，请等待画布更新后重试");
  }
  return { sceneRevision: scene, fontRevision, layoutPending: pending === "true", measurementStatus: svg.getAttribute("data-measurement-status") === "measured" ? "measured" : "estimated" };
}

export function assertManagedPosterReady(svg: SVGSVGElement, project: ProjectDocument, fontRevision: number): ManagedPosterState | null {
  const state = readManagedPosterState(svg);
  if (!state) return null;
  if (state.layoutPending) throw new PosterExportError("stale", "海报排布仍在计算，请等待完成后重试");
  if (state.sceneRevision !== fingerprintProject(project)) throw new PosterExportError("stale", "海报预览已更新，请等待画布同步后重试");
  if (state.fontRevision !== fontRevision) throw new PosterExportError("stale", "字体测量已更新，请等待画布同步后重试");
  return state;
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
