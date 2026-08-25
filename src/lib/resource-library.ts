import type { UserAsset } from "./assets";
import { findAssetUsage, isAssetInUse, removeUserAsset, removeUserFont } from "./catalog-usage";
import type { UserFont } from "./fonts";
import type { ProjectDocument } from "./project-document";
import {
  createResourcePack,
  mergeResourcePack,
  parseResourcePack,
  type ResourcePack,
} from "./resource-pack";

/** 空素材没有可写入的内容,提示要说清楚它没有进库。 */
export const EMPTY_ASSET_MESSAGE = "素材内容为空，未保存";

export interface AssetLibraryOutcome {
  assets: UserAsset[];
  message: string;
}

/**
 * 同一张图重复上传时留旧条目:换成新条目会换掉 id,画布上已经引用它的实例就会断链。
 * 判重看的是内容(src + 种类 + 省份归属)而不是 id,因为不同上传路径会各自生成 id。
 */
export function addAssetToLibrary(assets: UserAsset[], asset: UserAsset): AssetLibraryOutcome {
  const duplicate = assets.some((item) => item.id === asset.id
    || item.src === asset.src && item.kind === asset.kind && JSON.stringify(item.provinceIds) === JSON.stringify(asset.provinceIds));
  // 判重时原样交回同一个数组引用,React 才能在这一次 setState 上省掉重渲染。
  if (duplicate) return { assets, message: `素材库已有相同素材：${asset.label}` };
  return { assets: [...assets, asset], message: `已加入素材库：${asset.label}` };
}

export function replaceAssetInLibrary(
  assets: UserAsset[],
  assetId: string,
  replacement: UserAsset,
): UserAsset[] {
  return assets.map((asset) => asset.id === assetId ? replacement : asset);
}

/** 删除提示要报出被删素材的名字;找不到条目时退回不点名的说法。 */
export function describeAssetRemoval(assets: UserAsset[], assetId: string): string {
  const asset = assets.find((item) => item.id === assetId);
  return asset ? `已从素材库删除：${asset.label}` : "已从素材库删除素材";
}

export function removeAssetFromLibrary(assets: UserAsset[], assetId: string): AssetLibraryOutcome {
  return { assets: removeUserAsset(assets, assetId), message: describeAssetRemoval(assets, assetId) };
}

export function describeFontRemoval(fonts: UserFont[], fontId: string): string {
  const font = fonts.find((item) => item.id === fontId);
  return font ? `已删除字体：${font.label}` : "已删除字体";
}

export function removeFontFromLibrary(fonts: UserFont[], fontId: string): {
  fonts: UserFont[];
  message: string;
} {
  return { fonts: removeUserFont(fonts, fontId), message: describeFontRemoval(fonts, fontId) };
}

const PROVINCE_SUFFIX = /(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/;

/**
 * 素材库条目上的「使用中」角标。只为真正被引用的素材建条目:未使用的素材没有键,
 * 面板据此判断能否安全删除。
 */
export function buildAssetUsageLabels(
  project: ProjectDocument,
  assets: readonly UserAsset[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const asset of assets) {
    if (!isAssetInUse(project, asset.id, asset) && asset.src !== project.canvas.backgroundImageSrc) continue;
    const usage = findAssetUsage(project, asset.id);
    const parts: string[] = [];
    if (usage.provinces.length) parts.push(usage.provinces.map((name) => name.replace(PROVINCE_SUFFIX, "")).join("/"));
    if (usage.instances.length) parts.push(`${usage.instances.length} 个实例`);
    if (asset.src === project.canvas.backgroundImageSrc) parts.push("背景");
    map[asset.id] = parts.length ? `使用中 · ${parts.join(" · ")}` : "使用中";
  }
  return map;
}

export interface ResourcePackExportOutcome {
  /** 库为空时没有可下载的包,只回提示。 */
  pack: ResourcePack | null;
  message: string;
}

export function prepareResourcePackExport(input: {
  assets: UserAsset[];
  fonts: UserFont[];
}): ResourcePackExportOutcome {
  const { assets, fonts } = input;
  if (assets.length === 0 && fonts.length === 0) {
    return { pack: null, message: "本地素材库为空，请先上传图片或字体" };
  }
  return {
    pack: createResourcePack({ assets, fonts }),
    message: `已导出资源包：${assets.length} 个素材，${fonts.length} 个字体`,
  };
}

export interface ResourcePackImportOutcome {
  /** 解析或合并失败时为 null:此时素材库保持原样,只更新提示。 */
  merged: { assets: UserAsset[]; fonts: UserFont[] } | null;
  message: string;
}

export function mergeImportedResourcePack(input: {
  text: string;
  existingAssets: UserAsset[];
  existingFonts: UserFont[];
}): ResourcePackImportOutcome {
  try {
    const { pack, assetCount, fontCount } = parseResourcePack(input.text);
    const merged = mergeResourcePack({
      existingAssets: input.existingAssets,
      existingFonts: input.existingFonts,
      incoming: pack,
    });
    return {
      merged: { assets: merged.assets, fonts: merged.fonts },
      message: `资源包已导入：新增 ${merged.addedAssets}/${assetCount} 素材，${merged.addedFonts}/${fontCount} 字体`,
    };
  } catch (error) {
    return { merged: null, message: error instanceof Error ? error.message : "资源包导入失败" };
  }
}
