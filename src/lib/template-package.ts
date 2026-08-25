import { createId } from "./ids";
import type { MapTemplateId } from "./project-data";
import type { SceneDocument } from "./scene-document";
import type { TemplateDocument } from "./template-document";
import {
  sanitizeCustomTemplateRecord,
  type CustomTemplateRecord,
  type TemplateSaveScope,
} from "./template-store";

/** Identifier of the community template exchange format. */
export const TEMPLATE_PACK_KIND = "cengfan-template";
export const TEMPLATE_PACK_VERSION = 1 as const;
export const TEMPLATE_PACK_FILE_EXTENSION = ".cengfan-template";
/**
 * File picker filter. Deliberately excludes `.cengfan` / `.json` extensions so the template entry
 * never claims project packages (those carry a roster and belong to the project import entry).
 */
export const TEMPLATE_PACK_FILE_ACCEPT = ".cengfan-template,application/json";
/** Templates travel as plain JSON; anything larger is almost certainly an embedded photo dump. */
export const MAX_TEMPLATE_PACK_BYTES = 1024 * 1024;
export const TEMPLATE_PACK_LICENSE = "AGPL-3.0-only";
export const MAX_TEMPLATE_PACK_NAME_LENGTH = 60;
export const MAX_TEMPLATE_PACK_AUTHOR_LENGTH = 24;
export const MAX_TEMPLATE_PACK_LICENSE_LENGTH = 64;

/** Closed top-level schema: anything outside this list is a smuggling channel and gets rejected. */
export const TEMPLATE_PACK_TOP_LEVEL_KEYS = [
  "kind",
  "version",
  "exportedAt",
  "name",
  "author",
  "license",
  "baseTemplateId",
  "scope",
  "document",
  "scene",
] as const;

const PROJECT_PACKAGE_KIND = "cengfan-project-package";

export type TemplatePackErrorCode =
  | "INVALID_JSON"
  | "NOT_TEMPLATE_PACK"
  | "PROJECT_PACKAGE_REJECTED"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_FIELD"
  | "COMMERCIAL_FIELD_REJECTED"
  | "STUDENT_DATA_DETECTED"
  | "TEMPLATE_INVALID"
  | "FILE_TOO_LARGE";

export class TemplatePackError extends Error {
  constructor(readonly code: TemplatePackErrorCode, message: string) {
    super(message);
    this.name = "TemplatePackError";
  }
}

/** Scene without the guest panel: guest names would otherwise ride along into other people's posters. */
export type TemplatePackScene = Omit<SceneDocument, "guests">;

export interface TemplatePack {
  kind: typeof TEMPLATE_PACK_KIND;
  version: typeof TEMPLATE_PACK_VERSION;
  exportedAt: string;
  name: string;
  author?: string;
  license: string;
  baseTemplateId: MapTemplateId;
  scope: TemplateSaveScope;
  document: TemplateDocument;
  scene?: TemplatePackScene;
}

export interface TemplatePackImport {
  record: CustomTemplateRecord;
  author: string;
  license: string;
  exportedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampText(value: string, max: number): string {
  const codePoints = Array.from(value.trim().replace(/\s+/g, " "));
  return codePoints.length > max ? codePoints.slice(0, max).join("") : codePoints.join("");
}

/**
 * Commercial key screening. Prefixes cover the unambiguous stems; the exact list holds short words
 * that would otherwise collide with legitimate style keys (`displayFrame.order` is a real field).
 */
const COMMERCIAL_KEY_PREFIXES = /^(price|pricing|sku|payment|coupon|checkout|subscription|invoice|billing|purchase|settlement|refund)/i;
const COMMERCIAL_KEY_EXACT = new Set([
  "fee",
  "fees",
  "amount",
  "currency",
  "listed",
  "listing",
  "orderid",
  "pay",
  "paid",
  "vip",
  "plan",
]);
const COMMERCIAL_CJK = /价格|售价|定价|套餐|结算|手续费|支付|付费|订单|收费|会员费/;
const PRICE_LIKE_TEXT = /[¥$€￥]|\d+\s*(元|块|rmb|cny|usd)/i;
const STUDENT_KEY_IN_JSON = /"students"\s*:/;
const GUEST_KEY_IN_JSON = /"guests"\s*:/;

function isCommercialKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return COMMERCIAL_KEY_PREFIXES.test(normalized) || COMMERCIAL_KEY_EXACT.has(normalized) || COMMERCIAL_CJK.test(key);
}

/** Throws when any key anywhere in the value looks like a price / SKU / order field. */
export function assertNoCommercialFields(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoCommercialFields);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (isCommercialKey(key)) {
      throw new TemplatePackError(
        "COMMERCIAL_FIELD_REJECTED",
        `模板文件包含收费相关字段「${key}」，已拒绝。模板交换不含任何收费字段。`,
      );
    }
    assertNoCommercialFields(nested);
  }
}

/** Throws when any key anywhere in the value is `students`. Import rejects, it never strips-and-continues. */
export function assertNoStudentData(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoStudentData);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "students") {
      throw new TemplatePackError("STUDENT_DATA_DETECTED", "模板文件里出现了学生名单字段，已拒绝导入。");
    }
    assertNoStudentData(nested);
  }
}

function normalizeLicense(value: unknown): string {
  if (value === undefined || value === null) return TEMPLATE_PACK_LICENSE;
  if (typeof value !== "string") {
    throw new TemplatePackError("TEMPLATE_INVALID", "模板文件的许可证字段必须是文字。");
  }
  const license = clampText(value, MAX_TEMPLATE_PACK_LICENSE_LENGTH);
  if (!license) return TEMPLATE_PACK_LICENSE;
  if (PRICE_LIKE_TEXT.test(license) || COMMERCIAL_CJK.test(license)) {
    throw new TemplatePackError(
      "COMMERCIAL_FIELD_REJECTED",
      "许可证只能写授权条款，不能写价格。模板交换不含任何收费字段。",
    );
  }
  return license;
}

/** Copies only the known template document fields, so unknown top-level keys cannot ride along. */
function projectTemplateDocument(document: TemplateDocument): TemplateDocument {
  return {
    id: document.id,
    name: document.name,
    canvas: structuredClone(document.canvas),
    background: structuredClone(document.background),
    map: structuredClone(document.map),
    cards: structuredClone(document.cards),
    markers: structuredClone(document.markers),
    connectors: structuredClone(document.connectors),
    typography: structuredClone(document.typography),
    visibleFields: [...document.visibleFields],
    regionalAssets: structuredClone(document.regionalAssets),
  };
}

function projectScene(scene: SceneDocument): TemplatePackScene {
  return {
    canvas: structuredClone(scene.canvas),
    map: structuredClone(scene.map),
    cards: structuredClone(scene.cards),
    textElements: structuredClone(scene.textElements),
    assetElements: structuredClone(scene.assetElements),
  };
}

export function createTemplatePack(input: {
  record: CustomTemplateRecord;
  author?: string;
  license?: string;
  now?: Date;
}): TemplatePack {
  const sanitized = sanitizeCustomTemplateRecord(input.record);
  if (!sanitized) {
    throw new TemplatePackError("TEMPLATE_INVALID", "这个模板的结构不完整，无法导出。");
  }
  // Screened before the whitelist projection so a commercial field aborts loudly instead of being dropped.
  assertNoCommercialFields(sanitized);
  const author = clampText(input.author ?? "", MAX_TEMPLATE_PACK_AUTHOR_LENGTH);
  const pack: TemplatePack = {
    kind: TEMPLATE_PACK_KIND,
    version: TEMPLATE_PACK_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    name: clampText(sanitized.name, MAX_TEMPLATE_PACK_NAME_LENGTH) || "未命名模板",
    ...(author ? { author } : {}),
    license: normalizeLicense(input.license),
    baseTemplateId: sanitized.baseTemplateId,
    scope: sanitized.scope,
    document: projectTemplateDocument(sanitized.document),
    ...(sanitized.scene ? { scene: projectScene(sanitized.scene) } : {}),
  };
  assertNoCommercialFields(pack);
  return pack;
}

/** Serializes a pack and runs the outbound gates. Callers must never build a Blob from anything else. */
export function serializeTemplatePack(pack: TemplatePack): string {
  const json = `${JSON.stringify(pack, null, 2)}\n`;
  if (STUDENT_KEY_IN_JSON.test(json)) {
    throw new TemplatePackError("STUDENT_DATA_DETECTED", "导出被中止：模板中检测到学生名单字段。");
  }
  if (GUEST_KEY_IN_JSON.test(json)) {
    throw new TemplatePackError("STUDENT_DATA_DETECTED", "导出被中止：模板中检测到嘉宾名单字段。");
  }
  assertNoCommercialFields(pack);
  return json;
}

function describeVersion(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `v${value}`;
  if (typeof value === "string") return `「${value}」`;
  return "未知";
}

function assertClosedSchema(value: Record<string, unknown>): void {
  const allowed = new Set<string>(TEMPLATE_PACK_TOP_LEVEL_KEYS);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new TemplatePackError(
      "UNKNOWN_FIELD",
      `模板文件里有无法识别的字段：${unknown.join("、")}。为了安全，这类文件不会被导入。`,
    );
  }
}

export function parseTemplatePack(raw: string, options?: { now?: Date }): TemplatePackImport {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new TemplatePackError("INVALID_JSON", "这个文件不是有效的 JSON，可能在传输中被压缩或改名了。");
  }
  if (!isRecord(value)) {
    throw new TemplatePackError("NOT_TEMPLATE_PACK", "这不是蹭饭图模板文件（.cengfan-template）。");
  }
  if (value.kind === PROJECT_PACKAGE_KIND) {
    throw new TemplatePackError(
      "PROJECT_PACKAGE_REJECTED",
      "这是蹭饭图工程包，里面含名单。请在「导入工程」处使用；模板通道不接收工程包。",
    );
  }
  if (value.kind !== TEMPLATE_PACK_KIND) {
    throw new TemplatePackError("NOT_TEMPLATE_PACK", "这不是蹭饭图模板文件（.cengfan-template）。");
  }
  if (value.version !== TEMPLATE_PACK_VERSION) {
    throw new TemplatePackError(
      "UNSUPPORTED_VERSION",
      `模板文件版本是 ${describeVersion(value.version)}，当前只能读取 v${TEMPLATE_PACK_VERSION}；请升级蹭饭图后再导入。`,
    );
  }

  assertNoStudentData(value);
  assertNoCommercialFields(value);
  assertClosedSchema(value);

  const name = typeof value.name === "string" ? clampText(value.name, MAX_TEMPLATE_PACK_NAME_LENGTH) : "";
  if (!name) {
    throw new TemplatePackError("TEMPLATE_INVALID", "模板文件缺少名称，无法导入。");
  }
  const hasScene = value.scene !== undefined && value.scene !== null;
  const candidate = {
    id: createId("custom"),
    name,
    baseTemplateId: value.baseTemplateId,
    scope: value.scope,
    document: value.document,
    // Guests are dropped here and rebuilt empty by normalizeScene inside the sanitizer.
    scene: isRecord(value.scene) ? projectScene(value.scene as unknown as SceneDocument) : undefined,
    createdAt: (options?.now ?? new Date()).toISOString(),
  };
  const record = sanitizeCustomTemplateRecord(candidate);
  if (!record) {
    throw new TemplatePackError("TEMPLATE_INVALID", "模板文件的结构不完整（版式或配色字段缺失），无法导入。");
  }
  if (hasScene && !record.scene) {
    throw new TemplatePackError("TEMPLATE_INVALID", "模板文件里的画布场景结构不完整，无法导入。");
  }
  if (record.scene) {
    record.scene = { ...record.scene, guests: { ...record.scene.guests, customText: undefined, people: [] } };
  }

  return {
    record,
    author: typeof value.author === "string" ? clampText(value.author, MAX_TEMPLATE_PACK_AUTHOR_LENGTH) : "",
    license: normalizeLicense(value.license),
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
  };
}

export function formatTemplatePackBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export async function readTemplatePackFile(file: File, options?: { now?: Date }): Promise<TemplatePackImport> {
  if (file.size > MAX_TEMPLATE_PACK_BYTES) {
    throw new TemplatePackError(
      "FILE_TOO_LARGE",
      `模板文件 ${formatTemplatePackBytes(file.size)} 超过 ${formatTemplatePackBytes(MAX_TEMPLATE_PACK_BYTES)} 上限，通常是背景图太大。`,
    );
  }
  return parseTemplatePack(await file.text(), options);
}

export function templatePackFilename(pack: TemplatePack): string {
  const safeName = clampText(pack.name.replace(/[/\\:*?"<>|]/g, "-"), MAX_TEMPLATE_PACK_NAME_LENGTH) || "模板";
  const day = pack.exportedAt.slice(0, 10);
  return `${safeName}-${day}${TEMPLATE_PACK_FILE_EXTENSION}`;
}
