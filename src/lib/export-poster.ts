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

function canvasToPngDataUrl(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
  transparentBackground = false,
): string {
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
  return canvas.toDataURL("image/png");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      reject(new Error("SVG 转 PNG 超时"));
    }, 4000);
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

export async function svgToPngDataUrl(
  svgMarkup: string,
  options: { width: number; height: number; transparentBackground?: boolean },
): Promise<string> {
  // Prefer data URL to avoid blob-loading quirks in some environments.
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const image = await loadImage(encoded);
  return canvasToPngDataUrl(options.width, options.height, (context) => {
    context.drawImage(image, 0, 0, options.width, options.height);
  }, options.transparentBackground === true);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
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
