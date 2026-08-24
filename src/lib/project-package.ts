import type { UserAsset } from "./assets";
import { BUILT_IN_FONTS, type UserFont } from "./fonts";
import { restoreProjectDocument, serializeProjectDocument, type ProjectDocument } from "./project-document";
import { createResourcePack } from "./resource-pack";
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

export type ProjectPackageErrorCode =
  | "invalid-json"
  | "not-a-package"
  | "package-too-large"
  | "too-many-resources"
  | "resource-too-large";

/** 导入失败的统一错误类型：`message` 面向用户，`code` 供调用方区分处理。 */
export class ProjectPackageError extends Error {
  readonly code: ProjectPackageErrorCode;

  constructor(code: ProjectPackageErrorCode, message: string) {
    super(message);
    this.name = "ProjectPackageError";
    this.code = code;
  }
}

export interface ProjectPackageLimits {
  /** 工程包文本的字节上限。 */
  maxBytes: number;
  /** 素材与字体的条目总数上限。 */
  maxResources: number;
  /** 单个素材/字体 data URL 的字节上限。 */
  maxResourceBytes: number;
  /** 自定义模板数量上限。 */
  maxCustomTemplates: number;
}

export const PROJECT_PACKAGE_LIMITS: ProjectPackageLimits = {
  maxBytes: 128 * 1024 * 1024,
  maxResources: 2000,
  maxResourceBytes: 32 * 1024 * 1024,
  maxCustomTemplates: 500,
};

export interface ProjectPackageParseOptions {
  limits?: Partial<ProjectPackageLimits>;
}

function resolveLimits(limits: Partial<ProjectPackageLimits> | undefined): ProjectPackageLimits {
  return limits ? { ...PROJECT_PACKAGE_LIMITS, ...limits } : PROJECT_PACKAGE_LIMITS;
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 0.1 ? `${megabytes.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/**
 * 在读取文件内容之前用 `File.size` 拒绝超限工程包，避免整份文本进内存后卡死页面。
 */
export function assertProjectPackageSize(byteLength: number, options: ProjectPackageParseOptions = {}): void {
  const { maxBytes } = resolveLimits(options.limits);
  if (Number.isFinite(byteLength) && byteLength > maxBytes) {
    throw new ProjectPackageError(
      "package-too-large",
      `工程包过大（约 ${formatBytes(byteLength)}），超过 ${formatBytes(maxBytes)} 上限，已停止导入`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resourceLabel(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.label === "string" && value.label ? value.label : fallback;
}

function assertResourceLimits(record: Record<string, unknown>, limits: ProjectPackageLimits): void {
  const assets = Array.isArray(record.assets) ? record.assets : [];
  const fonts = Array.isArray(record.fonts) ? record.fonts : [];
  const total = assets.length + fonts.length;
  if (total > limits.maxResources) {
    throw new ProjectPackageError(
      "too-many-resources",
      `工程包内素材与字体共 ${total} 项，超过 ${limits.maxResources} 项上限，已停止导入`,
    );
  }
  const templates = Array.isArray(record.customTemplates) ? record.customTemplates.length : 0;
  if (templates > limits.maxCustomTemplates) {
    throw new ProjectPackageError(
      "too-many-resources",
      `工程包内自定义模板共 ${templates} 个，超过 ${limits.maxCustomTemplates} 个上限，已停止导入`,
    );
  }
  const assertSource = (item: unknown, fallbackLabel: string): void => {
    const src = isRecord(item) && typeof item.src === "string" ? item.src : "";
    if (src.length > limits.maxResourceBytes) {
      throw new ProjectPackageError(
        "resource-too-large",
        `工程包内「${resourceLabel(item, fallbackLabel)}」体积过大（约 ${formatBytes(src.length)}），超过 ${formatBytes(limits.maxResourceBytes)} 上限，已停止导入`,
      );
    }
  };
  for (const item of assets) assertSource(item, "未命名素材");
  for (const item of fonts) assertSource(item, "未命名字体");
}

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

/**
 * 与 `parseResourcePack` 的归一化语义保持一致，但直接读取已解析的对象：
 * 工程包里的素材/字体是 base64 大字段，再序列化一次会把整包内容重新物化一遍。
 * 语义一致性由 project-package.test.ts 的对照用例守护。
 */
function normalizePackageResources(record: Record<string, unknown>): { assets: UserAsset[]; fonts: UserFont[] } {
  const assets: UserAsset[] = [];
  const assetIds = new Set<string>();
  const assetsByContent = new Map<string, UserAsset>();
  if (Array.isArray(record.assets)) {
    for (const item of record.assets) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string" || typeof item.src !== "string" || !item.src) continue;
      if (assetIds.has(item.id)) continue;
      assetIds.add(item.id);
      const kind = item.kind === "background" || item.kind === "regional" || item.kind === "province-texture"
        ? item.kind
        : "decoration";
      const provinceIds = Array.isArray(item.provinceIds)
        ? [...new Set(item.provinceIds.filter((province): province is string => typeof province === "string" && Boolean(province)))]
        : [];
      const contentKey = `${kind}\0${item.src}`;
      const existing = assetsByContent.get(contentKey);
      if (existing) {
        existing.provinceIds = [...new Set([...existing.provinceIds, ...provinceIds])];
        continue;
      }
      const asset: UserAsset = {
        id: item.id,
        label: typeof item.label === "string" && item.label ? item.label : "未命名素材",
        src: item.src,
        kind,
        provinceIds,
        source: "user",
      };
      assets.push(asset);
      assetsByContent.set(contentKey, asset);
    }
  }

  const fonts: UserFont[] = [];
  const fontIds = new Set<string>();
  if (Array.isArray(record.fonts)) {
    for (const item of record.fonts) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string" || typeof item.src !== "string" || !item.src) continue;
      if (fontIds.has(item.id)) continue;
      fontIds.add(item.id);
      fonts.push({
        id: item.id,
        label: typeof item.label === "string" && item.label ? item.label : "未命名字体",
        family: typeof item.family === "string" && item.family ? item.family : item.id,
        src: item.src,
        format: item.format === "truetype" || item.format === "opentype" || item.format === "woff" || item.format === "woff2"
          ? item.format
          : "truetype",
        source: "user",
      });
    }
  }

  return { assets, fonts };
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

export function parseProjectPackage(raw: string, options: ProjectPackageParseOptions = {}): ProjectPackage {
  // UTF-16 长度不会大于 UTF-8 字节数，可在 JSON.parse 之前就挡掉超限文本。
  assertProjectPackageSize(raw.length, options);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProjectPackageError("invalid-json", "工程包不是有效的 JSON");
  }
  return restoreProjectPackage(value, options);
}

export function restoreProjectPackage(value: unknown, options: ProjectPackageParseOptions = {}): ProjectPackage {
  if (!isRecord(value)) throw new ProjectPackageError("not-a-package", "不是蹭饭图工程包");
  const record = value;
  if (record.kind !== "cengfan-project-package" || !record.project || typeof record.project !== "object") {
    throw new ProjectPackageError("not-a-package", "不是蹭饭图工程包");
  }
  assertResourceLimits(record, resolveLimits(options.limits));
  const resources = normalizePackageResources(record);
  const project = repairProjectFontReferences(
    repairProjectAssetReferences(
      restoreProjectDocument(JSON.stringify(hydrateMissingAssetSources(record.project, resources.assets))),
      resources.assets,
    ),
    resources.fonts,
  );
  return {
    kind: "cengfan-project-package",
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: validExportedAt(record.exportedAt),
    project,
    assets: resources.assets,
    fonts: resources.fonts,
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
