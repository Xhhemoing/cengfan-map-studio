import type { UserAsset } from "./assets";
import {
  BUILT_IN_FONTS,
  estimateFontBytes,
  findExistingFont,
  formatFontBytes,
  MAX_USER_FONT_BYTES,
  type UserFont,
} from "./fonts";
import { estimateDataUrlBytes, formatByteSize } from "./image-downscale";
import { restoreProjectDocument, serializeProjectDocument, type ProjectDocument } from "./project-document";
import { createResourcePack, parseResourcePack } from "./resource-pack";
import { DEFAULT_RENDER_SETTINGS, normalizeRenderSettings, type RenderSettings } from "./render-settings";
import { loadCustomTemplates, type CustomTemplateRecord } from "./template-store";
import type { ProvinceAppearance } from "./scene-document";

export const PROJECT_PACKAGE_VERSION = 2 as const;

/**
 * Hard ceiling for one imported asset, measured on the decoded image bytes. Uploads are downscaled
 * at the entry point, but a package can carry anything, and every asset rides inside the scene as a
 * data URL (~4/3 of the decoded size) through a collaboration transaction the server caps at 8MiB.
 * Re-encoding needs a canvas and would make parsing async, so import drops the image instead.
 */
export const MAX_PACKAGE_ASSET_BYTES = 5 * 1024 * 1024;

export interface ProjectPackage {
  kind: "cengfan-project-package";
  version: typeof PROJECT_PACKAGE_VERSION;
  exportedAt: string;
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
  /** Chinese notes about resources stripped while importing. Import-only, never exported. */
  warnings?: string[];
}

type ProjectPackageInput = {
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates?: CustomTemplateRecord[];
  renderSettings?: RenderSettings;
  now?: Date;
};

function normalizeCustomTemplates(value: unknown): CustomTemplateRecord[] {
  if (!Array.isArray(value)) return [];
  return loadCustomTemplates({
    getItem: () => JSON.stringify(value),
    setItem: () => undefined,
  });
}

function projectWithoutHistory(project: ProjectDocument): ProjectDocument {
  if (project.history.past.length === 0 && project.history.future.length === 0) return project;
  return { ...project, history: { past: [], future: [] } };
}

function validExportedAt(value: unknown): string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : new Date(0).toISOString();
}

function repairProjectAssetReferences(project: ProjectDocument, assets: UserAsset[]): ProjectDocument {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const bySrc = new Map(assets.map((asset) => [asset.src, asset]));
  const repairAppearance = (appearance: ProvinceAppearance | undefined): ProvinceAppearance | undefined => {
    if (!appearance || appearance.kind === "manual-color") return appearance;
    const asset = byId.get(appearance.assetId) ?? bySrc.get(appearance.src);
    return asset ? { ...appearance, assetId: asset.id, src: asset.src } : appearance;
  };
  const renderSource = project.map.renderSource;
  const renderAsset = renderSource?.kind === "image"
    ? byId.get(renderSource.assetId) ?? bySrc.get(renderSource.src)
    : undefined;
  return {
    ...project,
    map: {
      ...project.map,
      ...(renderSource?.kind === "image" && renderAsset
        ? { renderSource: { ...renderSource, assetId: renderAsset.id, src: renderAsset.src } }
        : {}),
      provinceStyles: Object.fromEntries(Object.entries(project.map.provinceStyles ?? {}).map(([province, style]) => [
        province,
        { ...style, appearance: repairAppearance(style.appearance) },
      ])),
    },
    assetElements: project.assetElements.map((element) => {
      const asset = byId.get(element.assetId) ?? bySrc.get(element.src);
      return asset ? { ...element, assetId: asset.id, src: asset.src } : element;
    }),
    history: { past: [], future: [] },
  };
}

function repairProjectFontReferences(
  project: ProjectDocument,
  fonts: UserFont[],
  fontIdRemap: Record<string, string>,
): ProjectDocument {
  const availableFontIds = new Set([...BUILT_IN_FONTS.map((font) => font.id), ...fonts.map((font) => font.id)]);
  const fontIdByFamily = new Map(fonts.map((font) => [font.family, font.id]));
  /** Deduped fonts can chain when several copies collapse in successive passes, so follow the links. */
  const followRemap = (fontId: string): string | undefined => {
    const seen = new Set<string>([fontId]);
    let current: string | undefined = fontIdRemap[fontId];
    while (current && !seen.has(current)) {
      if (availableFontIds.has(current)) return current;
      seen.add(current);
      current = fontIdRemap[current];
    }
    return undefined;
  };
  const resolveFontId = (fontId: string | undefined): string | undefined => {
    if (!fontId) return undefined;
    if (availableFontIds.has(fontId)) return fontId;
    return fontIdByFamily.get(fontId) ?? followRemap(fontId);
  };
  const fieldFonts = Object.fromEntries(Object.entries(project.cards.fieldFonts ?? {}).flatMap(([field, fontId]) => {
    const resolved = resolveFontId(fontId);
    return resolved ? [[field, resolved]] : [];
  }));
  return {
    ...project,
    map: {
      ...project.map,
      provinceLabelFontId: resolveFontId(project.map.provinceLabelFontId),
      provinceStyles: Object.fromEntries(Object.entries(project.map.provinceStyles ?? {}).map(([province, style]) => {
        const { labelFontId: _legacyFontId, ...rest } = style;
        const labelFontId = resolveFontId(style.labelFontId);
        return [province, { ...rest, ...(labelFontId ? { labelFontId } : {}) }];
      })),
    },
    cards: { ...project.cards, fieldFonts },
    guests: {
      ...project.guests,
      titleFontId: resolveFontId(project.guests.titleFontId),
      peopleFontId: resolveFontId(project.guests.peopleFontId),
      people: project.guests.people.map((person) => ({ ...person, fontId: resolveFontId(person.fontId) })),
    },
    textElements: project.textElements.map((text) => ({ ...text, fontId: resolveFontId(text.fontId) })),
    history: { past: [], future: [] },
  };
}

/**
 * Package hydration is the last stop before fonts reach editor state and collaboration, so the
 * upload ceiling is enforced here too instead of trusting whichever layer produced the package.
 */
function limitImportedFonts(fonts: UserFont[]): {
  fonts: UserFont[];
  oversized: number;
  duplicates: number;
  fontIdRemap: Record<string, string>;
} {
  const kept: UserFont[] = [];
  const fontIdRemap: Record<string, string> = {};
  let oversized = 0;
  let duplicates = 0;
  for (const font of fonts) {
    if (estimateFontBytes(font.src) > MAX_USER_FONT_BYTES) {
      oversized += 1;
      continue;
    }
    const duplicateOf = findExistingFont(kept, font.src);
    if (duplicateOf) {
      duplicates += 1;
      fontIdRemap[font.id] = duplicateOf.id;
      if (font.family && font.family !== font.id) fontIdRemap[font.family] = duplicateOf.id;
      continue;
    }
    kept.push(font);
  }
  return { fonts: kept, oversized, duplicates, fontIdRemap };
}

function limitImportedAssets(assets: UserAsset[]): { assets: UserAsset[]; droppedIds: Set<string> } {
  const kept: UserAsset[] = [];
  const droppedIds = new Set<string>();
  for (const asset of assets) {
    if (estimateDataUrlBytes(asset.src) > MAX_PACKAGE_ASSET_BYTES) {
      droppedIds.add(asset.id);
      continue;
    }
    kept.push(asset);
  }
  return { assets: kept, droppedIds };
}

/**
 * Every scene reference carries its own copy of the data URL, and the canvas background, guest
 * avatars and legacy province textures carry one without any catalog entry at all, so filtering the
 * catalog alone would leave the oversized payload inside the project document.
 *
 * `inlineDropped` counts only payloads the catalog warning does not already explain.
 */
function dropOversizedImagePayloads(
  project: ProjectDocument,
  droppedAssetIds: Set<string>,
): { project: ProjectDocument; inlineDropped: number } {
  let inlineDropped = 0;
  const dropsInline = (src: string | undefined): boolean => {
    if (!src || estimateDataUrlBytes(src) <= MAX_PACKAGE_ASSET_BYTES) return false;
    inlineDropped += 1;
    return true;
  };
  const dropsReference = (assetId: string, src: string): boolean =>
    droppedAssetIds.has(assetId) || dropsInline(src);
  const renderSource = project.map.renderSource;
  const dropsRenderSource = renderSource?.kind === "image" && dropsReference(renderSource.assetId, renderSource.src);
  const { backgroundImageSrc, ...canvas } = project.canvas;
  const keepsBackground = Boolean(backgroundImageSrc) && !dropsInline(backgroundImageSrc);
  return {
    project: {
      ...project,
      canvas: { ...canvas, ...(keepsBackground ? { backgroundImageSrc } : {}) },
      map: {
        ...project.map,
        ...(dropsRenderSource ? { renderSource: { kind: "vector" as const } } : {}),
        provinceStyles: Object.fromEntries(Object.entries(project.map.provinceStyles ?? {}).map(([province, style]) => {
          const { textureSrc, appearance, ...rest } = style;
          const keepsTexture = Boolean(textureSrc) && !dropsInline(textureSrc);
          const keepsAppearance = !appearance
            || appearance.kind === "manual-color"
            || !dropsReference(appearance.assetId, appearance.src);
          return [province, {
            ...rest,
            ...(keepsTexture ? { textureSrc } : {}),
            ...(appearance && keepsAppearance ? { appearance } : {}),
          }];
        })),
      },
      guests: {
        ...project.guests,
        people: project.guests.people.map((person) => {
          const { avatarSrc, ...rest } = person;
          return dropsInline(avatarSrc) ? rest : person;
        }),
      },
      assetElements: project.assetElements.filter((element) => !dropsReference(element.assetId, element.src)),
    },
    inlineDropped,
  };
}

function hydrateMissingAssetSources(value: unknown, assets: UserAsset[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const project = value as Record<string, unknown>;
  const map = project.map && typeof project.map === "object" && !Array.isArray(project.map)
    ? project.map as Record<string, unknown>
    : undefined;
  const styles = map?.provinceStyles && typeof map.provinceStyles === "object" && !Array.isArray(map.provinceStyles)
    ? map.provinceStyles as Record<string, unknown>
    : undefined;
  if (!map || !styles) return value;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const provinceStyles = Object.fromEntries(Object.entries(styles).map(([province, styleValue]) => {
    if (!styleValue || typeof styleValue !== "object" || Array.isArray(styleValue)) return [province, styleValue];
    const style = styleValue as Record<string, unknown>;
    if (!style.appearance || typeof style.appearance !== "object" || Array.isArray(style.appearance)) return [province, styleValue];
    const appearance = style.appearance as Record<string, unknown>;
    const asset = typeof appearance.assetId === "string" ? byId.get(appearance.assetId) : undefined;
    if (!asset || typeof appearance.src === "string" && appearance.src) return [province, styleValue];
    return [province, { ...style, appearance: { ...appearance, src: asset.src } }];
  }));
  return { ...project, map: { ...map, provinceStyles } };
}

export function createProjectPackageEnvelope(input: ProjectPackageInput): ProjectPackage {
  return {
    kind: "cengfan-project-package",
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    project: projectWithoutHistory(input.project),
    assets: input.assets,
    fonts: input.fonts,
    customTemplates: input.customTemplates ?? [],
    renderSettings: normalizeRenderSettings(input.renderSettings ?? DEFAULT_RENDER_SETTINGS),
  };
}

export function createProjectPackage(input: ProjectPackageInput): ProjectPackage {
  const compactProject = projectWithoutHistory(input.project);
  return {
    kind: "cengfan-project-package",
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    project: restoreProjectDocument(serializeProjectDocument(compactProject)),
    assets: structuredClone(input.assets),
    fonts: structuredClone(input.fonts),
    customTemplates: structuredClone(input.customTemplates ?? []),
    renderSettings: normalizeRenderSettings(input.renderSettings ?? DEFAULT_RENDER_SETTINGS),
  };
}

export function serializeProjectPackage(pack: ProjectPackage): string {
  const { warnings: _importWarnings, ...exported } = pack;
  return `${JSON.stringify(exported, null, 2)}\n`;
}

export function parseProjectPackage(raw: string): ProjectPackage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("工程包不是有效的 JSON");
  }
  return restoreProjectPackage(value);
}

export function restoreProjectPackage(value: unknown): ProjectPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("不是蹭饭图工程包");
  const record = value as Record<string, unknown>;
  if (record.kind !== "cengfan-project-package" || !record.project || typeof record.project !== "object") {
    throw new Error("不是蹭饭图工程包");
  }
  const resourcePack = parseResourcePack(JSON.stringify({
    kind: "cengfan-resource-pack",
    exportedAt: record.exportedAt,
    assets: record.assets,
    fonts: record.fonts,
  }), { allowEmpty: true });
  const { fonts, oversized, duplicates, fontIdRemap } = limitImportedFonts(resourcePack.pack.fonts);
  const { assets, droppedIds } = limitImportedAssets(resourcePack.pack.assets);
  const cleaned = dropOversizedImagePayloads(
    repairProjectAssetReferences(
      restoreProjectDocument(JSON.stringify(hydrateMissingAssetSources(record.project, assets))),
      assets,
    ),
    droppedIds,
  );
  const project = repairProjectFontReferences(cleaned.project, fonts, {
    ...resourcePack.fontIdRemap,
    ...fontIdRemap,
  });
  const oversizedFonts = resourcePack.skippedFontCount + oversized;
  const duplicateFonts = resourcePack.duplicateFontCount + duplicates;
  const assetLimit = formatByteSize(MAX_PACKAGE_ASSET_BYTES);
  const warnings = [
    ...(oversizedFonts > 0
      ? [`${oversizedFonts} 个字体超过 ${formatFontBytes(MAX_USER_FONT_BYTES)} 上限，未导入，相关文字已回落到默认字体`]
      : []),
    ...(duplicateFonts > 0
      ? [`${duplicateFonts} 个字体与包内其他字体内容相同，已合并为一份，相关文字改用保留的那份`]
      : []),
    ...(droppedIds.size > 0
      ? [`${droppedIds.size} 张素材超过 ${assetLimit} 上限，未导入，画面中的引用已移除`]
      : []),
    ...(cleaned.inlineDropped > 0
      ? [`${cleaned.inlineDropped} 处画面内嵌图片超过 ${assetLimit} 上限，已移除`]
      : []),
  ];
  return {
    kind: "cengfan-project-package",
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: validExportedAt(record.exportedAt),
    project,
    assets,
    fonts,
    customTemplates: normalizeCustomTemplates(record.customTemplates),
    renderSettings: normalizeRenderSettings(record.renderSettings),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** File picker filter for `.json` / `.cengfan` project packages. */
export const PROJECT_PACKAGE_FILE_ACCEPT = "application/json,.json,.cengfan";

export function projectPackageDisplayName(filename: string): string {
  return filename.replace(/\.(json|cengfan)$/i, "") || "导入的项目";
}

export function downloadProjectPackage(pack: ProjectPackage, filename = `cengfan-project-${pack.exportedAt.slice(0, 10)}.json`): void {
  const blob = new Blob([serializeProjectPackage(pack)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function projectPackageResourcePack(pack: ProjectPackage) {
  return createResourcePack({ assets: pack.assets, fonts: pack.fonts, now: new Date(pack.exportedAt) });
}
