/**
 * Shrinks uploaded images before they enter the project document.
 *
 * Upload entries keep images as data URLs inside the scene, and every scene is
 * copied again by the undo stack, the collaboration snapshot and the
 * localStorage draft. A single untouched camera photo therefore costs tens of
 * megabytes per project, so imports are re-encoded once at the entry point.
 */

export type ImageDownscaleKind = "decoration" | "background" | "map" | "texture" | "avatar";

/** Longest edge kept per usage. Avatars are drawn small, everything else is poster-sized. */
export const MAX_EDGE_BY_KIND: Record<ImageDownscaleKind, number> = {
  decoration: 2560,
  background: 2560,
  map: 2560,
  texture: 2560,
  avatar: 512,
};

/** Bitmaps below this size are cheap enough to keep byte-for-byte. */
export const PASSTHROUGH_BYTES = 300 * 1024;
/** SVG markup is never re-encoded, so an oversized file can only be rejected. */
export const SVG_MAX_BYTES = 2 * 1024 * 1024;

const TARGET_BYTES = 1024 * 1024;
const JPEG_QUALITIES = [0.82, 0.7, 0.6];
const WEBP_QUALITY = 0.9;
const ALPHA_SAMPLES = 40_000;
const OPAQUE_ALPHA = 250;

export interface ImageDownscaleOptions {
  kind?: ImageDownscaleKind;
  maxEdge?: number;
  passthroughBytes?: number;
  svgMaxBytes?: number;
}

export type ImageBudgetVerdict = "keep" | "resample" | "reject";

export interface ImageBudgetCheck {
  verdict: ImageBudgetVerdict;
  bytes: number;
  /** User-facing Chinese reason, present only for `reject`. */
  message?: string;
}

export class OversizedImageError extends Error {
  constructor(message: string, readonly bytes: number, readonly limit: number) {
    super(message);
    this.name = "OversizedImageError";
  }
}

interface ParsedDataUrl {
  mime: string;
  payload: string;
  base64: boolean;
  bytes: number;
}

interface Budget {
  maxEdge: number;
  passthroughBytes: number;
  svgMaxBytes: number;
}

function resolveBudget(options: ImageDownscaleOptions): Budget {
  const kind = options.kind ?? "decoration";
  return {
    maxEdge: Math.max(1, Math.round(options.maxEdge ?? MAX_EDGE_BY_KIND[kind] ?? MAX_EDGE_BY_KIND.decoration)),
    passthroughBytes: Math.max(0, options.passthroughBytes ?? PASSTHROUGH_BYTES),
    svgMaxBytes: Math.max(0, options.svgMaxBytes ?? SVG_MAX_BYTES),
  };
}

export function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function base64Bytes(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

function textBytes(payload: string): number {
  try {
    const decoded = decodeURIComponent(payload);
    return typeof TextEncoder === "function" ? new TextEncoder().encode(decoded).length : decoded.length;
  } catch {
    return payload.length;
  }
}

export function parseImageDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:([^,;]*)((?:;[^,]*)*),([\s\S]*)$/.exec(dataUrl ?? "");
  if (!match) return null;
  const [, mime, parameters, payload] = match;
  const base64 = /;base64/i.test(parameters ?? "");
  return {
    mime: (mime || "application/octet-stream").toLowerCase(),
    payload: payload ?? "",
    base64,
    bytes: base64 ? base64Bytes(payload ?? "") : textBytes(payload ?? ""),
  };
}

export function estimateDataUrlBytes(dataUrl: string): number {
  return parseImageDataUrl(dataUrl)?.bytes ?? 0;
}

function isSvg(mime: string): boolean {
  return mime.includes("svg");
}

/**
 * Synchronous classification, so callers that patch state inside a FileReader
 * callback can keep their single-frame update when nothing has to change.
 */
export function checkImageBudget(dataUrl: string, options: ImageDownscaleOptions = {}): ImageBudgetCheck {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return { verdict: "keep", bytes: 0 };
  const budget = resolveBudget(options);
  if (isSvg(parsed.mime)) {
    if (parsed.bytes <= budget.svgMaxBytes) return { verdict: "keep", bytes: parsed.bytes };
    return {
      verdict: "reject",
      bytes: parsed.bytes,
      message: `SVG 体积过大（${formatByteSize(parsed.bytes)}），上限 ${formatByteSize(budget.svgMaxBytes)}，请压缩后再导入`,
    };
  }
  return { verdict: parsed.bytes <= budget.passthroughBytes ? "keep" : "resample", bytes: parsed.bytes };
}

function dataUrlToBlob(parsed: ParsedDataUrl): Blob | null {
  if (typeof Blob !== "function") return null;
  try {
    if (!parsed.base64) return new Blob([decodeURIComponent(parsed.payload)], { type: parsed.mime });
    if (typeof atob !== "function") return null;
    const binary = atob(parsed.payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: parsed.mime });
  } catch {
    return null;
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function decodeWithElement(dataUrl: string): Promise<DecodedImage | null> {
  if (typeof Image !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: Math.max(1, image.naturalWidth || image.width || 1),
      height: Math.max(1, image.naturalHeight || image.height || 1),
      release: () => undefined,
    });
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

async function decodeImage(dataUrl: string, parsed: ParsedDataUrl): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === "function") {
    const blob = dataUrlToBlob(parsed);
    if (blob) {
      try {
        // EXIF-rotated phone photos must be baked into the pixels we re-encode.
        const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
        return {
          source: bitmap,
          width: Math.max(1, bitmap.width),
          height: Math.max(1, bitmap.height),
          release: () => bitmap.close?.(),
        };
      } catch {
        // Fall through to the <img> decoder.
      }
    }
  }
  return decodeWithElement(dataUrl);
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean | null {
  try {
    const { data } = context.getImageData(0, 0, width, height);
    const pixels = Math.floor(data.length / 4);
    if (pixels === 0) return null;
    const step = Math.max(1, Math.floor(pixels / ALPHA_SAMPLES));
    for (let pixel = 0; pixel < pixels; pixel += step) {
      if (data[pixel * 4 + 3]! < OPAQUE_ALPHA) return true;
    }
    return false;
  } catch {
    return null;
  }
}

function encodeAs(canvas: HTMLCanvasElement, mime: string, quality?: number): string | null {
  try {
    const encoded = canvas.toDataURL(mime, quality);
    return typeof encoded === "string" && encoded.startsWith(`data:${mime}`) ? encoded : null;
  } catch {
    return null;
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, transparent: boolean): string | null {
  if (transparent) return encodeAs(canvas, "image/webp", WEBP_QUALITY) ?? encodeAs(canvas, "image/png");
  for (const quality of JPEG_QUALITIES) {
    const jpeg = encodeAs(canvas, "image/jpeg", quality);
    if (!jpeg) break;
    if (estimateDataUrlBytes(jpeg) <= TARGET_BYTES || quality === JPEG_QUALITIES.at(-1)) return jpeg;
  }
  return encodeAs(canvas, "image/png");
}

/**
 * Returns a data URL that fits the budget for `kind`. The value stays a data
 * URL so callers keep storing the same field; only the pixel size and the
 * encoding change. Sources that cannot be decoded are returned untouched,
 * while oversized SVG markup throws {@link OversizedImageError}.
 */
export async function downscaleImageDataUrl(
  dataUrl: string,
  options: ImageDownscaleOptions = {},
): Promise<string> {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  const check = checkImageBudget(dataUrl, options);
  if (check.verdict === "reject") {
    throw new OversizedImageError(check.message!, check.bytes, resolveBudget(options).svgMaxBytes);
  }
  if (check.verdict === "keep") return dataUrl;

  const decoded = await decodeImage(dataUrl, parsed);
  if (!decoded) return dataUrl;
  const budget = resolveBudget(options);
  const scale = Math.min(1, budget.maxEdge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    decoded.release();
    return dataUrl;
  }
  context.drawImage(decoded.source, 0, 0, width, height);
  decoded.release();
  const transparent = hasTransparency(context, width, height) ?? !parsed.mime.includes("jpeg");
  const encoded = encodeCanvas(canvas, transparent);
  // Re-encoding can inflate already-optimized files; never grow the document.
  return encoded && estimateDataUrlBytes(encoded) < parsed.bytes ? encoded : dataUrl;
}

/**
 * Applies the budget-fitted data URL, synchronously when the source already
 * fits so that React updates stay in the same frame as the upload event.
 */
export function applyImageWithinBudget(
  dataUrl: string,
  options: ImageDownscaleOptions,
  apply: (src: string) => void,
  onError?: (message: string) => void,
): void {
  const check = checkImageBudget(dataUrl, options);
  if (check.verdict === "reject") {
    onError?.(check.message ?? "图片过大，未导入");
    return;
  }
  if (check.verdict === "keep") {
    apply(dataUrl);
    return;
  }
  void downscaleImageDataUrl(dataUrl, options)
    .then(apply)
    .catch((error) => onError?.(error instanceof Error ? error.message : "图片压缩失败"));
}
