import {
  candidateFromColumns,
  describeMissingCells,
  detectHeaderColumns,
  isBlankImportCell,
  isSummaryRow,
  missingRequiredCells,
  missingRequiredColumns,
  parseStudentText,
  rowRestatesHeader,
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
    // Sheets built by stacking two exports repeat the header mid-table; that
    // row is a header, not a student called 姓名.
    if (rowRestatesHeader(row, header.indexes, header.headers)) return;
    if (isSummaryRow(row, header.indexes)) {
      unparsed.push({ sourceLine, rawLine, reason: "汇总行" });
      return;
    }
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

/**
 * Copying a table out of a browser (a web page, or a spreadsheet that runs in
 * one) puts an HTML `<table>` on the clipboard next to a plain-text flavour
 * that usually keeps neither the row structure nor the empty cells. These
 * helpers read the markup flavour instead.
 *
 * The markup is scanned rather than parsed into a DOM: the result must be the
 * same in a worker or a test, and clipboard markup is never inserted into the
 * document, so no untrusted node is ever created.
 */
const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const MAX_HTML_SPAN = 512;

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return HTML_NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const codePoint = entity[1]?.toLowerCase() === "x"
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  });
}

/** Cell text: markup and comments out, entities in, whitespace collapsed. */
function htmlCellText(cell: string): string {
  const text = cell
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return trimImportCell(decodeHtmlEntities(text).replace(/\s+/g, " "));
}

function readSpan(attributes: string, name: "colspan" | "rowspan"): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']?\\s*(\\d+)`, "i").exec(attributes);
  const span = match ? Number(match[1]) : 1;
  return Number.isInteger(span) && span > 0 ? Math.min(span, MAX_HTML_SPAN) : 1;
}

/**
 * Turns clipboard markup into the same row matrix a workbook produces, or
 * null when the clipboard carries no table at all. `colspan`/`rowspan` are
 * filled across the block they cover, exactly like a merged workbook cell.
 */
export function parseHtmlTableRows(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  const rows: string[][] = [];
  const carried = new Map<number, { value: string; remaining: number }>();

  for (const rowMatch of source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const row: string[] = [];
    let column = 0;
    const consumeCarried = (index: number) => {
      const carry = carried.get(index);
      if (!carry) return false;
      row[index] = carry.value;
      carry.remaining -= 1;
      if (carry.remaining <= 0) carried.delete(index);
      return true;
    };
    /** A rowspan from an earlier row still occupies this column in this row. */
    const takeCarried = () => {
      while (consumeCarried(column)) column += 1;
    };
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
      takeCarried();
      const value = htmlCellText(cellMatch[3] ?? "");
      const rowspan = readSpan(cellMatch[2] ?? "", "rowspan");
      for (let span = readSpan(cellMatch[2] ?? "", "colspan"); span > 0; span -= 1) {
        row[column] = value;
        if (rowspan > 1) carried.set(column, { value, remaining: rowspan - 1 });
        column += 1;
      }
    }
    takeCarried();
    // A rowspan further right than this row's own cells still belongs to it.
    for (const index of [...carried.keys()].filter((key) => key > column).sort((left, right) => left - right)) {
      consumeCarried(index);
    }
    rows.push(Array.from(row, (cell) => cell ?? ""));
  }

  return rows.length > 0 ? rows : null;
}

/** Reads a pasted `<table>` with the same header engine as a workbook. */
export function parseHtmlTable(html: string): ExcelImportResult {
  const rows = parseHtmlTableRows(html);
  if (!rows) return { candidates: [], unparsed: [], ...emptyMetadata() };
  return parseExcelWorkbookRows(rows);
}

/**
 * Renders a matrix as the tab-separated text a spreadsheet paste carries, so
 * the recognized table is still visible (and re-parsable) in the paste box.
 * Empty cells are kept: dropping them would shift every later column.
 */
export function rowsToTabText(rows: string[][]): string {
  const lines = rows.map((row) => row.join("\t").replace(/\t+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.join("\n");
}

export function parseOcrLikeText(text: string): TextImportResult {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s{2,}/g, " ");
  return parseStudentText(normalized);
}
