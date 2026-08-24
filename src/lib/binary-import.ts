import {
  COLUMN_LABELS,
  findColumnIndexes,
  parseLocationScope,
  REQUIRED_COLUMNS,
  type RequiredStudentColumn,
  type StudentColumn,
} from "./import-aliases";
import {
  HEADER_LIKE_REASON,
  parseStudentText,
  splitTextLines,
  type ImportCandidate,
  type TextImportResult,
  type UnparsedLine,
} from "./import-data";

/**
 * 对外导出完整的列类型(含省份):识别面板要为省份渲染映射行,消费方的标签表也要覆盖省份。
 * 回滚省份列时从 `StudentColumn` 联合类型去掉 `"province"`，并同步 `MAPPED_COLUMNS`。
 */
export type { StudentColumn } from "./import-aliases";

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
  missingRequiredFields: RequiredStudentColumn[];
}

export interface ImportTemplateSheets {
  data: string[][];
  guide: string[][];
}

/**
 * 省份固定排在第 5 列(去向类型之后):前 4 列列位与旧模板一致,
 * 无表头回退路径才能继续按「姓名/院校/城市/去向」读老数据。
 * 破坏性变更:导出的 xlsx 比旧版多一列省份。回滚办法是删掉 data 行尾的 "省份"、
 * 补齐空行长度并删除 guide 里的两条省份说明,导出侧(roster-export)会自动跟随模板收缩。
 */
export function createImportTemplateSheets(): ImportTemplateSheets {
  return {
    data: [
      ["学生姓名", "录取院校", "城市", "去向类型", "省份"],
      ["", "", "", "", ""],
    ],
    guide: [
      ["字段", "必填", "示例"],
      ["学生姓名", "是", "林舟"],
      ["录取院校", "是", "北京大学"],
      ["城市", "是", "北京市"],
      ["去向类型", "否", "中国去向 / 海外去向"],
      ["省份", "否", "浙江省"],
      ["填写说明", "", "去向类型留空时按中国去向处理"],
      ["省份说明", "", "省份选填;填了就覆盖按城市推断的省份,留空则仍按城市解析"],
    ],
  };
}

/**
 * 识别面板展示的列与展示顺序;省份排在末位,与模板第 5 列一致。
 * 回滚省份列时从数组里删掉 "province",省份会退回「只解析不展示」。
 */
const MAPPED_COLUMNS: readonly StudentColumn[] = ["name", "university", "city", "locationScope", "province"];

function toRowCells(row: string[] | undefined): string[] {
  return (row ?? []).map((cell) => String(cell ?? "").trim());
}

function rowRawLine(cells: string[]): string {
  return cells.filter(Boolean).join("\t");
}

/** 无表头回退时按列位还原整行:保留中间空单元格,只截掉行尾的空列。 */
function rowFallbackLine(cells: string[]): string {
  const lastFilled = cells.reduce((last, cell, index) => (cell ? index : last), -1);
  return lastFilled < 0 ? "" : cells.slice(0, lastFilled + 1).join("\t");
}

function matrixToText(rows: string[][]): string {
  return rows
    .map((row) => rowFallbackLine(toRowCells(row)))
    .filter((line) => line.length > 0)
    .join("\n");
}

function emptyMetadata(): Pick<ExcelImportResult, "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> {
  return {
    columnMappings: [],
    unmappedHeaders: [],
    missingRequiredFields: [],
  };
}

function findHeaderRow(rows: string[][]): { rowIndex: number; headers: string[]; indexes: Partial<Record<StudentColumn, number>> } | null {
  const candidates = rows
    .map((row, rowIndex) => ({
      rowIndex,
      headers: row.map((cell) => String(cell ?? "").trim()),
    }))
    .filter(({ headers }) => headers.some(Boolean))
    .slice(0, 8);

  let best: { rowIndex: number; headers: string[]; indexes: Partial<Record<StudentColumn, number>>; score: number } | null = null;
  for (const candidate of candidates) {
    const indexes = findColumnIndexes(candidate.headers);
    const score = Object.keys(indexes).length;
    if (score < 2 || (best && score <= best.score)) continue;
    best = { ...candidate, indexes, score };
  }
  return best ? { rowIndex: best.rowIndex, headers: best.headers, indexes: best.indexes } : null;
}

function createMetadata(
  rows: string[][],
  header: { rowIndex: number; headers: string[]; indexes: Partial<Record<StudentColumn, number>> },
): Pick<ExcelImportResult, "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> {
  const columnMappings = MAPPED_COLUMNS.flatMap((field) => {
    const columnIndex = header.indexes[field];
    if (columnIndex === undefined) return [];
    const samples = rows
      .slice(header.rowIndex + 1)
      .map((row) => row[columnIndex]?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 2);
    return [{
      field,
      sourceHeader: header.headers[columnIndex] ?? "",
      columnIndex,
      samples,
    }];
  });
  // 「未使用」直接取映射的补集:凡是展示了映射行的列位都算已识别,省份也不例外。
  const mappedIndexes = new Set(columnMappings.map((mapping) => mapping.columnIndex));
  const unmappedHeaders = header.headers.filter((value, index) => value && !mappedIndexes.has(index));
  const missingRequiredFields = REQUIRED_COLUMNS.filter((field) => header.indexes[field] === undefined);
  return {
    headerRowIndex: header.rowIndex,
    columnMappings,
    unmappedHeaders,
    missingRequiredFields: [...missingRequiredFields],
  };
}

function describeColumns(fields: readonly StudentColumn[]): string {
  return fields.map((field) => COLUMN_LABELS[field]).join("、");
}

export function parseExcelArrayBuffer(input: ArrayBuffer | string[][]): ExcelImportResult {
  if (Array.isArray(input)) return parseExcelWorkbookRows(input);
  // Binary workbook decoding is handled at the UI boundary with xlsx.
  void input;
  return { ...parseStudentText(""), ...emptyMetadata() };
}

export function parseExcelWorkbookRows(rows: string[][]): ExcelImportResult {
  const header = findHeaderRow(rows);
  if (!header) return { ...parseStudentText(matrixToText(rows)), ...emptyMetadata() };

  const metadata = createMetadata(rows, header);
  // sourceLine 为表格 1 基行号:表头在 header.rowIndex(0 基),其后第 offset 行即 +2。
  const dataRows = rows.slice(header.rowIndex + 1).map((row, offset) => ({
    cells: toRowCells(row),
    sourceLine: header.rowIndex + offset + 2,
  })).filter(({ cells }) => cells.some(Boolean));

  if (metadata.missingRequiredFields.length > 0) {
    const reason = `表头缺少必填列:${describeColumns(metadata.missingRequiredFields)}`;
    return {
      candidates: [],
      unparsed: dataRows.map(({ cells, sourceLine }) => ({
        sourceLine,
        rawLine: rowRawLine(cells),
        reason,
      })),
      ...metadata,
    };
  }

  const candidates: TextImportResult["candidates"] = [];
  const unparsed: UnparsedLine[] = [];

  for (const { cells, sourceLine } of dataRows) {
    const values = {
      name: cells[header.indexes.name!] ?? "",
      university: cells[header.indexes.university!] ?? "",
      city: cells[header.indexes.city!] ?? "",
    };
    const missing = REQUIRED_COLUMNS.filter((field) => !values[field]);
    const rawLine = rowRawLine(cells);
    if (missing.length > 0) {
      unparsed.push({
        sourceLine,
        rawLine,
        reason: `缺少必填字段:${describeColumns(missing)}`,
      });
      continue;
    }
    const scopeIndex = header.indexes.locationScope;
    const locationScope = scopeIndex === undefined ? undefined : parseLocationScope(cells[scopeIndex]);
    const provinceIndex = header.indexes.province;
    // 省份空着就不写字段:留给下游按城市推断,而不是塞一个空字符串覆盖推断结果。
    const province = provinceIndex === undefined ? "" : cells[provinceIndex] ?? "";
    candidates.push({
      ...values,
      ...(locationScope ? { locationScope } : {}),
      ...(province ? { province } : {}),
      sourceLine,
      rawLine,
    });
  }

  return { candidates, unparsed, ...metadata };
}

/** 归一化后整行被吃空时的兜底理由:行数不守恒必须报出来,不能当作解析成功。 */
const OCR_LOST_LINE_REASON = "OCR 归一化后未产生解析结果";

/** 截图文本的噪声:不断行的空格、竖线分隔、冒号标签、连续空格。 */
function normalizeOcrLine(line: string): string {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function indexBySourceLine<T extends { sourceLine: number }>(rows: readonly T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.sourceLine, row]));
}

/**
 * OCR 文本解析:先按原文解析,原文能全解析就不做归一化。
 * 剥掉冒号会把「姓名：张三 院校：北京大学」压成一串表头别名,归一化后整行被当成表头,
 * candidates 和 unparsed 会同时为空。因此归一化只用来补原文解析不了的行,
 * 并逐行核对行数守恒:每一行要么是候选,要么进 unparsed,要么是被消费的表头行(headerLine)。
 */
export function parseOcrLikeText(text: string): TextImportResult {
  const direct = parseStudentText(text);
  if (direct.unparsed.length === 0) return direct;

  const lines = splitTextLines(text);
  // 只把原文读不出的行送去归一化:已解析的带标签行留在原地,免得它们归一化后混进表头识别。
  const pending = direct.unparsed
    .map((row) => ({ sourceLine: row.sourceLine, rawLine: lines[row.sourceLine - 1] ?? row.rawLine }))
    .filter((row) => row.rawLine.length > 0);
  const rescued = parseStudentText(
    pending.map((row) => normalizeOcrLine(row.rawLine) || row.rawLine).join("\n"),
  );
  const rescuedCandidates = indexBySourceLine(rescued.candidates);
  const rescuedUnparsed = indexBySourceLine(rescued.unparsed);
  // 归一化文本里的行号是 pending 内的序号,回填成原文行号;对不上的行按丢失处理。
  const rescuedByLine = new Map(pending.map((row, offset) => [row.sourceLine, {
    candidate: rescuedCandidates.get(offset + 1),
    reason: rescuedUnparsed.get(offset + 1)?.reason,
    isHeader: rescued.headerLine === offset + 1,
  }]));

  const directCandidates = indexBySourceLine(direct.candidates);
  const directUnparsed = indexBySourceLine(direct.unparsed);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  let headerLine = direct.headerLine;

  lines.forEach((rawLine, index) => {
    const sourceLine = index + 1;
    const parsed = directCandidates.get(sourceLine);
    if (parsed) {
      candidates.push(parsed);
      return;
    }
    if (sourceLine === direct.headerLine) return;
    const fallback = rescuedByLine.get(sourceLine);
    if (fallback?.candidate) {
      // rawLine 回填原文:面板要展示用户真正粘进来的那一行,而不是归一化中间态。
      candidates.push({ ...fallback.candidate, rawLine });
      return;
    }
    if (fallback?.isHeader && headerLine === undefined) {
      headerLine = sourceLine;
      return;
    }
    unparsed.push({
      sourceLine,
      rawLine,
      reason: fallback?.isHeader
        ? HEADER_LIKE_REASON
        : fallback?.reason ?? directUnparsed.get(sourceLine)?.reason ?? OCR_LOST_LINE_REASON,
    });
  });

  return { candidates, unparsed, ...(headerLine === undefined ? {} : { headerLine }) };
}
