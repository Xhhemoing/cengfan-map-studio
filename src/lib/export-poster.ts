/**
 * 海报导出工具。PNG 走 `canvas.toBlob` + `URL.createObjectURL`，不再把整张图
 * 变成 base64 字符串驻留内存（3× 大图时曾导致内存峰值过高、部分浏览器下载失败）。
 *
 * 回滚方案：把 `svgToPngBlob` 改回 `canvas.toDataURL("image/png")` 返回 string，
 * 恢复 `downloadDataUrl(dataUrl, filename)` 直接下载，并把 `loadImage` 的超时
 * 改回固定 4000ms（即删除 `computeImageLoadTimeout`）。调用方仅 `usePosterExport.exportPng`。
 *
 * 面积防护回滚方案：把 `MAX_SAFE_EXPORT_PIXELS` 调到 `Number.POSITIVE_INFINITY`，
 * `availablePngScales` 就会放行全部档位、`svgToPngBlob` 的前置校验也不再触发，
 * 行为退回「先栅格化再看浏览器脸色」。
 */
/**
 * 只在编辑器里存在的节点：选中框、网格、缩放手柄、省份贴图编辑器与省份命中层。
 * 它们要么完全透明（命中层、贴图编辑器的 hit rect），要么只是编辑态装饰，
 * 导出时必须整节点剔除——否则旧编辑器导出的 SVG/PNG 会烤进虚线框和手柄。
 * 可见内容都在别的节点上（贴图走 `data-province-texture`，省份填色走 `data-province-id`），
 * 所以这里删掉整棵子树不会丢画面。
 *
 * 回滚方案：把该数组改回原先的四项
 * `data-selection-overlay` / `data-map-selection-overlay` / `data-asset-selection` / `data-editor-grid`，
 * 导出行为即退回扩充前。
 */
const EDITOR_ONLY_SELECTORS = [
  "[data-selection-overlay]",
  "[data-map-selection-overlay]",
  "[data-asset-selection]",
  "[data-editor-grid]",
  "[data-resize-handles]",
  "[data-province-texture-selection]",
  "[data-province-texture-editor]",
  "[data-province-hit]",
].join(", ");

export function serializePosterSvg(svg: SVGSVGElement, options: { transparentBackground?: boolean; blockFontDisplay?: boolean } = {}): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(EDITOR_ONLY_SELECTORS).forEach((node) => node.remove());
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

/**
 * 单张 PNG 的安全像素面积上限。浏览器 canvas 后端各自有硬上限（Safari 约 16.7MP、
 * 移动端 Chrome 约 67MP、桌面 Chrome 约 268MP），超限时 `toBlob` 直接回 null 或
 * 产出全白图，只能事后报一句「PNG 编码失败」。取 64MP 这个保守值：画布最大
 * 6000 × 6000（36MP）的 1× 仍可导出，而 ×3 的 324MP 会被提前拦下。
 */
export const MAX_SAFE_EXPORT_PIXELS = 64_000_000;

/** 导出面板提供的倍率档位；第一档是保底档，任何画布下都不会被禁用。 */
export const PNG_EXPORT_SCALES: readonly number[] = [1, 2, 3];

/** 某个倍率下 PNG 的实际像素面积。负数尺寸按 0 处理，避免负负得正混过校验。 */
export function exportPixelCount(width: number, height: number, scale = 1): number {
  const safeScale = Math.max(0, scale);
  return Math.max(0, width) * safeScale * (Math.max(0, height) * safeScale);
}

/**
 * 该画布尺寸下真正能栅格化出来的倍率档位（升序）。
 * 最小档永远保留：宁可让保底倍率去撞浏览器上限，也不能让用户完全导不出 PNG。
 */
export function availablePngScales(
  width: number,
  height: number,
  scales: readonly number[] = PNG_EXPORT_SCALES,
): number[] {
  const candidates = [...new Set(scales)].filter((scale) => Number.isFinite(scale) && scale > 0).sort((a, b) => a - b);
  if (candidates.length === 0) return [1];
  const usable = candidates.filter((scale) => exportPixelCount(width, height, scale) <= MAX_SAFE_EXPORT_PIXELS);
  return usable.length > 0 ? usable : candidates.slice(0, 1);
}

function formatMegapixels(pixels: number): string {
  return `${(pixels / 1_000_000).toFixed(1)} 百万像素`;
}

/**
 * 面向用户的超限说明：超了多少、为什么会失败、改成什么能成功。
 * 传 `scale` 时按「画布尺寸 + 倍率」措辞，不传时按最终导出像素措辞。
 */
export function describePngScaleLimit(width: number, height: number, scale?: number): string {
  const subject = scale === undefined
    ? `导出尺寸 ${width} × ${height} px 需要`
    : `${width} × ${height} 画布按 ${scale}× 导出需要`;
  const fallback = availablePngScales(width, height).at(-1) ?? 1;
  const advice = scale === undefined ? "请降低导出倍率" : `请改用 ${fallback}× 导出`;
  return `${subject} ${formatMegapixels(exportPixelCount(width, height, scale ?? 1))}，`
    + `超过浏览器 ${formatMegapixels(MAX_SAFE_EXPORT_PIXELS)}的安全上限，继续导出只会得到空白图或「PNG 编码失败」。`
    + `${advice}，或先把画布尺寸调小后重试。`;
}

/** 小图的超时下限：与改造前的固定 4s 一致，保证小图不会更慢才失败。 */
const IMAGE_LOAD_TIMEOUT_FLOOR_MS = 4000;
/** 大图超时上限，避免浏览器卡死时无限等待。 */
const IMAGE_LOAD_TIMEOUT_CEILING_MS = 60_000;
/** 每百万像素分配的超时预算。 */
const IMAGE_LOAD_TIMEOUT_PER_MEGAPIXEL_MS = 4000;

/**
 * 按导出像素面积计算 SVG→PNG 的加载超时：
 * 1 百万像素以内维持 4s，面积越大给的时间越多，最多 60s。
 */
export function computeImageLoadTimeout(width: number, height: number): number {
  const area = Math.max(0, width) * Math.max(0, height);
  const scaled = Math.round((area / 1_000_000) * IMAGE_LOAD_TIMEOUT_PER_MEGAPIXEL_MS);
  return Math.min(IMAGE_LOAD_TIMEOUT_CEILING_MS, Math.max(IMAGE_LOAD_TIMEOUT_FLOOR_MS, scaled));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ""] = dataUrl.split(",");
  const mime = /data:([^;,]+)/.exec(header)?.[1] ?? "image/png";
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
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
  transparentBackground = false,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 不可用");
  }
  if (!transparentBackground) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  draw(context, canvas);
  if (typeof canvas.toBlob === "function") {
    // toBlob 让编码结果留在浏览器内部，避免整包 base64 字符串把内存峰值抬高约 1.37 倍。
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG 编码失败"));
      }, "image/png");
    });
  }
  // 回退：老环境没有 toBlob 时仍走 dataURL，再转成 Blob 保持调用方一致。
  return dataUrlToBlob(canvas.toDataURL("image/png"));
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      reject(new Error("SVG 转 PNG 超时"));
    }, timeoutMs);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("SVG 转 PNG 失败"));
    };
    image.src = url;
  });
}

export async function svgToPngBlob(
  svgMarkup: string,
  options: { width: number; height: number; transparentBackground?: boolean },
): Promise<Blob> {
  // 面积校验必须先于图片加载与 canvas 分配：超限时这两步只会白烧内存，
  // 最后还是拿到 null blob 或全白图。
  if (exportPixelCount(options.width, options.height) > MAX_SAFE_EXPORT_PIXELS) {
    throw new Error(describePngScaleLimit(options.width, options.height));
  }
  // 源 SVG 仍用 data URL：体积小，且能绕开部分环境对 blob 图片的加载限制。
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const image = await loadImage(encoded, computeImageLoadTimeout(options.width, options.height));
  return await canvasToPngBlob(options.width, options.height, (context) => {
    context.drawImage(image, 0, 0, options.width, options.height);
  }, options.transparentBackground === true);
}

/** 点击后延迟回收 blob URL：同一个任务内 revoke 会让部分浏览器取消尚未开始的下载。 */
const OBJECT_URL_RELEASE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_RELEASE_DELAY_MS);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function downloadText(content: string, filename: string, mime: string): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}
