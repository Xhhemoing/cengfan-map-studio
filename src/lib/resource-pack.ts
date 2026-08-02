import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";

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
  const fonts = normalizedFonts.filter((font) => {
    if (fontIds.has(font.id)) return false;
    fontIds.add(font.id);
    return true;
  });
  if (!options.allowEmpty && assets.length === 0 && fonts.length === 0) {
    throw new Error("资源包中没有可用的素材或字体");
  }
  const pack = createResourcePack({
    assets,
    fonts,
    now: validDate(parsed.exportedAt),
  });
  if (validDate(parsed.exportedAt)) pack.exportedAt = parsed.exportedAt as string;
  return { pack, assetCount: assets.length, fontCount: fonts.length };
}

export function mergeResourcePack(input: {
  existingAssets: UserAsset[];
  existingFonts: UserFont[];
  incoming: ResourcePack;
}): { assets: UserAsset[]; fonts: UserFont[]; addedAssets: number; addedFonts: number } {
  const assetIds = new Set(input.existingAssets.map((asset) => asset.id));
  const fontIds = new Set(input.existingFonts.map((font) => font.id));
  const nextAssets = [...input.existingAssets];
  const nextFonts = [...input.existingFonts];
  let addedAssets = 0;
  let addedFonts = 0;

  for (const asset of input.incoming.assets) {
    if (assetIds.has(asset.id)) continue;
    nextAssets.push(asset);
    assetIds.add(asset.id);
    addedAssets += 1;
  }
  for (const font of input.incoming.fonts) {
    if (fontIds.has(font.id)) continue;
    nextFonts.push(font);
    fontIds.add(font.id);
    addedFonts += 1;
  }

  return { assets: nextAssets, fonts: nextFonts, addedAssets, addedFonts };
}

export function downloadResourcePack(pack: ResourcePack, filename = `cengfan-resource-pack-${pack.exportedAt.slice(0, 10)}.json`): void {
  const blob = new Blob([serializeResourcePack(pack)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
