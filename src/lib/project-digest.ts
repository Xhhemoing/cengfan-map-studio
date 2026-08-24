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
 * 两层都会写出 `layer` 与全部 `*Count`，模型据此区分「本来就没有」与「被裁掉了」。
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
  /**
   * 本次投影所属分层，两层都写出。模型看到 `"core"` 就知道明细数组是被整段裁掉的，
   * 空数组只代表「本层没投影」，要读明细必须调 inspect_project。
   */
  layer: ProjectDigestLayer;
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
    /**
     * 画布上求解出的卡片块总数，不受任何裁剪影响（topProvinces 前 10 之外的、
     * 国际组、core 层清空、预算截断都仍计入）。`cardBlocks.length < cardBlockCount`
     * 即「有卡但明细没投影」，`cardBlockCount === 0` 才是真的一张卡都没有。
     */
    cardBlockCount: number;
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

/** 单张目的地卡片在画布上的实际方位；按 province 与 students.topProvinces 对齐（同省可有多块）。 */
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
 * 模型看到的方位与用户看到的一致（手工位置优先）。分组不是省份时按卡片首个学生的省份对齐。
 *
 * city / university 分组下同一省份会落出多张卡（浙江省名下的杭州、宁波各一张），
 * 所以每个 topProvince 投影它名下的全部卡片、按省份连续排列；条数上限沿用
 * `DIGEST_ELEMENT_LIMIT`，预算上限仍由 `shrinkToBudget` 兜底。province 分组下
 * 每省本来就只有一组，投影结果与按省一块时逐条相同。
 *
 * 回滚：把 `cardBlocks` 换回「按 topProvinces 取每省第一块」的 flatMap 并删掉
 * `takeCardBlocks` 即可。字段形状（含 cardBlockCount）未变，`shrinkToBudget`、
 * core 层裁剪与 agent 提示词都不需要同步改动，也不影响已存的会话。
 */
function buildLayoutSection(
  project: ProjectDocument,
  topProvinces: readonly { province: string }[],
): ProjectDigest["layout"] {
  const cached = layoutSectionCache.get(project);
  if (cached) return cached;
  const facts = buildRenderFacts(project);
  const placements = new Map(facts.placements.map((placement) => [placement.id, effectiveCardPlacement(project, placement)]));
  const blocksByProvince = new Map<string, DigestCardBlock[]>();
  for (const fact of facts.cards) {
    if (fact.isInternational) continue;
    const placement = placements.get(fact.group.key);
    if (!placement) continue;
    const province = fact.province || "未知";
    const block: DigestCardBlock = {
      province,
      id: shortText(fact.group.key),
      x: Math.round(placement.x),
      y: Math.round(placement.y),
      w: Math.round(placement.width),
      h: Math.round(placement.height),
      side: placement.side,
    };
    const existing = blocksByProvince.get(province);
    if (existing) existing.push(block);
    else blocksByProvince.set(province, [block]);
  }
  const layout: ProjectDigest["layout"] = {
    mapContentBounds: roundRect(facts.geometry.mapContentBounds),
    // 总数取求解出的全部方位块，与下面按 topProvinces 对齐的样本无关，裁剪也不会改它。
    cardBlockCount: placements.size,
    cardBlocks: takeCardBlocks(topProvinces, blocksByProvince, DIGEST_ELEMENT_LIMIT),
  };
  layoutSectionCache.set(project, layout);
  return layout;
}

/**
 * 条数配额按轮发放：第 n 轮依 topProvinces 顺序各取该省第 n 张卡，取满 `limit` 即止，
 * 最后再按省份归拢成连续块输出。轮转是为了让「一个省几十张城市卡」不会把靠后的省份
 * 整省挤出投影——每省先各拿到一块，富余额度才给多卡省份。
 */
function takeCardBlocks(
  topProvinces: readonly { province: string }[],
  blocksByProvince: ReadonlyMap<string, DigestCardBlock[]>,
  limit: number,
): DigestCardBlock[] {
  const buckets = topProvinces.map(({ province }) => blocksByProvince.get(province) ?? []);
  const quotas = buckets.map(() => 0);
  const maxRounds = Math.max(0, ...buckets.map((bucket) => bucket.length));
  let taken = 0;
  for (let round = 0; round < maxRounds && taken < limit; round += 1) {
    for (let index = 0; index < buckets.length && taken < limit; index += 1) {
      if (quotas[index]! >= buckets[index]!.length) continue;
      quotas[index] += 1;
      taken += 1;
    }
  }
  return buckets.flatMap((bucket, index) => bucket.slice(0, quotas[index]));
}

/**
 * core 层裁剪：字段形状与 full 完全一致，只把明细清空，
 * 消费者仍可按 `textElements.length` / `layout.cardBlocks` 读取而不必判空。
 * 计数字段（layer / cardBlockCount / textElementCount / assetElementCount / students.total）
 * 全部保留——它们正是模型区分「本来就没有」与「明细被裁」的唯一依据。
 */
function toCoreLayer(digest: ProjectDigest): ProjectDigest {
  return {
    ...digest,
    layer: "core",
    layout: { ...digest.layout, cardBlocks: [] },
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
    layer: "full",
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
 *
 * `layer` 与各 `*Count`（含 layout.cardBlockCount）永远不参与裁剪，
 * 否则模型无法把「预算裁掉的明细」与「本来就是空的」区分开。
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
