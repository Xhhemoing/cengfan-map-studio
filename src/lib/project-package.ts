import type { UserAsset } from "./assets";
import { BUILT_IN_FONTS, type UserFont } from "./fonts";
import { restoreProjectDocument, serializeProjectDocument, type ProjectDocument } from "./project-document";
import { createResourcePack, parseResourcePack } from "./resource-pack";
import { DEFAULT_RENDER_SETTINGS, normalizeRenderSettings, type RenderSettings } from "./render-settings";
import { loadCustomTemplates, type CustomTemplateRecord } from "./template-store";
import type { ProvinceAppearance } from "./scene-document";

export const PROJECT_PACKAGE_VERSION = 2 as const;

export interface ProjectPackage {
  kind: "cengfan-project-package";
  version: typeof PROJECT_PACKAGE_VERSION;
  exportedAt: string;
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
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

function repairProjectFontReferences(project: ProjectDocument, fonts: UserFont[]): ProjectDocument {
  const availableFontIds = new Set([...BUILT_IN_FONTS.map((font) => font.id), ...fonts.map((font) => font.id)]);
  const fontIdByFamily = new Map(fonts.map((font) => [font.family, font.id]));
  const resolveFontId = (fontId: string | undefined): string | undefined => {
    if (!fontId) return undefined;
    if (availableFontIds.has(fontId)) return fontId;
    return fontIdByFamily.get(fontId);
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
  return `${JSON.stringify(pack, null, 2)}\n`;
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
  const project = repairProjectFontReferences(
    repairProjectAssetReferences(
      restoreProjectDocument(JSON.stringify(hydrateMissingAssetSources(record.project, resourcePack.pack.assets))),
      resourcePack.pack.assets,
    ),
    resourcePack.pack.fonts,
  );
  return {
    kind: "cengfan-project-package",
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: validExportedAt(record.exportedAt),
    project,
    assets: resourcePack.pack.assets,
    fonts: resourcePack.pack.fonts,
    customTemplates: normalizeCustomTemplates(record.customTemplates),
    renderSettings: normalizeRenderSettings(record.renderSettings),
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
