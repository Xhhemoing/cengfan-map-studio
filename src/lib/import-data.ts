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
 * A 是否出国 column is answered in the negative as often as in the positive ("未出国",
 * "非海外", "not abroad"), and those answers spell the overseas marker out in full.
 * Counting one silently moves a student who never left the country off the China map.
 */
const NEGATED_OVERSEAS = new RegExp(`(不|非|未|没有?|无|否|not|non)\\s*(?:${INTERNATIONAL_TOKENS.join("|")})`, "g");

/**
 * Drops the markers a negation introduces, keeping the negation itself so it carries
 * over to the next one: "未出国留学" loses 出国 and then 留学. Only an adjacent
 * negation counts, so "非全日制海外硕士" stays overseas.
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
interface SourceLine { text: string; sourceLine: number }

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
 * tail of the record parses as a student of its own. The join is only kept when
 * the quote closes within a few lines, so one stray quote cannot swallow the
 * rest of the paste.
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
    while (delimiter && last - index < MAX_QUOTED_LINE_JOIN && scanDelimitedLine(record, delimiter).open) {
      last += 1;
      if (last >= lines.length) break;
      // The break belongs inside the cell; a space keeps the record on one line.
      record += ` ${lines[last]}`;
    }
    const closed = delimiter !== null && last < lines.length && !scanDelimitedLine(record, delimiter).open;
    joined.push({ text: closed ? record : first, sourceLine: index + 1 });
    if (closed) index = last;
  }
  return joined;
}

/** Delimiters a paste may use, in the order they are believed. */
const CELL_DELIMITERS = ["\t", ",", "，", ";", "；", "|", "、"];

/** The "1." / "2、" / "３)" opening a numbered list: a marker, never a cell. */
const LIST_MARKER = /^\p{Nd}+[.、)]\s*(?=[^\p{Nd}])/u;

/**
 * `、` is believed only from its second occurrence on: it is also the Chinese
 * enumeration mark *inside* one cell ("北京、上海") and the marker of a numbered
 * list, and a row needs three cells to describe a student, so a lone 、 opens
 * no column the positional reader could use.
 */
function detectDelimiter(line: string): string | null {
  const content = line.replace(LIST_MARKER, "");
  return CELL_DELIMITERS.find((delimiter) => content.split(delimiter).length >= (delimiter === "、" ? 3 : 2)) ?? null;
}

/** Cells of `line`, plus `open` when it ended inside a quoted cell whose record continues below. */
function scanDelimitedLine(line: string, delimiter: string): { cells: string[]; open: boolean } {
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
    if (char === '"' && current.trim() === "") { quoted = true; current = ""; continue; }
    if (char === delimiter) { cells.push(current); current = ""; continue; }
    current += char;
  }
  cells.push(current);
  return { cells, open: quoted };
}

/**
 * RFC4180-style split: a delimiter inside double quotes belongs to the cell,
 * so `"李,四",北京大学,北京` keeps the comma in the student's name. Doubled
 * quotes inside a quoted cell are literal quotes.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  return scanDelimitedLine(line, delimiter).cells.map(trimImportCell);
}

type UsableColumns = Map<string, ReadonlySet<number>>;

/** A cell of digits alone, fullwidth "１" included: a 序号, a 学号, an Excel date serial. */
const SERIAL_CELL = /^\p{Nd}+(?:[.．]\p{Nd}+)?$/u;

/**
 * Columns the positional reader may use, per delimiter: the ones at least one
 * line fills with a value a 姓名/院校/城市 could take. A column no line fills is
 * padding an export left behind — an empty 序号 column, a trailing CSV separator
 * — and a column of bare numbers is a 学号 or a date left as its serial. Reading
 * either shifts the row left: "1,林舟,北京大学,北京市" imported a student called
 * 1 attending 林舟, with no warning at all. A header line names its own columns,
 * so a number column only ever goes from a paste without one, and never when it
 * would leave too few columns: "001,北京大学,北京市" may be an anonymized name.
 *
 * A cell blank on only some lines is the opposite: a gap in a column the rest of
 * the paste uses. Dropping that one pulls every later cell of the row a column
 * left, which imported "林舟,,北京市,海外" as a student studying at 北京市 in
 * 海外 — a complete-looking record nothing warned about. So the gap stays,
 * {@link toCandidate} sees the blank, and the row is reported instead.
 */
function usableColumnsByDelimiter(lines: readonly SourceLine[]): UsableColumns {
  const filled = new Map<string, Set<number>>();
  const named = new Map<string, Set<number>>();
  for (const { text } of lines) {
    const delimiter = detectDelimiter(text);
    if (!delimiter) continue;
    if (!named.has(delimiter)) { filled.set(delimiter, new Set()); named.set(delimiter, new Set()); }
    splitCells(text, delimiter).forEach((cell, index) => {
      if (!cell) return;
      filled.get(delimiter)!.add(index);
      if (!SERIAL_CELL.test(cell)) named.get(delimiter)!.add(index);
    });
  }
  for (const [delimiter, usable] of named) {
    if (usable.size >= REQUIRED_STUDENT_COLUMNS.length) continue;
    for (const index of filled.get(delimiter)!) usable.add(index);
  }
  return named;
}

/**
 * Separators of an unlabeled line: whitespace, a 、 {@link detectDelimiter} refused,
 * and a hyphen only where it stands between spaces. A glued hyphen belongs to the
 * value — 玛丽-克莱尔 is one name, and cutting it made 克莱尔 her university silently.
 */
const FREEFORM_SEPARATOR = /\s+[-–—]+\s+|[\s、]+/;

/**
 * Cells of one source line. A delimited line keeps every column, blank ones
 * included, so the positional reader stays aligned and only unusable columns
 * go; an unlabeled line holds no columns, so its runs of spaces collapse.
 *
 * Whitespace opens no column to compare across rows, so a 序号 leading an unlabeled line gives
 * itself away by shape alone: bare digits ahead of enough words to still fill 姓名/院校/城市.
 * Only the positional reader passes `usable`, and only it is shifted by keeping the number.
 */
function splitCells(line: string, delimiter: string | null, usable?: UsableColumns): string[] {
  const content = line.replace(LIST_MARKER, "");
  if (delimiter) {
    const columns = usable?.get(delimiter);
    return splitDelimitedLine(content, delimiter).filter((_, index) => columns?.has(index) ?? true);
  }
  const parts = content.split(FREEFORM_SEPARATOR).map(trimImportCell).filter(Boolean);
  const numbered = usable && parts.length > REQUIRED_STUDENT_COLUMNS.length && SERIAL_CELL.test(parts[0]!);
  return numbered ? parts.slice(1) : parts;
}

function toCandidate(parts: string[], sourceLine: number, rawLine: string): ImportCandidate | null {
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
  const pick = (...labels: string[]): string => labels.map((label) => fields.get(label)).find((value) => value !== undefined) ?? "";
  const name = pick("姓名", "学生", "学生姓名", "name");
  const university = pick("就读院校", "就读学校", "录取院校", "院校", "学校", "university", "school");
  const city = pick("城市", "所在城市", "city");
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScopeValue(pick("去向类型", "destination type"));
  const province = locationScope === "international" ? "" : pick("省份", "省", "province");
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
 * rule, so a partial header still names the columns it does provide. A later
 * line is only accepted when it maps every required column and spells at least
 * two of them exactly: pasted blocks often open with a title or a "更新时间"
 * line, but a data row must never be mistaken for a header.
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

/** A line without one of these is punctuation only — a table rule, a row of separators. */
const DATA_CHARACTER = /[\p{L}\p{N}]/u;

export function parseDelimitedTable(text: string): ImportCandidate[] {
  return parseStudentText(text).candidates;
}

export function parseStudentText(text: string): TextImportResult {
  const lines = splitLines(text);
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  const header = detectTextHeader(lines);
  const headerIsComplete = header !== null && missingRequiredColumns(header.mapping).length === 0;
  const usable = usableColumnsByDelimiter(lines);

  lines.forEach(({ text, sourceLine }, index) => {
    if (header && index === header.lineIndex) return;
    // A rule row ("| --- | --- |") or a line of bare separators holds no data at
    // all: reading it by column imported a student called "---".
    if (!DATA_CHARACTER.test(text)) return;
    // Titles and notes sitting above the header describe the sheet, not a student:
    // parsing them positionally would invent a record, so they are reported instead.
    if (header && index < header.lineIndex) {
      unparsed.push({ sourceLine, rawLine: text, reason: "表头之前的内容" });
      return;
    }
    let missingReason: string | null = null;
    /**
     * The row filled some of the mapped columns, so its gap is real. Reading it by
     * position would shift every value one column left — "学号,姓名,院校,城市" with an
     * empty 城市 imports the student number as the name — so that reader is skipped.
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
      const parts = splitCells(text, detectDelimiter(text), usable);
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
