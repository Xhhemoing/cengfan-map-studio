import type { CardSide } from "./card-layout";
import { duplicateStudentIds, findDuplicateStudentGroups } from "./data-duplicate";
import type { ProjectDocument } from "./project-document";
import { buildProvinceSummary } from "./project-data";
import { buildRenderFacts, effectiveCardPlacement } from "./render-facts";

export const DIGEST_MAX_BYTES = 8 * 1024;
export const DIGEST_TEXT_LIMIT = 40;
/** 每类画布元素默认最多投影多少条；总数另用 *Count 字段告知模型。 */
export const DIGEST_ELEMENT_LIMIT = 30;

/**
 * digest 分层。
 * - `"full"`：历史行为，明细（卡片方位、文本/素材样本）全部投影，首轮建立上下文用。
 * - `"core"`：只留统计与关键几何（canvas/map/cards、students 计数与 topProvinces、
 *   layout.mapContentBounds、guests 计数、text/asset 的 *Count），明细整段截断，
 *   续聊时工程未变可用它替代整包投影。
 *
 * 回滚：删掉 `BuildProjectDigestOptions`、`toCoreLayer` 与 `buildProjectDigest` 的第二个参数，
 * 只保留 full 分支即可；调用方不传参时行为与分层前完全一致，无需同步改动。
 */
export type ProjectDigestLayer = "full" | "core";

export interface BuildProjectDigestOptions {
  /** 缺省 `"full"`，保持分层前的字段与行为。 */
  layer?: ProjectDigestLayer;
}

export interface ProjectDigest {
  canvas: {
    width: number;
    height: number;
    safeMargin: number;
    backgroundColor: string;
  };
  map: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    fillMode?: string;
    customProvinceStyles: string[];
  };
  cards: {
    preset: string;
    grouping: string;
    layoutMode?: string;
    visibleFields: string[];
    x: number;
    y: number;
    maxWidth: number;
    columns: number | "auto";
    fontSize: number;
    gap: number;
    hasManualPositions: boolean;
    manualPositionCount: number;
  };
  /** 渲染真值的投影：与画布同一次求解得到的地图内容框与卡片实际方位。 */
  layout: {
    mapContentBounds: DigestRect;
    cardBlocks: DigestCardBlock[];
  };
  guests: {
    title: string;
    visibility: boolean;
    peopleCount: number;
  };
  textElementCount: number;
  assetElementCount: number;
  textElements: Array<{
    id: string;
    role: string;
    content: string;
    x: number;
    y: number;
    fontSize: number;
    visibility: boolean;
  }>;
  assetElements: Array<{
    id: string;
    assetId: string;
    label: string;
    kind: string;
    src: string;
    width: number;
    height: number;
    visibility: boolean;
  }>;
  students: {
    total: number;
    hidden: number;
    topProvinces: Array<{ province: string; count: number }>;
    duplicateGroups: number;
    duplicateStudentCount: number;
  };
}

export interface DigestRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 单张目的地卡片在画布上的实际方位；与 students.topProvinces 逐条对齐。 */
export interface DigestCardBlock {
  province: string;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  side: CardSide;
}

function shortText(value: string, limit = DIGEST_TEXT_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function assetRef(id: string, src: string): string {
  if (!src) return "";
  if (!src.startsWith("data:")) return shortText(src, 100);
  return `<asset:${id}>`;
}

function roundRect(rect: { x: number; y: number; width: number; height: number }): DigestRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

const layoutSectionCache = new WeakMap<ProjectDocument, ProjectDigest["layout"]>();

/**
 * 版面真值的投影：地图内容框与卡片方位都取自画布同一份 `buildRenderFacts`，
 * 模型看到的方位与用户看到的一致（手工位置优先）。每个 topProvince 至多一块，
 * 分组不是省份时按卡片首个学生的省份对齐。
 */
function buildLayoutSection(
  project: ProjectDocument,
  topProvinces: readonly { province: string }[],
): ProjectDigest["layout"] {
  const cached = layoutSectionCache.get(project);
  if (cached) return cached;
  const facts = buildRenderFacts(project);
  const placements = new Map(facts.placements.map((placement) => [placement.id, effectiveCardPlacement(project, placement)]));
  const layout: ProjectDigest["layout"] = {
    mapContentBounds: roundRect(facts.geometry.mapContentBounds),
    cardBlocks: topProvinces.flatMap(({ province }): DigestCardBlock[] => {
      const fact = facts.cards.find((card) => !card.isInternational && (card.province || "未知") === province);
      const placement = fact ? placements.get(fact.group.key) : undefined;
      if (!fact || !placement) return [];
      return [{
        province,
        id: shortText(fact.group.key),
        x: Math.round(placement.x),
        y: Math.round(placement.y),
        w: Math.round(placement.width),
        h: Math.round(placement.height),
        side: placement.side,
      }];
    }),
  };
  layoutSectionCache.set(project, layout);
  return layout;
}

/**
 * core 层裁剪：字段形状与 full 完全一致，只把明细清空，
 * 消费者仍可按 `textElements.length` / `layout.cardBlocks` 读取而不必判空。
 * 计数字段（textElementCount / assetElementCount / students.total）不受影响。
 */
function toCoreLayer(digest: ProjectDigest): ProjectDigest {
  return {
    ...digest,
    layout: { mapContentBounds: digest.layout.mapContentBounds, cardBlocks: [] },
    textElements: [],
    assetElements: [],
  };
}

/**
 * Build the only project representation sent to the model. Binary/data URLs
 * are replaced by stable references and student rows are reduced to counts.
 *
 * `options.layer` 选择投影分层，缺省 `"full"`；无论哪一层都仍走 `shrinkToBudget`，
 * 因此 `DIGEST_MAX_BYTES` 上限对两层同时生效。
 */
export function buildProjectDigest(project: ProjectDocument, options: BuildProjectDigestOptions = {}): ProjectDigest {
  const layer = options.layer ?? "full";
  const provinceSummary = buildProvinceSummary(project.students);
  const topProvinces = provinceSummary.slice(0, 10).map(({ province, count }) => ({ province, count }));
  const duplicateGroups = findDuplicateStudentGroups(project.students);
  const duplicateStudentCount = duplicateStudentIds(project.students).size;
  const full: ProjectDigest = {
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      safeMargin: project.canvas.safeMargin,
      backgroundColor: project.canvas.backgroundColor,
    },
    map: {
      x: project.map.x,
      y: project.map.y,
      width: project.map.width,
      height: project.map.height,
      scale: project.map.scale,
      fillMode: project.map.fillMode,
      customProvinceStyles: Object.keys(project.map.provinceStyles ?? {}),
    },
    cards: {
      preset: project.cards.preset,
      grouping: project.cards.grouping,
      layoutMode: project.cards.layoutMode,
      visibleFields: [...project.cards.visibleFields],
      x: project.cards.x,
      y: project.cards.y,
      maxWidth: project.cards.maxWidth,
      columns: project.cards.columns,
      fontSize: project.cards.fontSize,
      gap: project.cards.gap,
      hasManualPositions: Object.keys(project.cards.positions ?? {}).length > 0,
      manualPositionCount: Object.keys(project.cards.positions ?? {}).length,
    },
    layout: buildLayoutSection(project, topProvinces),
    guests: {
      title: shortText(project.guests.title),
      visibility: project.guests.visibility,
      peopleCount: project.guests.people.length,
    },
    textElementCount: project.textElements.length,
    assetElementCount: project.assetElements.length,
    textElements: project.textElements.slice(0, DIGEST_ELEMENT_LIMIT).map((text) => ({
      id: text.id,
      role: text.role,
      content: shortText(text.content),
      x: text.x,
      y: text.y,
      fontSize: text.fontSize,
      visibility: text.visibility,
    })),
    assetElements: project.assetElements.slice(0, DIGEST_ELEMENT_LIMIT).map((asset) => ({
      id: asset.id,
      assetId: asset.assetId,
      label: shortText(asset.label),
      kind: asset.kind,
      src: assetRef(asset.id, asset.src),
      width: asset.width,
      height: asset.height,
      visibility: asset.visibility,
    })),
    students: {
      total: project.students.length,
      hidden: project.students.filter((student) => student.visibility === false).length,
      topProvinces,
      duplicateGroups: duplicateGroups.length,
      duplicateStudentCount,
    },
  };
  return shrinkToBudget(layer === "core" ? toCoreLayer(full) : full);
}

/**
 * Keep the projection inside the network budget even for huge canvases: element
 * samples go first, then card blocks, then the province tail. Card blocks are
 * dropped before the provinces they align with, and every total plus the map
 * content box survives.
 */
function shrinkToBudget(digest: ProjectDigest): ProjectDigest {
  const current = {
    ...digest,
    textElements: [...digest.textElements],
    assetElements: [...digest.assetElements],
    layout: { ...digest.layout, cardBlocks: [...digest.layout.cardBlocks] },
    students: { ...digest.students, topProvinces: [...digest.students.topProvinces] },
  };
  while (digestByteLength(current) > DIGEST_MAX_BYTES && (current.textElements.length > 0 || current.assetElements.length > 0)) {
    if (current.assetElements.length >= current.textElements.length) current.assetElements.pop();
    else current.textElements.pop();
  }
  while (digestByteLength(current) > DIGEST_MAX_BYTES && current.layout.cardBlocks.length > 0) {
    current.layout.cardBlocks.pop();
  }
  while (digestByteLength(current) > DIGEST_MAX_BYTES && current.students.topProvinces.length > 0) {
    current.students.topProvinces.pop();
  }
  return current;
}

const LONG_DATA_URL_THRESHOLD = 1024;

function canonicalString(value: string): string {
  if (!value.startsWith("data:") || value.length <= LONG_DATA_URL_THRESHOLD) return JSON.stringify(value);
  return JSON.stringify(`<data-url:length=${value.length};${hash32(value).toString(16).padStart(8, "0")}>`);
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return canonicalString(value);
  if (typeof value === "number") {
    if (Object.is(value, -0)) return "-0";
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fingerprintHash(value: string): string {
  return `fnv1a32:${hash32(value).toString(16).padStart(8, "0")}`;
}

/**
 * Fingerprint every executable project field while excluding undo/redo history.
 * The canonical form makes the result independent of object insertion order.
 */
const projectFingerprintCache = new WeakMap<ProjectDocument, string>();

export function fingerprintProject(project: ProjectDocument): string {
  const cached = projectFingerprintCache.get(project);
  if (cached) return cached;
  const { history: _history, ...executableProject } = project;
  const fingerprint = fingerprintHash(stableSerialize(executableProject));
  projectFingerprintCache.set(project, fingerprint);
  return fingerprint;
}

export const buildProjectFingerprint = fingerprintProject;

/**
 * digest 的短哈希：先做稳定规范化（对象键排序后序列化，长 data URL 折叠成长度+哈希），
 * 再取 FNV-1a。纯函数——同内容必然同指纹，键序不同不影响结果，任一字段（如 map.scale）
 * 变化都会改变指纹。服务端切片可据此判断“工程未变，可跳过整包投影”。
 */
export function digestFingerprint(digest: ProjectDigest): string {
  return fingerprintHash(stableSerialize(digest));
}

export function digestByteLength(digest: ProjectDigest): number {
  return new TextEncoder().encode(JSON.stringify(digest)).byteLength;
}
