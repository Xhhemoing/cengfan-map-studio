import type { CustomTemplateRecord } from "./template-store";
import {
  MAX_TEMPLATE_PACK_BYTES,
  TemplatePackError,
  createTemplatePack,
  formatTemplatePackBytes,
  serializeTemplatePack,
  templatePackFilename,
  type TemplatePackErrorCode,
} from "./template-package";

/** Matches the custom template ceiling enforced by the editor's save path. */
export const CUSTOM_TEMPLATE_LIMIT = 20;

export interface TemplateDownloadResult {
  filename: string;
  bytes: number;
  /** True when the file exceeds the import ceiling, i.e. the receiver could not open it. */
  tooLargeToImport: boolean;
}

/**
 * Builds the exchange file and hands it to the browser. Both outbound gates run inside
 * `serializeTemplatePack`, so a failure throws before any Blob exists.
 */
export function downloadTemplatePack(input: {
  record: CustomTemplateRecord;
  author?: string;
  license?: string;
  now?: Date;
}): TemplateDownloadResult {
  const pack = createTemplatePack(input);
  const json = serializeTemplatePack(pack);
  const filename = templatePackFilename(pack);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return { filename, bytes: blob.size, tooLargeToImport: blob.size > MAX_TEMPLATE_PACK_BYTES };
}

/** Newest first, oldest dropped once the ceiling is reached (there is no delete-template UI yet). */
export function mergeImportedTemplate(
  existing: CustomTemplateRecord[],
  imported: CustomTemplateRecord,
  limit = CUSTOM_TEMPLATE_LIMIT,
): { next: CustomTemplateRecord[]; dropped: number } {
  const combined = [imported, ...existing];
  return { next: combined.slice(0, limit), dropped: Math.max(0, combined.length - limit) };
}

const FALLBACK_MESSAGES: Record<TemplatePackErrorCode, string> = {
  INVALID_JSON: "这个文件不是有效的 JSON。",
  NOT_TEMPLATE_PACK: "这不是蹭饭图模板文件。",
  PROJECT_PACKAGE_REJECTED: "这是工程包，请在「导入工程」处使用。",
  UNSUPPORTED_VERSION: "模板文件版本不受支持，请升级蹭饭图后再导入。",
  UNKNOWN_FIELD: "模板文件里有无法识别的字段。",
  COMMERCIAL_FIELD_REJECTED: "模板文件包含收费相关字段，已拒绝。",
  STUDENT_DATA_DETECTED: "模板文件里出现了学生名单字段，已拒绝。",
  TEMPLATE_INVALID: "模板文件的结构不完整。",
  FILE_TOO_LARGE: `模板文件超过 ${formatTemplatePackBytes(MAX_TEMPLATE_PACK_BYTES)} 上限。`,
};

/** Turns any failure into one sentence a class committee member can act on. Never leaks a stack. */
export function describeTemplatePackError(error: unknown): string {
  if (error instanceof TemplatePackError) {
    return error.message || FALLBACK_MESSAGES[error.code];
  }
  return "模板文件处理失败，请确认文件完整后重试。";
}
