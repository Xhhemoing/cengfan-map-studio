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

export function detectFontFormat(fileName: string): FontFormat | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return FORMAT_BY_EXTENSION[extension] ?? null;
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
