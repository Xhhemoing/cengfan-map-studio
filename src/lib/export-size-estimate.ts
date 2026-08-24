/**
 * 导出体积预估。
 *
 * 导入侧对工程包与资源包都有 24MB 硬上限（见 `import-file-limits`），导出侧却从不预检。
 * 用户导出一份 30MB 的「备份」，要等到换设备导入的那一刻才发现文件永远收不回来。
 * 这里给导出前的对话框和下载函数提供同一套体积口径。
 *
 * 估算不真正拼出整份 JSON：素材与字体逐条量、其余部分整体量一次，误差只来自数组分隔符
 * 与缩进深度。相对 base64 负载可以忽略，宁可略微高估也不要放过真正超限的包。
 */
import { formatByteSize } from "./image-downscale";
import { MAX_PROJECT_PACKAGE_BYTES } from "./import-file-limits";

/** 数组里每条记录前后的逗号、换行与括号分摊。 */
const ARRAY_ENTRY_SEPARATOR_BYTES = 8;

/**
 * `assets` / `fonts` 是根对象的字段，条目落在第 2 层缩进上（每层 2 空格）。
 * 单独 `JSON.stringify` 一条素材只会按第 0 层排版，少算的正是这 4 个空格 × 行数。
 */
const RESOURCE_ENTRY_INDENT_BYTES = 4;

/**
 * 字符串按 UTF-8 落盘后的字节数。
 *
 * 体积闸门比的是 `File.size`（字节），而 `String.length` 数的是 UTF-16 码元：一个汉字
 * 算 1 却要占 3 字节。这里逐码元累加而不用 `TextEncoder`，避免为一份 20MB 的包再复制
 * 一份等长的 `Uint8Array`。
 */
export function utf8ByteLength(text: string): number {
  let bytes = text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) continue;
    if (code <= 0x7ff) {
      bytes += 1;
      continue;
    }
    // 代理对是两个码元共 4 字节，基数里已经算了 2。
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 2;
        index += 1;
        continue;
      }
    }
    bytes += 2;
  }
  return bytes;
}

/** 按导出器的排版（2 空格缩进）估算一个值序列化后的字节数。 */
export function estimateJsonBytes(value: unknown): number {
  const json = JSON.stringify(value, null, 2);
  return json === undefined ? 0 : utf8ByteLength(json);
}

/** 一条素材/字体记录在整份包里占的字节：本体 + 补上的缩进 + 分隔符。 */
function estimateResourceEntryBytes(value: unknown): number {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) return 0;
  let lines = 1;
  for (let index = 0; index < json.length; index += 1) {
    if (json.charCodeAt(index) === 10) lines += 1;
  }
  return utf8ByteLength(json) + lines * RESOURCE_ENTRY_INDENT_BYTES + ARRAY_ENTRY_SEPARATOR_BYTES;
}

export interface ExportSizeEstimate {
  /** 不含素材与字体时的体积，也就是取消勾选资源包后会落盘的大小。 */
  baseBytes: number;
  /** 素材与字体额外占用的体积。 */
  resourceBytes: number;
  /** 与导入闸门对齐的上限。 */
  limitBytes: number;
}

export function estimateExportSize(input: {
  /** 除素材与字体外的全部内容，例如 `{ project, customTemplates, renderSettings }`。 */
  rest: unknown;
  assets?: readonly unknown[];
  fonts?: readonly unknown[];
  limitBytes?: number;
}): ExportSizeEstimate {
  const countResources = (items: readonly unknown[] | undefined): number =>
    (items ?? []).reduce<number>((sum, item) => sum + estimateResourceEntryBytes(item), 0);
  return {
    // 导出器在 JSON 末尾还写了一个换行。
    baseBytes: estimateJsonBytes(input.rest) + 1,
    resourceBytes: countResources(input.assets) + countResources(input.fonts),
    limitBytes: input.limitBytes ?? MAX_PROJECT_PACKAGE_BYTES,
  };
}

export function exportSizeBytes(estimate: ExportSizeEstimate, includeResources: boolean): number {
  return includeResources ? estimate.baseBytes + estimate.resourceBytes : estimate.baseBytes;
}

export function isExportOverLimit(estimate: ExportSizeEstimate, includeResources: boolean): boolean {
  return exportSizeBytes(estimate, includeResources) > estimate.limitBytes;
}

/** 常态下的体积说明，勾选资源时单独点出资源占了多少。 */
export function describeExportSize(estimate: ExportSizeEstimate, includeResources: boolean): string {
  const total = formatByteSize(exportSizeBytes(estimate, includeResources));
  return includeResources && estimate.resourceBytes > 0
    ? `预计导出约 ${total}（其中资源包约 ${formatByteSize(estimate.resourceBytes)}）`
    : `预计导出约 ${total}`;
}

/** 超限说明，未超限返回 `null`。 */
export function describeExportSizeWarning(estimate: ExportSizeEstimate, includeResources: boolean): string | null {
  const total = exportSizeBytes(estimate, includeResources);
  if (total <= estimate.limitBytes) return null;
  const head = `预计导出约 ${formatByteSize(total)}，超过导入上限 ${formatByteSize(estimate.limitBytes)}，这份文件以后无法再导入回来。`;
  // 取消勾选资源就能回到上限内时，先给这条最省事的出路。
  if (includeResources && estimate.baseBytes <= estimate.limitBytes) {
    return `${head}建议取消勾选「包含资源包」，只导出约 ${formatByteSize(estimate.baseBytes)}的工程本体。`;
  }
  return `${head}请先精简名单、模板与素材后再导出。`;
}
