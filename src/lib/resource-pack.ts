import type { UserAsset } from "./assets";
import { downloadBlob } from "./export-poster";
import { estimateExportSize, exportSizeBytes } from "./export-size-estimate";
import { formatByteSize } from "./image-downscale";
import { MAX_RESOURCE_PACK_BYTES, RESOURCE_PACK_IMPORT_LIMIT } from "./import-file-limits";
import {
  estimateFontBytes,
  findExistingFont,
  formatFontBytes,
  MAX_USER_FONT_BYTES,
  type UserFont,
} from "./fonts";

export const RESOURCE_PACK_VERSION = 1 as const;

export interface ResourcePack {
  version: typeof RESOURCE_PACK_VERSION;
  kind: "cengfan-resource-pack";
  exportedAt: string;
  assets: UserAsset[];
  fonts: UserFont[];
}

export interface ParsedResourcePack {
  pack: ResourcePack;
  assetCount: number;
  fontCount: number;
  /** Fonts dropped because they exceed the collaboration-safe size ceiling. */
  skippedFontCount: number;
  /** Fonts dropped because another copy with identical bytes was kept. */
  duplicateFontCount: number;
  /**
   * Id and family of every deduped font mapped to the id that survived. Without it a scene that
   * points at the dropped copy resolves to nothing and its text silently falls back to the
   * default font.
   */
  fontIdRemap: Record<string, string>;
}

/** Record both keys a scene can reference a dropped font by, so either one lands on the kept copy. */
function recordFontRemap(remap: Record<string, string>, dropped: UserFont, kept: UserFont): void {
  remap[dropped.id] = kept.id;
  if (dropped.family && dropped.family !== dropped.id) remap[dropped.family] = kept.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAsset(value: unknown): UserAsset | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.src !== "string" || !value.src) return null;
  const kind = value.kind === "background" || value.kind === "regional" || value.kind === "province-texture"
    ? value.kind
    : "decoration";
  return {
    id: value.id,
    label: typeof value.label === "string" && value.label ? value.label : "未命名素材",
    src: value.src,
    kind,
    provinceIds: Array.isArray(value.provinceIds)
      ? [...new Set(value.provinceIds.filter((province): province is string => typeof province === "string" && Boolean(province)))]
      : [],
    source: "user",
  };
}

function normalizeFont(value: unknown): UserFont | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.src !== "string" || !value.src) return null;
  const format = value.format === "truetype" || value.format === "opentype" || value.format === "woff" || value.format === "woff2"
    ? value.format
    : "truetype";
  return {
    id: value.id,
    label: typeof value.label === "string" && value.label ? value.label : "未命名字体",
    family: typeof value.family === "string" && value.family ? value.family : value.id,
    src: value.src,
    format,
    source: "user",
  };
}

function validDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function createResourcePack(input: {
  assets: UserAsset[];
  fonts: UserFont[];
  now?: Date;
}): ResourcePack {
  return {
    version: RESOURCE_PACK_VERSION,
    kind: "cengfan-resource-pack",
    exportedAt: (input.now ?? new Date()).toISOString(),
    assets: input.assets.map((asset) => ({ ...asset, provinceIds: [...asset.provinceIds], source: "user" as const })),
    fonts: input.fonts.map((font) => ({ ...font, source: "user" as const })),
  };
}

export function serializeResourcePack(pack: ResourcePack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

export function parseResourcePack(raw: string, options: { allowEmpty?: boolean } = {}): ParsedResourcePack {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("资源包不是有效的 JSON");
  }
  if (!isRecord(parsed)) throw new Error("资源包格式无效");
  if (parsed.kind !== "cengfan-resource-pack" && parsed.kind !== undefined) {
    throw new Error("不是蹭饭图资源包");
  }
  const normalizedAssets = Array.isArray(parsed.assets)
    ? parsed.assets.flatMap((item) => {
      const asset = normalizeAsset(item);
      return asset ? [asset] : [];
    })
    : [];
  const normalizedFonts = Array.isArray(parsed.fonts)
    ? parsed.fonts.flatMap((item) => {
      const font = normalizeFont(item);
      return font ? [font] : [];
    })
    : [];
  const assetIds = new Set<string>();
  const assets: UserAsset[] = [];
  const assetsByContent = new Map<string, UserAsset>();
  for (const asset of normalizedAssets) {
    if (assetIds.has(asset.id)) continue;
    assetIds.add(asset.id);
    const contentKey = `${asset.kind}\0${asset.src}`;
    const existing = assetsByContent.get(contentKey);
    if (existing) {
      existing.provinceIds = [...new Set([...existing.provinceIds, ...asset.provinceIds])];
      continue;
    }
    assets.push(asset);
    assetsByContent.set(contentKey, asset);
  }
  const fontIds = new Set<string>();
  const fonts: UserFont[] = [];
  const fontIdRemap: Record<string, string> = {};
  let skippedFontCount = 0;
  let duplicateFontCount = 0;
  for (const font of normalizedFonts) {
    if (fontIds.has(font.id)) continue;
    fontIds.add(font.id);
    if (estimateFontBytes(font.src) > MAX_USER_FONT_BYTES) {
      skippedFontCount += 1;
      continue;
    }
    // Same bytes under a different id would ship the payload twice through collaboration.
    const duplicateOf = findExistingFont(fonts, font.src);
    if (duplicateOf) {
      duplicateFontCount += 1;
      recordFontRemap(fontIdRemap, font, duplicateOf);
      continue;
    }
    fonts.push(font);
  }
  if (!options.allowEmpty && assets.length === 0 && fonts.length === 0) {
    throw new Error(skippedFontCount > 0
      ? `资源包中的字体超过 ${formatFontBytes(MAX_USER_FONT_BYTES)} 上限，未导入`
      : "资源包中没有可用的素材或字体");
  }
  const pack = createResourcePack({
    assets,
    fonts,
    now: validDate(parsed.exportedAt),
  });
  if (validDate(parsed.exportedAt)) pack.exportedAt = parsed.exportedAt as string;
  return {
    pack,
    assetCount: assets.length,
    fontCount: fonts.length,
    skippedFontCount,
    duplicateFontCount,
    fontIdRemap,
  };
}

export function mergeResourcePack(input: {
  existingAssets: UserAsset[];
  existingFonts: UserFont[];
  incoming: ResourcePack;
}): {
  assets: UserAsset[];
  fonts: UserFont[];
  addedAssets: number;
  addedFonts: number;
  /** Incoming fonts rejected by the size ceiling; duplicates are not counted here. */
  skippedFonts: number;
  /** Incoming fonts dropped because a stored font already carries the same bytes. */
  duplicateFonts: number;
  /** Id and family of every deduped incoming font mapped to the stored id that replaces it. */
  fontIdRemap: Record<string, string>;
} {
  const assetIds = new Set(input.existingAssets.map((asset) => asset.id));
  const fontIds = new Set(input.existingFonts.map((font) => font.id));
  const nextAssets = [...input.existingAssets];
  const nextFonts = [...input.existingFonts];
  const fontIdRemap: Record<string, string> = {};
  let addedAssets = 0;
  let addedFonts = 0;
  let skippedFonts = 0;
  let duplicateFonts = 0;

  for (const asset of input.incoming.assets) {
    if (assetIds.has(asset.id)) continue;
    nextAssets.push(asset);
    assetIds.add(asset.id);
    addedAssets += 1;
  }
  for (const font of input.incoming.fonts) {
    if (fontIds.has(font.id)) continue;
    if (estimateFontBytes(font.src) > MAX_USER_FONT_BYTES) {
      skippedFonts += 1;
      continue;
    }
    // A font already stored under another id keeps that id, so references stay on one copy.
    const duplicateOf = findExistingFont(nextFonts, font.src);
    if (duplicateOf) {
      duplicateFonts += 1;
      recordFontRemap(fontIdRemap, font, duplicateOf);
      continue;
    }
    nextFonts.push(font);
    fontIds.add(font.id);
    addedFonts += 1;
  }

  return { assets: nextAssets, fonts: nextFonts, addedAssets, addedFonts, skippedFonts, duplicateFonts, fontIdRemap };
}

/** 导出前估算资源包体积，供对话框和按钮在真正下载之前给出提示。 */
export function estimateResourcePackBytes(pack: ResourcePack): number {
  const estimate = estimateExportSize({
    rest: { ...pack, assets: [], fonts: [] },
    assets: pack.assets,
    fonts: pack.fonts,
    limitBytes: MAX_RESOURCE_PACK_BYTES,
  });
  return exportSizeBytes(estimate, true);
}

/** 超过导入闸门时返回中文说明，未超限返回 `null`。 */
export function checkResourcePackExportSize(bytes: number): string | null {
  if (bytes <= MAX_RESOURCE_PACK_BYTES) return null;
  return `资源包约 ${formatByteSize(bytes)}，超过导入上限 ${formatByteSize(MAX_RESOURCE_PACK_BYTES)}，导出后无法再导入回来；${RESOURCE_PACK_IMPORT_LIMIT.advice}`;
}

export function downloadResourcePack(pack: ResourcePack, filename = `cengfan-resource-pack-${pack.exportedAt.slice(0, 10)}.json`): void {
  // 资源包内嵌素材与字体的 data URL，体积大到下载不会立刻开始，
  // 同步 revoke 会让浏览器取消它，交给 downloadBlob 延迟回收。
  const blob = new Blob([serializeResourcePack(pack)], { type: "application/json;charset=utf-8" });
  // 导入侧 24MB 就拒收，导出侧不拦等于发给用户一份永远收不回来的备份。
  // 这里量的是即将落盘的 blob 本身，不是估算值。
  const oversized = checkResourcePackExportSize(blob.size);
  if (oversized) throw new Error(oversized);
  downloadBlob(blob, filename);
}
