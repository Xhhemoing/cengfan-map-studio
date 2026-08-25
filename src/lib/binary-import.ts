import { parseStudentText, type ImportCandidate, type TextImportResult, type UnparsedLine } from "./import-data";
import {
  describeStudentColumns,
  HEADER_ALIASES,
  REQUIRED_COLUMNS,
  type StudentColumn,
} from "./student-columns";

export { describeHeaderAliases, describeStudentColumns, STUDENT_COLUMN_LABELS, type StudentColumn } from "./student-columns";

export interface ExcelColumnMapping {
  field: StudentColumn;
  sourceHeader: string;
  columnIndex: number;
  samples: string[];
}

export interface ExcelImportResult extends TextImportResult {
  headerRowIndex?: number;
  columnMappings: ExcelColumnMapping[];
  unmappedHeaders: string[];
  missingRequiredFields: Array<Extract<StudentColumn, "name" | "university" | "city">>;
}

export interface ImportTemplateSheets {
  data: string[][];
  guide: string[][];
}

export function createImportTemplateSheets(): ImportTemplateSheets {
  return {
    data: [
      ["学生姓名", "录取院校", "城市", "去向类型"],
      ["", "", "", ""],
    ],
    guide: [
      ["字段", "必填", "示例"],
      ["学生姓名", "是", "林舟"],
      ["录取院校", "是", "北京大学"],
      ["城市", "是", "北京市"],
      ["去向类型", "否", "中国去向 / 海外去向"],
      ["填写说明", "", "去向类型留空时按中国去向处理"],
    ],
  };
}

/** 认到几列才算表头行：一列命中太容易被普通数据行碰上，两列起才当表头。 */
const MIN_HEADER_SCORE = 2;
/** 表头扫描窗口：只看前 8 个非空行，避免把靠后的数据行误当表头。 */
const HEADER_SCAN_ROWS = 8;
/** 每列最多取两个代表值即可停止扫描，10k 行的表也不会为了取样把整表走满四遍。 */
const MAX_COLUMN_SAMPLES = 2;

const MISSING_HEADER_COLUMNS_REASON = "表头缺少必填列";
const MISSING_ROW_FIELDS_REASON = "缺少必填字段";
/** 表头掉到扫描窗口之外时的兜底：这行不是学生，但也不能当成解析成功悄悄吃掉。 */
const LATE_HEADER_REASON = `疑似表头行（超出前 ${HEADER_SCAN_ROWS} 行表头扫描范围）`;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/\s|_|-|\(|\)|（|）/g, "");
}

function findColumnIndexes(header: string[]): Partial<Record<StudentColumn, number>> {
  const indexes: Partial<Record<StudentColumn, number>> = {};
  for (const column of Object.keys(HEADER_ALIASES) as StudentColumn[]) {
    const aliases = HEADER_ALIASES[column].map(normalizeHeader);
    const index = header.findIndex((cell) => aliases.includes(normalizeHeader(cell)));
    if (index >= 0) indexes[column] = index;
  }
  return indexes;
}

/** 单元格可能是数字或公式求值结果，统一按字符串处理后再判空。 */
function toRowCells(row: readonly unknown[] | undefined): string[] {
  return (row ?? []).map((cell) => String(cell ?? "").trim());
}

function rowRawLine(cells: string[]): string {
  return cells.filter(Boolean).join("\t");
}

/** 无表头回退时按列位还原整行：保留中间空单元格，只截掉行尾的空列。 */
function rowFallbackLine(cells: string[]): string {
  const lastFilled = cells.reduce((last, cell, index) => (cell ? index : last), -1);
  return lastFilled < 0 ? "" : cells.slice(0, lastFilled + 1).join("\t");
}

function emptyMetadata(): Pick<ExcelImportResult, "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> {
  return {
    columnMappings: [],
    unmappedHeaders: [],
    missingRequiredFields: [],
  };
}

interface HeaderRow {
  rowIndex: number;
  headers: string[];
  indexes: Partial<Record<StudentColumn, number>>;
}

function findHeaderRow(rows: string[][]): HeaderRow | null {
  let best: (HeaderRow & { score: number }) | null = null;
  let scanned = 0;
  // 扫满 8 个非空行就收手：整表 map 一遍只为取前 8 行，10k 行的表会白走一整趟。
  for (let rowIndex = 0; rowIndex < rows.length && scanned < HEADER_SCAN_ROWS; rowIndex += 1) {
    const headers = toRowCells(rows[rowIndex]);
    if (!headers.some(Boolean)) continue;
    scanned += 1;
    const indexes = findColumnIndexes(headers);
    const score = Object.keys(indexes).length;
    if (score < MIN_HEADER_SCORE || (best && score <= best.score)) continue;
    best = { rowIndex, headers, indexes, score };
  }
  return best ? { rowIndex: best.rowIndex, headers: best.headers, indexes: best.indexes } : null;
}

function collectSamples(rows: string[][], startRowIndex: number, columnIndex: number): string[] {
  const samples: string[] = [];
  for (let index = startRowIndex; index < rows.length && samples.length < MAX_COLUMN_SAMPLES; index += 1) {
    const value = String(rows[index]?.[columnIndex] ?? "").trim();
    if (value) samples.push(value);
  }
  return samples;
}

function createMetadata(
  rows: string[][],
  header: HeaderRow,
): Pick<ExcelImportResult, "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> {
  const mappedIndexes = new Set<number>();
  const columnMappings = (Object.keys(HEADER_ALIASES) as StudentColumn[]).flatMap((field) => {
    const columnIndex = header.indexes[field];
    if (columnIndex === undefined) return [];
    mappedIndexes.add(columnIndex);
    return [{
      field,
      sourceHeader: header.headers[columnIndex] ?? "",
      columnIndex,
      samples: collectSamples(rows, header.rowIndex + 1, columnIndex),
    }];
  });
  // 重复表头只有第一列会被采用，其余同名列落进「未使用」，用户能在识别面板里看到。
  const unmappedHeaders = header.headers.filter((value, index) => value && !mappedIndexes.has(index));
  const missingRequiredFields = REQUIRED_COLUMNS.filter((field) => header.indexes[field] === undefined);
  return {
    headerRowIndex: header.rowIndex,
    columnMappings,
    unmappedHeaders,
    missingRequiredFields: [...missingRequiredFields],
  };
}

function parseLocationScope(value: string | undefined): "international" | undefined {
  const normalized = value?.trim().toLocaleLowerCase("zh-CN") ?? "";
  return normalized.includes("海外") || normalized.includes("international") || normalized.includes("overseas")
    ? "international"
    : undefined;
}

interface SheetRow {
  sourceLine: number;
  cells: string[];
}

/** 表格行号统一按 1 基：第 n 行就是用户在 Excel 里看到的第 n 行。 */
function collectNonEmptyRows(rows: string[][], startRowIndex = 0): SheetRow[] {
  const entries: SheetRow[] = [];
  for (let index = startRowIndex; index < rows.length; index += 1) {
    const cells = toRowCells(rows[index]);
    if (cells.some(Boolean)) entries.push({ sourceLine: index + 1, cells });
  }
  return entries;
}

/**
 * 认不出表头时的回退：按列位拼成文本交给 `parseStudentText`，
 * 再把它按文本行号给出的 `sourceLine` 映射回真实表格行号，
 * 否则用户拿到的行号在原表里根本对不上。
 */
function parseWithoutHeader(rows: string[][]): TextImportResult {
  const lateHeaders: UnparsedLine[] = [];
  const dataRows: SheetRow[] = [];
  for (const entry of collectNonEmptyRows(rows)) {
    if (Object.keys(findColumnIndexes(entry.cells)).length >= MIN_HEADER_SCORE) {
      // 表头在扫描窗口之外：当成数据行会造出一个叫「姓名」的学生，宁可报出来。
      lateHeaders.push({ sourceLine: entry.sourceLine, rawLine: rowRawLine(entry.cells), reason: LATE_HEADER_REASON });
      continue;
    }
    dataRows.push(entry);
  }

  const parsed = parseStudentText(dataRows.map(({ cells }) => rowFallbackLine(cells)).join("\n"));
  const sheetLine = (textLine: number): number => dataRows[textLine - 1]?.sourceLine ?? textLine;
  return {
    candidates: parsed.candidates.map((candidate) => ({ ...candidate, sourceLine: sheetLine(candidate.sourceLine) })),
    unparsed: [...lateHeaders, ...parsed.unparsed.map((line) => ({ ...line, sourceLine: sheetLine(line.sourceLine) }))]
      .sort((left, right) => left.sourceLine - right.sourceLine),
  };
}

export function parseExcelArrayBuffer(input: ArrayBuffer | string[][]): ExcelImportResult {
  if (Array.isArray(input)) return parseExcelWorkbookRows(input);
  // Binary workbook decoding is handled at the UI boundary with xlsx.
  void input;
  return { ...parseStudentText(""), ...emptyMetadata() };
}

export function parseExcelWorkbookRows(rows: string[][]): ExcelImportResult {
  const header = findHeaderRow(rows);
  if (!header) return { ...parseWithoutHeader(rows), ...emptyMetadata() };

  const metadata = createMetadata(rows, header);
  const dataRows = collectNonEmptyRows(rows, header.rowIndex + 1);

  if (metadata.missingRequiredFields.length > 0) {
    // 表头认出来了但缺必填列：按列位硬读只会把「备注」当成城市，整表报未识别更诚实。
    const reason = `${MISSING_HEADER_COLUMNS_REASON}：${describeStudentColumns(metadata.missingRequiredFields)}`;
    return {
      candidates: [],
      unparsed: dataRows.map(({ cells, sourceLine }) => ({ sourceLine, rawLine: rowRawLine(cells), reason })),
      ...metadata,
    };
  }

  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  for (const { cells, sourceLine } of dataRows) {
    const values = {
      name: cells[header.indexes.name!] ?? "",
      university: cells[header.indexes.university!] ?? "",
      city: cells[header.indexes.city!] ?? "",
    };
    const rawLine = rowRawLine(cells);
    const missing = REQUIRED_COLUMNS.filter((field) => !values[field]);
    if (missing.length > 0) {
      unparsed.push({ sourceLine, rawLine, reason: `${MISSING_ROW_FIELDS_REASON}：${describeStudentColumns(missing)}` });
      continue;
    }
    const scopeIndex = header.indexes.locationScope;
    const locationScope = scopeIndex === undefined ? undefined : parseLocationScope(cells[scopeIndex]);
    candidates.push({
      ...values,
      ...(locationScope ? { locationScope } : {}),
      sourceLine,
      rawLine,
    });
  }

  return { candidates, unparsed, ...metadata };
}

/** 工作簿里的一张表：表名要一起带进来，选中表和被跳过的表都得能在提示里点名。 */
export interface ExcelSheetInput {
  name: string;
  rows: string[][];
}

export interface ExcelWorkbookImportResult extends ExcelImportResult {
  /** 实际读取的工作表名。 */
  sheetName: string;
  /** 没被读取的工作表名，按工作簿原顺序；非空说明这本工作簿里还有内容没进候选。 */
  skippedSheetNames: string[];
}

/**
 * 选表档位：表头可用(2) > 无表头按列位回退(1) > 表头缺必填列(0)。
 * 缺必填列的表一行都读不出来（整表进 unparsed），所以排在回退路径之后；
 * 自家模板的「填写说明」是三列说明文字、认不到必填表头，因而永远输给「学生数据」。
 */
function sheetTier(result: ExcelImportResult): number {
  if (result.headerRowIndex === undefined) return 1;
  return result.missingRequiredFields.length > 0 ? 0 : 2;
}

function isBetterSheet(candidate: ExcelImportResult, current: ExcelImportResult): boolean {
  const tierDelta = sheetTier(candidate) - sheetTier(current);
  if (tierDelta !== 0) return tierDelta > 0;
  return candidate.candidates.length > current.candidates.length;
}

/**
 * 整本工作簿里挑一张最像名单的表：逐表跑 `parseExcelWorkbookRows`，按「表头质量 → 候选最多」取最佳，
 * 平票保留靠前的表——单表工作簿因此与直接调 `parseExcelWorkbookRows` 完全一致。
 * 教务导出常把封面/汇总排在第一张，只读第一张会把封面当名单、真名单静默丢失。
 * 空工作簿返回 null，由调用方决定怎么提示。
 */
export function parseExcelWorkbook(sheets: readonly ExcelSheetInput[]): ExcelWorkbookImportResult | null {
  if (sheets.length === 0) return null;
  const parsed = sheets.map((sheet) => parseExcelWorkbookRows(sheet.rows));
  let bestIndex = 0;
  for (let index = 1; index < parsed.length; index += 1) {
    if (isBetterSheet(parsed[index]!, parsed[bestIndex]!)) bestIndex = index;
  }
  return {
    ...parsed[bestIndex]!,
    sheetName: sheets[bestIndex]!.name,
    skippedSheetNames: sheets.filter((_, index) => index !== bestIndex).map((sheet) => sheet.name),
  };
}

export type CsvEncoding = "utf-8" | "gb18030";

export interface CsvDecodeResult {
  text: string;
  /** 实际生效的编码，调用方可据此提示用户。 */
  encoding: CsvEncoding;
}

const CSV_MIME_TYPES = new Set(["text/csv", "application/csv", "text/comma-separated-values"]);
const REPLACEMENT_CHARACTER = "\uFFFD";

/** 只有 CSV 这类纯文本才需要自己定编码；xlsx/xls 是二进制容器，仍交给 xlsx 按字节读。 */
export function isCsvFile(file: { name?: string; type?: string } | null | undefined): boolean {
  if (!file) return false;
  if (/\.csv$/i.test(file.name ?? "")) return true;
  return CSV_MIME_TYPES.has((file.type ?? "").trim().toLowerCase());
}

function toBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function countReplacements(text: string): number {
  let count = 0;
  for (let index = text.indexOf(REPLACEMENT_CHARACTER); index >= 0; index = text.indexOf(REPLACEMENT_CHARACTER, index + 1)) {
    count += 1;
  }
  return count;
}

/**
 * CSV 文本解码：国内教务系统与中文版 Excel 导出的 CSV 多为 GBK/GB2312，
 * 按 UTF-8 硬解会把「学生姓名」读成乱码，而乱码表头看上去仍是「合法但认不出的表头」，
 * 名单会带着乱码进候选。先用 fatal 的 UTF-8 试解（非 fatal 永远成功，只会留替换字符，
 * 那样就永远走不到兜底分支），失败后再按 GB18030 解（GB18030 是 GBK/GB2312 的超集）。
 */
export function decodeCsvBytes(input: ArrayBuffer | ArrayBufferView): CsvDecodeResult {
  const bytes = toBytes(input);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes(REPLACEMENT_CHARACTER)) return { text, encoding: "utf-8" };
  } catch {
    // 落到 GB18030 兜底。
  }
  // 宽松 UTF-8 结果留作参照：GB18030 解出来的替换字符更多时说明这份文件本来就是 UTF-8。
  const lenientUtf8 = new TextDecoder("utf-8").decode(bytes);
  try {
    const text = new TextDecoder("gb18030").decode(bytes);
    if (countReplacements(text) <= countReplacements(lenientUtf8)) return { text, encoding: "gb18030" };
  } catch {
    // 运行环境没带 GB18030 解码表（如精简 ICU 构建）时退回宽松 UTF-8：
    // 留替换字符总好过整份文件读不进来。
  }
  return { text: lenientUtf8, encoding: "utf-8" };
}

export function parseOcrLikeText(text: string): TextImportResult {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s{2,}/g, " ");
  return parseStudentText(normalized);
}
