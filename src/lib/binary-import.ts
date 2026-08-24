import {
  candidateFromColumns, describeMissingCells, detectHeaderMapping, isBlankImportCell, isSummaryRow,
  missingRequiredCells, missingRequiredColumns, parseStudentText, rowRestatesHeader, STUDENT_HEADER_ALIASES,
  trimImportCell, type ImportCandidate, type RequiredStudentColumn, type StudentColumn, type StudentColumnMapping,
  type TextImportResult, type UnparsedLine,
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
    data: [["学生姓名", "录取院校", "城市", "去向类型"], ["", "", "", ""]],
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
 * xlsx only stores a merged block's value in its top-left cell and leaves the rest blank, which
 * would turn every following row of a merged 省份/城市 block into an incomplete record. Copying the
 * anchor value across the block keeps those rows importable; cells the user filled in are kept.
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
  return rows.map((row) => row.filter(Boolean).join("\t")).filter((line) => line.length > 0).join("\n");
}

function emptyMetadata(): Pick<ExcelImportResult, "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> {
  return { columnMappings: [], unmappedHeaders: [], missingRequiredFields: [] };
}

interface DetectedHeader {
  rowIndex: number;
  headers: string[];
  mapping: StudentColumnMapping;
}

/**
 * Scans the first rows for the best header: the one mapping the most student columns. Leading
 * title/notes rows are therefore skipped automatically.
 */
function findHeaderRow(rows: string[][]): DetectedHeader | null {
  const candidates = rows.map((headers, rowIndex) => ({ rowIndex, headers }))
    .filter(({ headers }) => headers.some(Boolean)).slice(0, HEADER_SEARCH_DEPTH);
  let best: (DetectedHeader & { score: number }) | null = null;
  for (const candidate of candidates) {
    const mapping = detectHeaderMapping(candidate.headers);
    const score = Object.keys(mapping.indexes).length;
    if (score < 2 || (best && score <= best.score)) continue;
    best = { ...candidate, mapping, score };
  }
  return best ? { rowIndex: best.rowIndex, headers: best.headers, mapping: best.mapping } : null;
}

type ExcelMetadata = Pick<
  ExcelImportResult, "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"
>;

function createMetadata(rows: string[][], header: DetectedHeader): ExcelMetadata {
  const mappedIndexes = new Set<number>();
  const columnMappings = (Object.keys(STUDENT_HEADER_ALIASES) as StudentColumn[]).flatMap((field) => {
    const columnIndex = header.mapping.indexes[field];
    if (columnIndex === undefined) return [];
    mappedIndexes.add(columnIndex);
    // A repeated column backs its twin up on blank rows, so it is in use too and must not be
    // reported to the user as an ignored header.
    for (const alternate of header.mapping.alternates?.[field] ?? []) mappedIndexes.add(alternate);
    const samples = rows.slice(header.rowIndex + 1).map((row) => row[columnIndex] ?? "").filter(Boolean).slice(0, 2);
    return [{ field, sourceHeader: header.headers[columnIndex] ?? "", columnIndex, samples }];
  });
  return {
    headerRowIndex: header.rowIndex,
    columnMappings,
    unmappedHeaders: header.headers.filter((value, index) => value && !mappedIndexes.has(index)),
    missingRequiredFields: missingRequiredColumns(header.mapping),
  };
}

export function parseExcelArrayBuffer(input: ArrayBuffer | string[][]): ExcelImportResult {
  if (Array.isArray(input)) return parseExcelWorkbookRows(input);
  // Binary workbook decoding is handled at the UI boundary with xlsx.
  return { ...parseStudentText(""), ...emptyMetadata() };
}

export function parseExcelWorkbookRows(input: unknown[][], options: ExcelParseOptions = {}): ExcelImportResult {
  const rows = expandMergedCells(normalizeMatrix(input ?? []), options.merges);
  // An empty sheet (or one holding only blank cells) is not an error: report nothing recognized
  // instead of pretending a header was found.
  if (!rows.some((row) => row.some(Boolean))) return { candidates: [], unparsed: [], ...emptyMetadata() };

  const header = findHeaderRow(rows);
  if (!header) return { ...parseStudentText(matrixToText(rows)), ...emptyMetadata() };
  const metadata = createMetadata(rows, header);
  if (metadata.missingRequiredFields.length > 0) return { ...parseStudentText(matrixToText(rows)), ...metadata };

  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  rows.slice(header.rowIndex + 1).forEach((row, rowIndex) => {
    const sourceLine = header.rowIndex + rowIndex + 2;
    const rawLine = row.filter(Boolean).join("\t");
    // Sheets built by stacking two exports repeat the header mid-table; that row is a header, not
    // a student called 姓名.
    if (rowRestatesHeader(row, header.mapping, header.headers)) return;
    if (isSummaryRow(row, header.mapping)) {
      unparsed.push({ sourceLine, rawLine, reason: "汇总行" });
      return;
    }
    const candidate = candidateFromColumns(row, header.mapping, sourceLine, rawLine);
    if (candidate) {
      candidates.push(candidate);
      return;
    }
    // Trailing blank sheet rows are normal; a row that holds data but misses a required cell is
    // reported so the import never drops it silently.
    if (row.every(isBlankImportCell)) return;
    unparsed.push({ sourceLine, rawLine, reason: describeMissingCells(missingRequiredCells(row, header.mapping)) });
  });

  return { candidates, unparsed, ...metadata };
}

/**
 * Copying a table out of a browser (a web page, or a spreadsheet that runs in one) puts an HTML
 * `<table>` on the clipboard next to a plain-text flavour that usually keeps neither the row
 * structure nor the empty cells. These helpers read the markup flavour instead.
 *
 * The markup is scanned rather than parsed into a DOM: the result must be the same in a worker or
 * in a test, and clipboard markup is never inserted into the document, so no untrusted node is
 * ever created.
 */
const HTML_NAMED_ENTITIES: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };

const MAX_HTML_SPAN = 512;

/**
 * Attribute list of a start tag. A quoted value may hold a `>` — an online spreadsheet ships the
 * cell value back as JSON in `data-sheets-value`, so a destination written "本科>硕士" ends up
 * inside the attribute — and scanning to the first `>` would cut the tag in half and leak markup
 * into the cell. The alternatives cannot match the same character, so the scan stays linear.
 */
const TAG_ATTRIBUTES = "(?:[^>\"']|\"[^\"]*\"|'[^']*')*";

/**
 * Every tag that opens or closes a table, a row or a cell, in source order. The markup is walked
 * token by token over a stack of open tables, so a nested `<table>` — the layout wrapper an old
 * school page puts around its roster, or the mini table a Word export leaves inside a single cell
 * — cannot end the row that contains it. Reading a row up to the next `<tr>` did exactly that and
 * dropped every later cell of the outer row without a word.
 *
 * Hand-written markup also leaves `</td>` and `</tr>` out, which a browser fills in silently, so
 * every boundary tag closes whichever cell and row is still open.
 */
const TABLE_TOKEN = new RegExp(`<(/?)(table|thead|tbody|tfoot|tr|td|th)\\b(${TAG_ATTRIBUTES})>`, "gi");

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return HTML_NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  });
}

/** Same tolerance for the inline markup wrapping the text inside a cell. */
const HTML_INNER_TAG_PATTERN = new RegExp(`</?[a-z][a-z0-9:-]*(?:\\s${TAG_ATTRIBUTES})?>`, "gi");

/** Cell text: markup and comments out, entities in, whitespace collapsed. */
function htmlCellText(cell: string): string {
  const text = cell
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(HTML_INNER_TAG_PATTERN, " ")
    .replace(/<[^>]*>/g, " ");
  return trimImportCell(decodeHtmlEntities(text).replace(/\s+/g, " "));
}

function readSpan(attributes: string, name: "colspan" | "rowspan"): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']?\\s*(\\d+)`, "i").exec(attributes);
  const span = match ? Number(match[1]) : 1;
  return Number.isInteger(span) && span > 0 ? Math.min(span, MAX_HTML_SPAN) : 1;
}

/** One open `<table>`: the rows it has finished, plus the row and the cell still in progress. */
class TableFrame {
  rows: string[][] = [];
  /** Where the open cell's text starts in the source, or -1 while no cell is open. */
  cellStart = -1;
  /** Cell text collected before a nested table interrupted it. */
  cellText = "";
  /** Column → the value a `rowspan` still owes the rows below. */
  private carried = new Map<number, { value: string; remaining: number }>();
  private row: string[] | null = null;
  private column = 0;
  private attributes = "";
  /** Rows a nested table handed over, emitted once the row holding it closes. */
  private pending: string[][] = [];

  /** Fills one column from a rowspan an earlier row opened. */
  private takeCarried(index: number): boolean {
    const carry = this.carried.get(index);
    if (!carry || !this.row) return false;
    this.row[index] = carry.value;
    carry.remaining -= 1;
    if (carry.remaining <= 0) this.carried.delete(index);
    return true;
  }

  private skipCarried(): void { while (this.takeCarried(this.column)) this.column += 1; }

  openCell(start: number, attributes: string): void {
    this.row ??= [];
    this.cellStart = start;
    this.attributes = attributes;
  }

  closeCell(source: string, end: number): void {
    if (this.cellStart < 0) return;
    const value = htmlCellText(this.cellText + source.slice(this.cellStart, end));
    this.cellStart = -1;
    this.cellText = "";
    this.row ??= [];
    this.skipCarried();
    const rowspan = readSpan(this.attributes, "rowspan");
    for (let span = readSpan(this.attributes, "colspan"); span > 0; span -= 1) {
      this.row[this.column] = value;
      if (rowspan > 1) this.carried.set(this.column, { value, remaining: rowspan - 1 });
      this.column += 1;
    }
  }

  openRow(): void { this.row ??= []; }

  closeRow(): void {
    if (this.row) {
      this.skipCarried();
      // A rowspan further right than this row's own cells still belongs to it.
      const trailing = [...this.carried.keys()].filter((key) => key > this.column).sort((left, right) => left - right);
      for (const index of trailing) this.takeCarried(index);
      this.rows.push(Array.from(this.row, (cell) => cell ?? ""));
      this.row = null;
      this.column = 0;
    }
    this.rows.push(...this.pending);
    this.pending.length = 0;
  }

  promote(rows: readonly string[][]): void { this.pending.push(...rows); }
}

/**
 * A nested table that is a grid in its own right is a roster wrapped in a layout table, so its
 * rows join the document right after the row holding it. Anything smaller is cell decoration and
 * folds into that cell's text instead of becoming rows nobody can map.
 */
function isGridTable(rows: readonly string[][]): boolean {
  return rows.length >= 2 && rows.some((row) => row.length >= 2);
}

/** Finishes the innermost table, and returns its rows only when it was a top-level one. */
function closeTable(frames: TableFrame[], source: string, start: number, end: number): string[][] | null {
  const frame = frames.pop()!;
  frame.closeCell(source, start);
  frame.closeRow();
  const parent = frames[frames.length - 1];
  if (!parent) return frame.rows;
  const insideCell = parent.cellStart >= 0;
  // The interrupted cell resumes after `</table>`, so its own text is never counted twice.
  if (insideCell) parent.cellStart = end;
  if (!insideCell || isGridTable(frame.rows)) parent.promote(frame.rows);
  else parent.cellText += ` ${frame.rows.flat().join(" ")} `;
  return null;
}

/**
 * Turns clipboard markup into the same row matrix a workbook produces, or null when the clipboard
 * carries no table at all. `colspan`/`rowspan` are filled across the block they cover, exactly
 * like a merged workbook cell.
 */
export function parseHtmlTableRows(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  const frames: TableFrame[] = [];
  const rows: string[][] = [];

  for (const token of source.matchAll(TABLE_TOKEN)) {
    const start = token.index ?? 0;
    const end = start + token[0].length;
    const closing = token[1] === "/";
    const tag = token[2]!.toLowerCase();
    const frame = frames[frames.length - 1];
    if (tag === "table") {
      if (!closing) {
        // The text before a nested table is a word of its own, whatever becomes of the table.
        if (frame && frame.cellStart >= 0) frame.cellText += `${source.slice(frame.cellStart, start)} `;
        frames.push(new TableFrame());
      } else if (frame) {
        rows.push(...(closeTable(frames, source, start, end) ?? []));
      }
      continue;
    }
    // A stray cell or row outside every table belongs to no matrix at all.
    if (!frame) continue;
    frame.closeCell(source, start);
    if (tag === "td" || tag === "th") {
      if (!closing) frame.openCell(end, token[3] ?? "");
      continue;
    }
    frame.closeRow();
    if (tag === "tr" && !closing) frame.openRow();
  }
  // Markup that never closes its tables still yields the rows it did open.
  while (frames.length > 0) rows.push(...(closeTable(frames, source, source.length, source.length) ?? []));

  return rows.length > 0 ? rows : null;
}

/** Reads a pasted `<table>` with the same header engine as a workbook. */
export function parseHtmlTable(html: string): ExcelImportResult {
  const rows = parseHtmlTableRows(html);
  if (!rows) return { candidates: [], unparsed: [], ...emptyMetadata() };
  return parseExcelWorkbookRows(rows);
}

/**
 * Renders a matrix as the tab-separated text a spreadsheet paste carries, so the recognized table
 * stays visible (and re-parsable) in the paste box. Empty cells are kept: dropping them would
 * shift every later column.
 */
export function rowsToTabText(rows: string[][]): string {
  const lines = rows.map((row) => row.join("\t").replace(/\t+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.join("\n");
}

export function parseOcrLikeText(text: string): TextImportResult {
  return parseStudentText(text.replace(/\u00a0/g, " ").replace(/[|｜]/g, " ").replace(/[：:]/g, " ").replace(/\s{2,}/g, " "));
}
