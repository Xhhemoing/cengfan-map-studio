import { createId } from "./ids";

export interface BuiltInFont {
  id: string;
  label: string;
  stack: string;
  source: "system";
}

export interface UserFont {
  id: string;
  label: string;
  /** CSS font-family name registered through @font-face. */
  family: string;
  /** data URL of the uploaded font file. */
  src: string;
  format: FontFormat;
  source: "user";
}

export type StudioFont = BuiltInFont | UserFont;
export type FontFormat = "truetype" | "opentype" | "woff" | "woff2";

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const USER_FONTS_KEY = "cengfan-map-studio:user-fonts";

export const DEFAULT_FONT_ID = "";

export const BUILT_IN_FONTS: BuiltInFont[] = [
  {
    id: "font-system-sans",
    label: "默认黑体",
    stack: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    source: "system",
  },
  {
    id: "font-system-serif",
    label: "宋体/衬线",
    stack: '"Songti SC", SimSun, "Noto Serif SC", serif',
    source: "system",
  },
  {
    id: "font-system-kaiti",
    label: "楷体",
    stack: 'KaiTi, "Kaiti SC", STKaiti, "AR PL UKai CN", serif',
    source: "system",
  },
  {
    id: "font-system-fangsong",
    label: "仿宋",
    stack: 'FangSong, "FangSong_GB2312", STFangsong, serif',
    source: "system",
  },
  {
    id: "font-system-rounded",
    label: "圆体",
    stack: '"Yuanti SC", YouYuan, "Microsoft YaHei", sans-serif',
    source: "system",
  },
  {
    id: "font-system-mono",
    label: "等宽",
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    source: "system",
  },
];

const FORMAT_BY_EXTENSION: Record<string, FontFormat> = {
  ttf: "truetype",
  otf: "opentype",
  woff: "woff",
  woff2: "woff2",
};

/**
 * Hard ceiling for one uploaded font file. A font is stored as a base64 data URL (~4/3 of the
 * file) and travels inside a single collaboration transaction, which the server caps at 8MiB,
 * so anything past this size makes incremental sync fail permanently instead of degrading.
 */
export const MAX_USER_FONT_BYTES = 5 * 1024 * 1024;

/** Fonts at or above this size still upload, but resource health flags the sync cost. */
export const LARGE_USER_FONT_BYTES = 2 * 1024 * 1024;

export function detectFontFormat(fileName: string): FontFormat | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return FORMAT_BY_EXTENSION[extension] ?? null;
}

export function formatFontBytes(bytes: number): string {
  const mib = 1024 * 1024;
  if (bytes >= mib) {
    const value = bytes / mib;
    return `${Number.isInteger(value) ? value : value.toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

const BASE64_MARKER = ";base64,";

function base64PayloadStart(src: string): number {
  const marker = src.indexOf(BASE64_MARKER);
  return marker === -1 ? 0 : marker + BASE64_MARKER.length;
}

/** Decoded byte length of a font data URL, computed from the payload length so no bytes are copied. */
export function estimateFontBytes(src: string): number {
  const start = base64PayloadStart(src);
  if (start === 0) return src.length;
  const payloadLength = src.length - start;
  const padding = src.endsWith("==") ? 2 : src.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(payloadLength / 4) * 3 - padding);
}

/** Compare the encoded payloads directly so the same file uploaded under a different MIME type still matches. */
function sameFontBytes(left: string, right: string): boolean {
  const leftStart = base64PayloadStart(left);
  const rightStart = base64PayloadStart(right);
  const length = left.length - leftStart;
  if (length !== right.length - rightStart) return false;
  for (let index = 0; index < length; index += 1) {
    if (left.charCodeAt(leftStart + index) !== right.charCodeAt(rightStart + index)) return false;
  }
  return true;
}

/** Locate an already stored font with identical bytes so re-uploads reuse its id instead of duplicating megabytes. */
export function findExistingFont(fonts: readonly UserFont[], src: string): UserFont | undefined {
  if (!src) return undefined;
  return fonts.find((font) => sameFontBytes(font.src, src));
}

export type FontFileValidation =
  | { ok: true; format: FontFormat; size: number }
  | { ok: false; reason: string };

export function validateFontFile(file: { name: string; size: number }): FontFileValidation {
  const format = detectFontFormat(file.name);
  if (!format) return { ok: false, reason: "仅支持 TTF / OTF / WOFF 字体文件" };
  if (file.size <= 0) return { ok: false, reason: "字体内容为空，未保存" };
  if (file.size > MAX_USER_FONT_BYTES) {
    return {
      ok: false,
      reason: `字体文件 ${formatFontBytes(file.size)} 超过 ${formatFontBytes(MAX_USER_FONT_BYTES)} 上限，超出后协作同步会失败，请压缩或裁剪字符集`,
    };
  }
  return { ok: true, format, size: file.size };
}

export function createUserFont(input: {
  label: string;
  src: string;
  format: FontFormat;
}): UserFont {
  const id = createId("font-user");
  return {
    id,
    label: input.label.trim() || "未命名字体",
    family: id,
    src: input.src,
    format: input.format,
    source: "user",
  };
}

export function saveUserFonts(
  fonts: UserFont[],
  storage: StorageAdapter = localStorage,
): void {
  storage.setItem(USER_FONTS_KEY, JSON.stringify(fonts));
}

export function loadUserFonts(
  storage: StorageAdapter = localStorage,
): UserFont[] {
  const raw = storage.getItem(USER_FONTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.src !== "string" || !record.src) return [];
      const format = record.format === "truetype" || record.format === "opentype" || record.format === "woff" || record.format === "woff2"
        ? record.format
        : "truetype";
      return [{
        id: record.id,
        label: typeof record.label === "string" && record.label ? record.label : "未命名字体",
        family: typeof record.family === "string" && record.family ? record.family : record.id,
        src: record.src,
        format,
        source: "user" as const,
      }];
    });
  } catch {
    return [];
  }
}

export function listFonts(userFonts: UserFont[]): StudioFont[] {
  return [...BUILT_IN_FONTS, ...userFonts];
}

/**
 * Resolve a stored font id to a CSS font-family value.
 * Returns undefined for the default id so SVG text inherits the app font.
 */
export function resolveFontFamily(
  fontId: string | undefined,
  userFonts: UserFont[],
): string | undefined {
  if (!fontId) return undefined;
  const builtIn = BUILT_IN_FONTS.find((font) => font.id === fontId);
  if (builtIn) return builtIn.stack;
  const user = userFonts.find((font) => font.id === fontId || font.family === fontId);
  if (user) return `"${user.family}"`;
  return undefined;
}

/** Build @font-face CSS for user fonts, embeddable in the poster SVG so exports keep fonts. */
export function buildFontFaceCss(userFonts: UserFont[], fontDisplay: "swap" | "block" = "swap"): string {
  return userFonts
    .map((font) =>
      `@font-face{font-family:"${font.family}";src:url("${font.src}") format("${font.format}");font-display:${fontDisplay};}`,
    )
    .join("\n");
}

interface FontSet {
  add(font: FontFace): void;
  ready?: Promise<unknown>;
}

type FontFaceConstructor = new (family: string, source: string, descriptors?: FontFaceDescriptors) => FontFace;
const loadedUserFontSourcesBySet = new WeakMap<FontSet, Set<string>>();

/** Register user fonts with the browser, not only with an SVG-local stylesheet. */
export async function ensureUserFontsLoaded(
  userFonts: UserFont[],
  documentRef: { fonts: FontSet } | undefined = typeof document === "undefined" ? undefined : document,
  FontFaceRef: FontFaceConstructor | undefined = typeof FontFace === "undefined" ? undefined : FontFace,
): Promise<void> {
  if (!documentRef || !FontFaceRef) return;
  const loadedUserFontSources = loadedUserFontSourcesBySet.get(documentRef.fonts) ?? new Set<string>();
  loadedUserFontSourcesBySet.set(documentRef.fonts, loadedUserFontSources);
  await Promise.all(userFonts.flatMap((font) => {
    const sourceKey = `${font.family}:${font.src}`;
    if (loadedUserFontSources.has(sourceKey)) return [];
    loadedUserFontSources.add(sourceKey);
    const face = new FontFaceRef(font.family, `url("${font.src}") format("${font.format}")`);
    return [face.load().then((loaded) => documentRef.fonts.add(loaded)).catch(() => {
      loadedUserFontSources.delete(sourceKey);
    })];
  }));
  await documentRef.fonts.ready;
}
