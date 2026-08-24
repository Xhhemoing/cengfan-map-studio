/**
 * CSV 文本解码。
 *
 * 国内教务系统与中文版 Excel 导出的 CSV 多为 GBK/GB2312 编码，按 UTF-8 硬解会把
 * 「学生姓名」读成乱码；乱码表头认不出必填列，整份名单要么被当成无表头数据回退，
 * 要么带着乱码列进候选，用户在预览里才发现。所以先用 fatal 的 UTF-8 试解，
 * 明确失败后再按 GB18030 兜底（GB18030 是 GBK/GB2312 的超集）。
 */

export type CsvEncoding = "utf-8" | "gb18030";

export interface CsvDecodeResult {
  text: string;
  /** 实际生效的编码，调用方可据此提示用户。 */
  encoding: CsvEncoding;
}

const CSV_MIME_TYPES = new Set(["text/csv", "application/csv", "text/comma-separated-values"]);

/** 只有 CSV 这类纯文本才需要自己解码；xlsx/xls 是二进制容器，仍交给 xlsx 按字节读。 */
export function isCsvFile(file: { name?: string; type?: string } | null | undefined): boolean {
  if (!file) return false;
  if (/\.csv$/i.test(file.name ?? "")) return true;
  return CSV_MIME_TYPES.has((file.type ?? "").trim().toLowerCase());
}

function toBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

export function decodeCsvBytes(input: ArrayBuffer | ArrayBufferView): CsvDecodeResult {
  const bytes = toBytes(input);
  try {
    // fatal 是关键：非 fatal 的 UTF-8 解码永远成功，只会把 GBK 字节换成替换字符，
    // 那样就永远走不到 GB18030 分支。前导 BOM 由解码器自行吃掉。
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return decodeAsGb18030(bytes);
  }
}

function decodeAsGb18030(bytes: Uint8Array): CsvDecodeResult {
  try {
    return { text: new TextDecoder("gb18030").decode(bytes), encoding: "gb18030" };
  } catch {
    // 运行环境没带 GB18030 解码表（如精简 ICU 构建）时退回宽松 UTF-8：
    // 留替换字符总好过整份文件读不进来。
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
  }
}
