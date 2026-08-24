import {
  countExactHeaderCells, describeMissingCells, detectHeaderMapping, isBlankImportCell, isSummaryRow,
  missingRequiredCells, missingRequiredColumns, readStudentColumn, REQUIRED_STUDENT_COLUMNS, rowRestatesHeader,
  trimImportCell, type StudentColumn, type StudentColumnLookup, type StudentColumnMapping,
} from "./import-headers";

export interface ImportCandidate {
  name: string;
  university: string;
  city: string;
  province?: string;
  locationScope?: "china" | "international";
  sourceLine: number;
  rawLine: string;
}

export interface UnparsedLine {
  sourceLine: number;
  rawLine: string;
  reason: string;
}

export interface TextImportResult {
  candidates: ImportCandidate[];
  unparsed: UnparsedLine[];
}

export {
  countExactHeaderCells, describeMissingCells, detectHeaderColumns, detectHeaderMapping, isBlankImportCell,
  isExactHeaderAlias, isSummaryRow, looksLikeStudentHeader, missingRequiredCells, missingRequiredColumns,
  normalizeHeaderCell, readStudentColumn, REQUIRED_COLUMN_LABELS, REQUIRED_STUDENT_COLUMNS, rowRestatesHeader,
  STUDENT_HEADER_ALIASES, trimImportCell,
} from "./import-headers";
export type { RequiredStudentColumn, StudentColumn, StudentColumnAlternates, StudentColumnIndexes, StudentColumnLookup, StudentColumnMapping } from "./import-headers";

const INTERNATIONAL_TOKENS = ["海外", "境外", "国外", "出国", "留学", "international", "overseas", "abroad"];

/**
 * A 是否出国 column is answered in the negative as often as in the positive
 * ("未出国", "非海外", "not abroad"), and those answers spell the overseas
 * marker out in full. Counting them would move a student who never left the
 * country off the China map without a warning.
 */
const NEGATED_OVERSEAS = new RegExp(`(不|非|未|没有?|无|否|not|non)\\s*(?:${INTERNATIONAL_TOKENS.join("|")})`, "g");

/**
 * Drops the markers a negation introduces, keeping the negation itself so it
 * carries over to the next one: "未出国留学" loses 出国 and then 留学. Only an
 * adjacent negation counts, so "非全日制海外硕士" stays overseas.
 */
function stripNegatedMarkers(value: string): string {
  let current = value;
  for (let pass = 0; pass < INTERNATIONAL_TOKENS.length; pass += 1) {
    const next = current.replace(NEGATED_OVERSEAS, "$1");
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Reads a 去向类型 cell. Anything that is not explicitly overseas stays a China destination. */
export function parseLocationScopeValue(value: string | undefined): "international" | undefined {
  const normalized = (value ?? "").trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return undefined;
  const stated = stripNegatedMarkers(normalized);
  return INTERNATIONAL_TOKENS.some((token) => stated.includes(token)) ? "international" : undefined;
}

/** One physical line of the source, with the 1-based number it came from. */
interface SourceLine {
  text: string;
  sourceLine: number;
}

/**
 * Blank lines are dropped but never renumber the rest: an unparsed row is
 * reported as "第 N 行", and N has to point at the line the user can see.
 */
function splitLines(text: string): SourceLine[] {
  const physical = text.replace(/\uFEFF/g, "").split(/\r?\n/);
  return joinQuotedLines(physical)
    // A leading tab is an empty leading column: trimming it would shift every
    // later cell of a sparse spreadsheet row, so only spaces are stripped.
    .map((line) => ({ ...line, text: line.text.replace(/^[^\S\t]+|\s+$/g, "") }))
    .filter((line) => line.text.length > 0);
}

/** A quoted cell may hold this many extra lines before the join is abandoned. */
const MAX_QUOTED_LINE_JOIN = 32;

/**
 * RFC4180 lets a quoted cell hold a line break, and a spreadsheet exports a
 * two-line remark that way. Physical lines that leave a quote open are rejoined
 * into the one record they belong to before anything is split, otherwise the
 * tail of the record parses as a student of its own.
 *
 * The join is only kept when the quote actually closes within a few lines, so a
 * single stray quote cannot swallow the rest of the paste.
 */
function joinQuotedLines(lines: string[]): SourceLine[] {
  // The line a quoted cell opens on may carry no delimiter of its own (the
  // break can fall right after the opening quote), so the delimiter of the
  // paste as a whole decides.
  const shared = lines.reduce<string | null>((found, line) => found ?? detectDelimiter(line), null);
  const joined: SourceLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const first = lines[index]!;
    const delimiter = detectDelimiter(first) ?? shared;
    let record = first;
    let last = index;
    while (delimiter && last - index < MAX_QUOTED_LINE_JOIN && endsInsideQuotedCell(record, delimiter)) {
      last += 1;
      if (last >= lines.length) break;
      // The break belongs inside the cell; a space keeps the record on one line.
      record += ` ${lines[last]}`;
    }
    const closed = delimiter !== null && last < lines.length && !endsInsideQuotedCell(record, delimiter);
    joined.push({ text: closed ? record : first, sourceLine: index + 1 });
    if (closed) index = last;
  }
  return joined;
}

/** Delimiters a paste may use, in the order they are believed. */
const CELL_DELIMITERS = ["\t", ",", "，", ";"];

function detectDelimiter(line: string): string | null {
  return CELL_DELIMITERS.find((delimiter) => line.includes(delimiter)) ?? null;
}

interface DelimitedScan {
  cells: string[];
  /** The line ended inside a quoted cell, so the record continues below. */
  open: boolean;
}

function scanDelimitedLine(line: string, delimiter: string): DelimitedScan {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quoted) {
      if (char !== '"') {
        current += char;
      } else if (line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"' && current.trim() === "") {
      quoted = true;
      current = "";
      continue;
    }
    if (char === delimiter) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return { cells, open: quoted };
}

function endsInsideQuotedCell(line: string, delimiter: string): boolean {
  return scanDelimitedLine(line, delimiter).open;
}

/**
 * RFC4180-style split: a delimiter inside double quotes belongs to the cell,
 * so `"李,四",北京大学,北京` keeps the comma in the student's name. Doubled
 * quotes inside a quoted cell are literal quotes.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  return scanDelimitedLine(line, delimiter).cells.map(trimImportCell);
}

/** Delimiter-aware split that keeps empty cells so column indexes stay aligned. */
function splitCells(line: string, delimiter: string | null): string[] {
  if (!delimiter) return splitParts(line, null);
  return splitDelimitedLine(line, delimiter);
}

type PaddingColumns = Map<string, ReadonlySet<number>>;

/**
 * Columns no line of the paste fills, kept per delimiter. Such a column is
 * padding an export left behind — an empty 序号 column on the left, the
 * trailing separator of a CSV row — and dropping it lets the positional reader
 * find 姓名/院校/城市 where they really start.
 *
 * A cell blank on only some lines is the opposite: a gap in a column the rest
 * of the paste uses. Dropping that one pulls every later cell of the row a
 * column left, which imported "林舟,,北京市,海外" as a student studying at
 * 北京市 in 海外 — a complete-looking record nothing warned about. So the gap
 * stays, {@link toCandidate} sees the blank, and the row is reported instead.
 */
function paddingColumnsByDelimiter(lines: readonly SourceLine[]): PaddingColumns {
  const filled = new Map<string, Set<number>>();
  const blank = new Map<string, Set<number>>();
  for (const { text } of lines) {
    const delimiter = detectDelimiter(text);
    if (!delimiter) continue;
    if (!blank.has(delimiter)) {
      filled.set(delimiter, new Set());
      blank.set(delimiter, new Set());
    }
    splitDelimitedLine(text, delimiter).forEach((cell, index) => {
      (cell ? filled : blank).get(delimiter)!.add(index);
    });
  }
  for (const [delimiter, empty] of blank) {
    for (const index of filled.get(delimiter)!) empty.delete(index);
  }
  return blank;
}

function splitParts(line: string, delimiter: string | null, padding?: PaddingColumns): string[] {
  if (delimiter) {
    // Only padding goes; every remaining cell keeps its column, blank ones included.
    const dropped = padding?.get(delimiter);
    return splitDelimitedLine(line, delimiter).filter((_, index) => !dropped?.has(index));
  }
  return line.replace(/^\d+[\.、\)]\s*/, "").split(/[\s,，、;；\-\|]+/).map(trimImportCell).filter(Boolean);
}

function toCandidate(parts: string[], sourceLine: number, rawLine: string): ImportCandidate | null {
  if (parts.length < 3) return null;
  const [name, university, city, scope] = parts;
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScopeValue(scope);
  return { name, university, city, ...(locationScope ? { locationScope } : {}), sourceLine, rawLine };
}

/** Builds a candidate from a detected header mapping; returns null when a required cell is blank. */
export function candidateFromColumns(
  cells: string[], lookup: StudentColumnLookup, sourceLine: number, rawLine: string,
): ImportCandidate | null {
  const read = (column: StudentColumn): string => readStudentColumn(cells, lookup, column);
  const name = read("name");
  const university = read("university");
  const city = read("city");
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScopeValue(read("locationScope"));
  // A Chinese province column is an optional override; overseas rows never need one.
  const province = locationScope === "international" ? "" : read("province");
  return {
    name, university, city, ...(province ? { province } : {}),
    ...(locationScope ? { locationScope } : {}), sourceLine, rawLine,
  };
}

function parseLabeledCandidate(line: string, sourceLine: number): ImportCandidate | null {
  const fields = new Map<string, string>();
  const labelPattern = /(姓名|学生(?:姓名)?|name|就读院校|就读学校|录取院校|院校|学校|university|school|城市|所在城市|city|省份|省|province|去向类型|destination type)\s*[：:]/giu;
  const matches = Array.from(line.matchAll(labelPattern));
  for (const [index, match] of matches.entries()) {
    const label = match[1]!.toLocaleLowerCase("zh-CN");
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? line.length;
    fields.set(label, trimImportCell(line.slice(start, end).replace(/^[\s,，;；|｜]+|[\s,，;；|｜]+$/g, "")));
  }
  const name = fields.get("姓名") ?? fields.get("学生") ?? fields.get("学生姓名") ?? fields.get("name");
  const university = fields.get("就读院校") ?? fields.get("就读学校") ?? fields.get("录取院校")
    ?? fields.get("院校") ?? fields.get("学校") ?? fields.get("university") ?? fields.get("school");
  const city = fields.get("城市") ?? fields.get("所在城市") ?? fields.get("city");
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScopeValue(fields.get("去向类型") ?? fields.get("destination type"));
  const province = locationScope === "international"
    ? ""
    : (fields.get("省份") ?? fields.get("省") ?? fields.get("province") ?? "");
  return {
    name, university, city, ...(province ? { province } : {}),
    ...(locationScope ? { locationScope } : {}), sourceLine, rawLine: line,
  };
}

interface TextHeader {
  lineIndex: number;
  delimiter: string | null;
  cells: string[];
  mapping: StudentColumnMapping;
}

const TEXT_HEADER_SEARCH_DEPTH = 5;

/** A late header must spell this many required columns exactly to be believed. */
const MIN_LATE_HEADER_EXACT_CELLS = 2;

/**
 * The first non-empty line is the usual header spot and keeps the two-column
 * rule, so a partial header still names the columns it does provide.
 *
 * A later line is only accepted when it maps every required column and spells
 * at least two of them exactly: pasted blocks often open with a title or a
 * "更新时间" line, but a data row must never be mistaken for a header.
 */
function detectTextHeader(lines: SourceLine[]): TextHeader | null {
  for (const [lineIndex, line] of lines.slice(0, TEXT_HEADER_SEARCH_DEPTH).entries()) {
    const delimiter = detectDelimiter(line.text);
    const cells = splitCells(line.text, delimiter);
    if (cells.filter(Boolean).length < 2) continue;
    const mapping = detectHeaderMapping(cells);
    const header = { lineIndex, delimiter, cells, mapping };
    if (lineIndex === 0) {
      if (Object.keys(mapping.indexes).length >= 2) return header;
      continue;
    }
    if (missingRequiredColumns(mapping).length > 0) continue;
    if (countExactHeaderCells(cells, mapping) >= MIN_LATE_HEADER_EXACT_CELLS) return header;
  }
  return null;
}

export function parseDelimitedTable(text: string): ImportCandidate[] {
  return parseStudentText(text).candidates;
}

export function parseStudentText(text: string): TextImportResult {
  const lines = splitLines(text);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  const header = detectTextHeader(lines);
  const headerIsComplete = header !== null && missingRequiredColumns(header.mapping).length === 0;
  const padding = paddingColumnsByDelimiter(lines);

  lines.forEach(({ text, sourceLine }, index) => {
    if (header && index === header.lineIndex) return;
    // Titles and notes sitting above the header describe the sheet, not a
    // student: parsing them positionally would invent a record, so they are
    // reported as skipped instead.
    if (header && index < header.lineIndex) {
      unparsed.push({ sourceLine, rawLine: text, reason: "表头之前的内容" });
      return;
    }
    let missingReason: string | null = null;
    /**
     * The row filled some of the mapped columns, so it follows the header and
     * its gap is real. Reading it by position would shift every value one
     * column left — "学号,姓名,院校,城市" with an empty 城市 imports the student
     * number as the name — so the positional reader is skipped below.
     */
    let mappedPartially = false;

    if (headerIsComplete) {
      const cells = splitCells(text, header!.delimiter);
      // Two exports stacked together repeat the header; it is not a student.
      if (rowRestatesHeader(cells, header!.mapping, header!.cells)) return;
      if (isSummaryRow(cells, header!.mapping)) {
        unparsed.push({ sourceLine, rawLine: text, reason: "汇总行" });
        return;
      }
      const mapped = candidateFromColumns(cells, header!.mapping, sourceLine, text);
      if (mapped) {
        candidates.push(mapped);
        return;
      }
      // A row of only separators carries no data at all and is not a problem.
      if (cells.every(isBlankImportCell)) return;
      const missingCells = missingRequiredCells(cells, header!.mapping);
      mappedPartially = missingCells.length < REQUIRED_STUDENT_COLUMNS.length;
      missingReason = describeMissingCells(missingCells);
    }

    const labeledCandidate = parseLabeledCandidate(text, sourceLine);
    if (labeledCandidate) {
      candidates.push(labeledCandidate);
      return;
    }

    if (!mappedPartially) {
      const parts = splitParts(text, detectDelimiter(text), padding);
      const candidate = toCandidate(parts, sourceLine, text);
      if (candidate) {
        candidates.push(candidate);
        return;
      }
    }

    unparsed.push({
      sourceLine,
      rawLine: text,
      reason: missingReason ?? "无法识别学生名称、录取院校和城市",
    });
  });

  return { candidates, unparsed };
}
