/** Pure metadata projection and compatibility parsing; this module never opens storage or renders a scene. */
import type { DataViewId } from "./project-data";
import type { StoredProject } from "./project-store";

/** Small canvas facts, not a rendered thumbnail or a resource-bearing scene. */
export interface ProjectPreviewMetadata {
  canvasWidth: number;
  canvasHeight: number;
  dataView: DataViewId;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
  studentCount: number;
  assetCount: number;
  fontCount: number;
  customTemplateCount: number;
  /** Older metadata sidecars remain valid without these optional canvas facts. */
  preview?: ProjectPreviewMetadata;
}

/**
 * 项目卡片仍通过 pack.exportedAt / pack.project.students.length 展示已有信息。
 * 这里是只含时间、计数与可选画布摘要的兼容视图,不是完整工程包;需要工程包的操作必须调用 get(id)。
 */
export interface ProjectListItem extends ProjectMetadata {
  pack: {
    exportedAt: string;
    project: {
      students: { readonly length: number };
    };
  };
}

export function projectMetadata(project: StoredProject): ProjectMetadata {
  const preview = parseProjectPreview({
    canvasWidth: project.pack.project.canvas.width,
    canvasHeight: project.pack.project.canvas.height,
    dataView: project.pack.project.dataView,
  });
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    exportedAt: project.pack.exportedAt,
    studentCount: project.pack.project.students.length,
    assetCount: project.pack.assets.length,
    fontCount: project.pack.fonts.length,
    customTemplateCount: project.pack.customTemplates.length,
    ...(preview ? { preview } : {}),
  };
}

export function projectListItem(metadata: ProjectMetadata): ProjectListItem {
  return {
    ...metadata,
    ...(metadata.preview ? { preview: { ...metadata.preview } } : {}),
    pack: {
      exportedAt: metadata.exportedAt,
      project: { students: { length: metadata.studentCount } },
    },
  };
}

export function timestampOrEpoch(value: unknown): string {
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function parseCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const PREVIEW_DATA_VIEWS = new Set<DataViewId>(["province", "pins", "heat", "city", "university"]);
/** The editor currently caps canvas dimensions at 6000; invalid facts use the legacy fallback. */
const MAX_PREVIEW_DIMENSION = 6000;

function parseProjectPreview(value: unknown): ProjectPreviewMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const preview = value as Record<string, unknown>;
  const { canvasWidth, canvasHeight, dataView } = preview;
  if (typeof canvasWidth !== "number" || !Number.isFinite(canvasWidth) || canvasWidth < 1 || canvasWidth > MAX_PREVIEW_DIMENSION
    || typeof canvasHeight !== "number" || !Number.isFinite(canvasHeight) || canvasHeight < 1 || canvasHeight > MAX_PREVIEW_DIMENSION
    || typeof dataView !== "string" || !PREVIEW_DATA_VIEWS.has(dataView as DataViewId)) return undefined;
  return { canvasWidth, canvasHeight, dataView: dataView as DataViewId };
}

export function parseProjectMetadata(value: unknown): ProjectMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.exportedAt !== "string") return null;
  const studentCount = parseCount(record.studentCount);
  const assetCount = parseCount(record.assetCount);
  const fontCount = parseCount(record.fontCount);
  const customTemplateCount = parseCount(record.customTemplateCount);
  if (studentCount === null || assetCount === null || fontCount === null || customTemplateCount === null) return null;
  const preview = parseProjectPreview(record.preview);
  return {
    id: record.id,
    name: record.name,
    createdAt: timestampOrEpoch(record.createdAt),
    updatedAt: timestampOrEpoch(record.updatedAt),
    exportedAt: record.exportedAt,
    studentCount,
    assetCount,
    fontCount,
    customTemplateCount,
    ...(preview ? { preview } : {}),
  };
}

/** 旧版 projects 记录的轻量解析：升级时不反序列化其中可能很大的 base64 资源。 */
export function metadataFromStoredValue(value: unknown): ProjectMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const pack = record.pack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return null;
  const packageRecord = pack as Record<string, unknown>;
  const project = packageRecord.project;
  if (packageRecord.kind !== "cengfan-project-package" || !project || typeof project !== "object" || Array.isArray(project)) return null;
  const projectRecord = project as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || !Array.isArray(projectRecord.students)) return null;
  const canvas = projectRecord.canvas as { width?: unknown; height?: unknown } | null | undefined;
  const preview = parseProjectPreview({ canvasWidth: canvas?.width, canvasHeight: canvas?.height, dataView: projectRecord.dataView });
  return {
    id: record.id,
    name: record.name,
    createdAt: timestampOrEpoch(record.createdAt),
    updatedAt: timestampOrEpoch(record.updatedAt),
    exportedAt: timestampOrEpoch(packageRecord.exportedAt),
    studentCount: projectRecord.students.length,
    assetCount: Array.isArray(packageRecord.assets) ? packageRecord.assets.length : 0,
    fontCount: Array.isArray(packageRecord.fonts) ? packageRecord.fonts.length : 0,
    customTemplateCount: Array.isArray(packageRecord.customTemplates) ? packageRecord.customTemplates.length : 0,
    ...(preview ? { preview } : {}),
  };
}
