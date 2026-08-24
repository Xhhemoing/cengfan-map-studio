/**
 * 海报导出工具。PNG 走 `canvas.toBlob` + `URL.createObjectURL`，不再把整张图
 * 变成 base64 字符串驻留内存（3× 大图时曾导致内存峰值过高、部分浏览器下载失败）。
 *
 * 回滚方案：把 `svgToPngBlob` 改回 `canvas.toDataURL("image/png")` 返回 string，
 * 恢复 `downloadDataUrl(dataUrl, filename)` 直接下载，并把 `loadImage` 的超时
 * 改回固定 4000ms（即删除 `computeImageLoadTimeout`）。调用方仅 `usePosterExport.exportPng`。
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
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
