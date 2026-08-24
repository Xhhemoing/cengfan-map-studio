/**
 * 海报导出管线：序列化 SVG → 栅格化 → 下载。
 *
 * 改造前整条链路把海报物化成两份长字符串：`encodeURIComponent(svg)`（真实海报
 * 里大量 `<`/`"`/空格/中文都会被转义，实测约 2.6×）加上 `canvas.toDataURL()` 的
 * base64（1.37×）。8MB 海报因此要在 JS 堆里同时压上二十多 MB 临时字符串，大图
 * 导出既慢又容易被浏览器判失败。现在 SVG 源走 Blob + object URL、PNG 结果走
 * `canvas.toBlob`，两段都留在浏览器内部；两条 data URL 路径仅作为降级保留。
 *
 * 另外两处硬伤一并修掉：
 * - 固定 4s 加载超时改成按体积/像素放大（`computeImageLoadTimeout`），大海报不再
 *   被误判超时，真正卡死的加载仍会在 60s 上限被拒绝。
 * - 失败原因用 `PosterExportError.code` 区分 timeout / decode / encode / taint /
 *   canvas，UI 与测试都能分辨「等太久」和「解不出来」。
 *
 * 回滚方案（行为可完全退回改造前）：
 * 1. `svgToPngBlob` 换回返回 `canvas.toDataURL("image/png")` 字符串，调用方
 *    `usePosterExport.exportPng` 改回 `downloadDataUrl(dataUrl, filename)`；
 * 2. `loadPosterImage` 只保留 `createDataUrlSvgSource` 分支；
 * 3. `computeImageLoadTimeout` 直接 `return 4000`。
 * 调用方只有 `usePosterExport`，导出文件名与产物格式不变，无数据迁移。
 */

export function serializePosterSvg(svg: SVGSVGElement, options: { transparentBackground?: boolean; blockFontDisplay?: boolean } = {}): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(
    "[data-selection-overlay], [data-map-selection-overlay], [data-asset-selection], [data-editor-grid]",
  ).forEach((node) => node.remove());
  if (options.transparentBackground) {
    clone.querySelectorAll("[data-canvas-background], [data-background-image]").forEach((node) => node.remove());
  }
  if (options.blockFontDisplay) {
    clone.querySelectorAll("[data-font-faces] style, style[data-font-faces]").forEach((node) => {
      node.textContent = node.textContent?.replace(/font-display\s*:\s*swap\s*;?/g, "font-display:block;") ?? "";
    });
  }
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
  return new XMLSerializer().serializeToString(clone);
}

/** 导出失败的分类；UI 与重试逻辑靠它区分「等太久」「解码失败」「编码失败」「画布被污染」。 */
export type PosterExportFailureCode = "timeout" | "decode" | "encode" | "taint" | "canvas";

export class PosterExportError extends Error {
  readonly code: PosterExportFailureCode;

  constructor(code: PosterExportFailureCode, message: string) {
    super(message);
    this.name = "PosterExportError";
    this.code = code;
  }
}

/** 单次导出在管线中额外物化的字节数，供测试与性能回归断言。 */
export interface PosterExportMetrics {
  /** SVG 源最终采用的通道；`data-url` 表示 blob 通道不可用或加载失败后降级。 */
  sourceStrategy: "blob" | "data-url";
  /** SVG 源物化的字节（含降级前失败的那次尝试）。 */
  sourceBytes: number;
  /** PNG 结果采用的通道。 */
  outputStrategy: "blob" | "data-url";
  /** PNG 结果物化的字节。 */
  outputBytes: number;
  /** 两段之和，不含调用方自己持有的 SVG 源字符串。 */
  totalBytes: number;
}

const SVG_MIME = "image/svg+xml;charset=utf-8";

/** 小图的超时下限：与改造前的固定 4s 一致，保证小图不会更晚才失败。 */
const IMAGE_LOAD_TIMEOUT_BASE_MS = 4000;
/** 每 MB SVG 源额外给的预算（解析 + 字体/图片内联数据的解码）。 */
const IMAGE_LOAD_TIMEOUT_PER_MEGABYTE_MS = 2000;
/** 每百万输出像素额外给的预算（栅格化本身）。 */
const IMAGE_LOAD_TIMEOUT_PER_MEGAPIXEL_MS = 1000;
/** 上限：浏览器真卡死时不能无限等。 */
const IMAGE_LOAD_TIMEOUT_CEILING_MS = 60_000;

function positiveOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * SVG→PNG 的加载期限：`4s + 2s/MB + 1s/百万像素`，60s 封顶。
 * NaN/负数/Infinity 一律退回下限或上限，不会产出 NaN 期限（`setTimeout(NaN)` 会立刻触发）。
 */
export function computeImageLoadTimeout(input: { byteLength?: number; pixels?: number }): number {
  const megabytes = positiveOrZero(input.byteLength) / 1_000_000;
  const megapixels = positiveOrZero(input.pixels) / 1_000_000;
  const budget = IMAGE_LOAD_TIMEOUT_BASE_MS
    + megabytes * IMAGE_LOAD_TIMEOUT_PER_MEGABYTE_MS
    + megapixels * IMAGE_LOAD_TIMEOUT_PER_MEGAPIXEL_MS;
  if (!Number.isFinite(budget)) return IMAGE_LOAD_TIMEOUT_CEILING_MS;
  return Math.min(IMAGE_LOAD_TIMEOUT_CEILING_MS, Math.max(IMAGE_LOAD_TIMEOUT_BASE_MS, Math.round(budget)));
}

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(milliseconds % 1000 === 0 ? 0 : 1);
}

interface SvgImageSource {
  url: string;
  bytes: number;
  strategy: "blob" | "data-url";
  /** 幂等：重复调用只会 revoke 一次，data URL 通道下是空操作。 */
  release: () => void;
}

function createBlobSvgSource(markup: string): SvgImageSource | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const blob = new Blob([markup], { type: SVG_MIME });
  let url: string;
  try {
    url = URL.createObjectURL(blob);
  } catch {
    return null;
  }
  let released = false;
  return {
    url,
    bytes: blob.size,
    strategy: "blob",
    release: () => {
      if (released) return;
      released = true;
      URL.revokeObjectURL(url);
    },
  };
}

function createDataUrlSvgSource(markup: string): SvgImageSource {
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return { url: encoded, bytes: encoded.length, strategy: "data-url", release: () => {} };
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (): void => {
      settled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      reject(new PosterExportError(
        "timeout",
        `SVG 转 PNG 超时（等待 ${formatSeconds(timeoutMs)} 秒仍未完成，可降低导出倍率或减少大图素材后重试）`,
      ));
    }, timeoutMs);
    image.onload = () => {
      if (settled) return;
      finish();
      resolve(image);
    };
    image.onerror = () => {
      if (settled) return;
      finish();
      reject(new PosterExportError(
        "decode",
        "SVG 转 PNG 失败（浏览器无法解码海报内容，通常是素材图片损坏或引用了跨域地址）",
      ));
    };
    image.src = url;
  });
}

/**
 * 优先用 object URL 加载海报源；只有 blob 通道不可用或解码失败（严格 CSP、
 * 不支持 blob 图片的 WebView）才退回旧的 data URL 通道。超时不降级——那是
 * 「浏览器扛不住」而不是「通道不通」，再试一次只会让用户多等一倍。
 */
async function loadPosterImage(
  markup: string,
  pixels: number,
  metrics: PosterExportMetrics,
): Promise<HTMLImageElement> {
  const blobSource = createBlobSvgSource(markup);
  if (blobSource) {
    metrics.sourceStrategy = "blob";
    metrics.sourceBytes += blobSource.bytes;
    try {
      return await loadImage(blobSource.url, computeImageLoadTimeout({ byteLength: blobSource.bytes, pixels }));
    } catch (error) {
      if (error instanceof PosterExportError && error.code === "timeout") throw error;
    } finally {
      // 只在 load/error/超时落定之后回收，且幂等：提前 revoke 会让加载中的图片直接失败。
      blobSource.release();
    }
  }
  const dataSource = createDataUrlSvgSource(markup);
  metrics.sourceStrategy = "data-url";
  metrics.sourceBytes += dataSource.bytes;
  return await loadImage(dataSource.url, computeImageLoadTimeout({ byteLength: dataSource.bytes, pixels }));
}

function isTaintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "SecurityError" || /tainted|insecure|cross-origin/i.test(error.message);
}

function toEncodeError(error: unknown): PosterExportError {
  if (error instanceof PosterExportError) return error;
  if (isTaintError(error)) {
    return new PosterExportError(
      "taint",
      "PNG 导出被浏览器安全策略拦截：画布包含跨域素材（请改用本地上传的图片，或先用素材面板抠图后再导出）",
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new PosterExportError("encode", `PNG 编码失败：${detail}`);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(",");
  const header = separator >= 0 ? dataUrl.slice(0, separator) : dataUrl;
  const payload = separator >= 0 ? dataUrl.slice(separator + 1) : "";
  const mime = /^data:([^;,]+)/.exec(header)?.[1] ?? "image/png";
  if (!header.includes(";base64")) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

async function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  metrics: PosterExportMetrics,
): Promise<Blob> {
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob((result) => resolve(result), "image/png");
      } catch (error) {
        reject(toEncodeError(error));
      }
    });
    if (blob) {
      metrics.outputStrategy = "blob";
      metrics.outputBytes = blob.size;
      return blob;
    }
    // toBlob 交回 null（编码器拒绝或超出后端上限）时不能直接判失败，旧的
    // toDataURL 通道在部分环境仍能出图。
  }
  if (typeof canvas.toDataURL !== "function") {
    throw new PosterExportError("encode", "PNG 编码失败：当前浏览器不支持画布导出");
  }
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch (error) {
    throw toEncodeError(error);
  }
  metrics.outputStrategy = "data-url";
  metrics.outputBytes = dataUrl.length;
  return dataUrlToBlob(dataUrl);
}

export interface SvgToPngOptions {
  width: number;
  height: number;
  transparentBackground?: boolean;
  /** 导出成功后回调本次物化字节，供性能测试断言。 */
  onMetrics?: (metrics: PosterExportMetrics) => void;
}

export async function svgToPngBlob(svgMarkup: string, options: SvgToPngOptions): Promise<Blob> {
  const metrics: PosterExportMetrics = {
    sourceStrategy: "data-url",
    sourceBytes: 0,
    outputStrategy: "data-url",
    outputBytes: 0,
    totalBytes: 0,
  };
  const image = await loadPosterImage(svgMarkup, options.width * options.height, metrics);
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new PosterExportError("canvas", "Canvas 不可用");
  }
  if (options.transparentBackground !== true) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, options.width, options.height);
  }
  try {
    context.drawImage(image, 0, 0, options.width, options.height);
  } catch (error) {
    throw toEncodeError(error);
  }
  const blob = await canvasToPngBlob(canvas, metrics);
  metrics.totalBytes = metrics.sourceBytes + metrics.outputBytes;
  options.onMetrics?.(metrics);
  return blob;
}

/** 点击后延迟回收 blob URL：同一个任务内 revoke 会让部分浏览器取消尚未开始的下载。 */
const OBJECT_URL_RELEASE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  // 锚点刻意不入 DOM：游离锚点的 click() 同样能触发下载，入 DOM 只会在导出瞬间
  // 往页面里插节点、并让锚点在异常路径上残留。
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_RELEASE_DELAY_MS);
}

export function downloadText(content: string, filename: string, mime: string): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}
