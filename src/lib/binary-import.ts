import {
  candidateFromColumns,
  describeMissingCells,
  detectHeaderColumns,
  isBlankImportCell,
  missingRequiredCells,
  missingRequiredColumns,
  parseStudentText,
  STUDENT_HEADER_ALIASES,
  trimImportCell,
  type RequiredStudentColumn,
  type StudentColumn,
  type ImportCandidate,
  type StudentColumnIndexes,
  type TextImportResult,
  type UnparsedLine,
} from "./import-data";

export type { RequiredStudentColumn, StudentColumn } from "./import-data";

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
      ["省份", "否", "浙江省（留空时按城市自动匹配）"],
      ["填写说明", "", "去向类型留空时按中国去向处理；海外去向无需填写省份"],
      ["填写说明", "", "合并单元格会按整块自动补齐；CSV 中含逗号的姓名请用英文双引号包裹"],
    ],
  };
}

const HEADER_SEARCH_DEPTH = 8;

/** A `!merges` entry from the xlsx worksheet: inclusive start/end cell addresses. */
export interface SheetMergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface ExcelParseOptions {
  /** Pass `worksheet["!merges"]` so a merged 省份/城市 block fills its rows. */
  merges?: readonly SheetMergeRange[];
}

function normalizeMatrix(rows: unknown[][]): string[][] {
  return rows.map((row) => (Array.isArray(row) ? row : []).map(trimImportCell));
}

/**
 * xlsx only stores a merged block's value in its top-left cell and leaves the
 * rest blank, which would turn every following row of a merged 省份/城市 block
 * into an incomplete record. Copying the anchor value across the block keeps
 * those rows importable; cells the user actually filled in are never touched.
 */
export function expandMergedCells(rows: string[][], merges: readonly SheetMergeRange[] = []): string[][] {
  if (merges.length === 0) return rows;
  const expanded = rows.map((row) => [...row]);
  for (const merge of merges) {
    const anchor = expanded[merge.s.r]?.[merge.s.c] ?? "";
    if (isBlankImportCell(anchor)) continue;
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      const target = expanded[row];
      if (!target) continue;
      for (let column = merge.s.c; column <= merge.e.c; column += 1) {
        while (target.length < column) target.push("");
        if (isBlankImportCell(target[column])) target[column] = anchor;
      }
    }
  }
  return expanded;
}

function matrixToText(rows: string[][]): string {
  return rows
    .map((row) => row.filter(Boolean).join("\t"))
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

interface DetectedHeader {
  rowIndex: number;
  headers: string[];
  indexes: StudentColumnIndexes;
}

/**
 * Scans the first rows for the best header: the one mapping the most student
 * columns. Leading title/notes rows are therefore skipped automatically.
 */
function findHeaderRow(rows: string[][]): DetectedHeader | null {
  const candidates = rows
    .map((headers, rowIndex) => ({ rowIndex, headers }))
    .filter(({ headers }) => headers.some(Boolean))
    .slice(0, HEADER_SEARCH_DEPTH);

  let best: (DetectedHeader & { score: number }) | null = null;
  for (const candidate of candidates) {
    const indexes = detectHeaderColumns(candidate.headers);
    const score = Object.keys(indexes).length;
    if (score < 2 || (best && score <= best.score)) continue;
    best = { ...candidate, indexes, score };
  }
  return best ? { rowIndex: best.rowIndex, headers: best.headers, indexes: best.indexes } : null;
}

function createMetadata(
  rows: string[][],
  header: DetectedHeader,
): Pick<ExcelImportResult, "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> {
  const mappedIndexes = new Set<number>();
  const columnMappings = (Object.keys(STUDENT_HEADER_ALIASES) as StudentColumn[]).flatMap((field) => {
    const columnIndex = header.indexes[field];
    if (columnIndex === undefined) return [];
    mappedIndexes.add(columnIndex);
    const samples = rows
      .slice(header.rowIndex + 1)
      .map((row) => row[columnIndex] ?? "")
      .filter(Boolean)
      .slice(0, 2);
    return [{
      field,
      sourceHeader: header.headers[columnIndex] ?? "",
      columnIndex,
      samples,
    }];
  });
  return {
    headerRowIndex: header.rowIndex,
    columnMappings,
    unmappedHeaders: header.headers.filter((value, index) => value && !mappedIndexes.has(index)),
    missingRequiredFields: missingRequiredColumns(header.indexes),
  };
}

export function parseExcelArrayBuffer(input: ArrayBuffer | string[][]): ExcelImportResult {
  if (Array.isArray(input)) return parseExcelWorkbookRows(input);
  // Binary workbook decoding is handled at the UI boundary with xlsx.
  void input;
  return { ...parseStudentText(""), ...emptyMetadata() };
}

export function parseExcelWorkbookRows(input: unknown[][], options: ExcelParseOptions = {}): ExcelImportResult {
  const rows = expandMergedCells(normalizeMatrix(input ?? []), options.merges);
  // An empty sheet (or one holding only blank cells) is not an error: report
  // nothing recognized instead of pretending a header was found.
  if (!rows.some((row) => row.some(Boolean))) {
    return { candidates: [], unparsed: [], ...emptyMetadata() };
  }

  const header = findHeaderRow(rows);
  if (!header) return { ...parseStudentText(matrixToText(rows)), ...emptyMetadata() };

  const metadata = createMetadata(rows, header);
  if (metadata.missingRequiredFields.length > 0) {
    return { ...parseStudentText(matrixToText(rows)), ...metadata };
  }

  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  rows.slice(header.rowIndex + 1).forEach((row, rowIndex) => {
    const sourceLine = header.rowIndex + rowIndex + 2;
    const rawLine = row.filter(Boolean).join("\t");
    const candidate = candidateFromColumns(row, header.indexes, sourceLine, rawLine);
    if (candidate) {
      candidates.push(candidate);
      return;
    }
    // Trailing blank sheet rows are normal; a row that holds data but misses a
    // required cell is reported so the import never drops it silently.
    if (row.every(isBlankImportCell)) return;
    unparsed.push({ sourceLine, rawLine, reason: describeMissingCells(missingRequiredCells(row, header.indexes)) });
  });

  return {
    candidates,
    unparsed,
    ...metadata,
  };
}

export function parseOcrLikeText(text: string): TextImportResult {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s{2,}/g, " ");
  return parseStudentText(normalized);
}
