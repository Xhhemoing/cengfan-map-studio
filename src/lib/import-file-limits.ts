/**
 * Hard byte ceilings for the file-based import entries.
 *
 * 表格与工程包都是「先整份读进内存、再同步 parse」的入口：`XLSX.read` 和
 * `JSON.parse` 都跑在主线程上，一份几百 MB 的文件足以把标签页冻死到用户
 * 只能强制关闭。图片入口已有 `image-downscale` 的预算做兜底，这里补上表格
 * 与工程包：超限的文件连读都不读，直接给出可行动的中文说明。
 */
import { formatByteSize } from "./image-downscale";

/** Excel / CSV 名单。按 5 万行 × 10 列的粗估留足余量，仍能挡住误传的视频或数据库导出。 */
export const MAX_SPREADSHEET_IMPORT_BYTES = 12 * 1024 * 1024;

/** 工程包是 JSON，里面的素材与字体都是 base64，所以上限比表格宽一档。 */
export const MAX_PROJECT_PACKAGE_BYTES = 24 * 1024 * 1024;

export interface ImportSizeLimit {
  /** 用户看得懂的入口名称，例如「表格文件」。 */
  label: string;
  limitBytes: number;
  /** 超限时告诉用户下一步能做什么。 */
  advice: string;
}

export const SPREADSHEET_IMPORT_LIMIT: ImportSizeLimit = {
  label: "表格文件",
  limitBytes: MAX_SPREADSHEET_IMPORT_BYTES,
  advice: "请拆分成多份或删掉图片、批注等无关内容后再导入",
};

export const PROJECT_PACKAGE_IMPORT_LIMIT: ImportSizeLimit = {
  label: "工程包",
  limitBytes: MAX_PROJECT_PACKAGE_BYTES,
  advice: "请在导出时取消勾选「工程包包含资源」，或先精简素材与字体后重新导出",
};

/**
 * 返回超限说明，未超限返回 `null`。调用方拿到非空字符串就必须直接放弃读取，
 * 不要再 `arrayBuffer()` / `readAsText()`。
 */
export function checkImportFileSize(file: File | null | undefined, limit: ImportSizeLimit): string | null {
  if (!file) return null;
  const bytes = Number.isFinite(file.size) ? file.size : 0;
  if (bytes <= limit.limitBytes) return null;
  return `${limit.label}过大（${formatByteSize(bytes)}），上限 ${formatByteSize(limit.limitBytes)}，${limit.advice}`;
}
