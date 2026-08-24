import {
  countExactHeaderCells,
  describeMissingCells,
  detectHeaderColumns,
  isBlankImportCell,
  isSummaryRow,
  missingRequiredCells,
  missingRequiredColumns,
  readStudentColumn,
  rowRestatesHeader,
  trimImportCell,
  type StudentColumn,
  type StudentColumnIndexes,
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
  countExactHeaderCells,
  describeMissingCells,
  detectHeaderColumns,
  isBlankImportCell,
  isExactHeaderAlias,
  isSummaryRow,
  looksLikeStudentHeader,
  missingRequiredCells,
  missingRequiredColumns,
  normalizeHeaderCell,
  readStudentColumn,
  REQUIRED_COLUMN_LABELS,
  REQUIRED_STUDENT_COLUMNS,
  rowRestatesHeader,
  STUDENT_HEADER_ALIASES,
  trimImportCell,
} from "./import-headers";
export type { RequiredStudentColumn, StudentColumn, StudentColumnIndexes } from "./import-headers";

const INTERNATIONAL_TOKENS = ["海外", "境外", "国外", "出国", "留学", "international", "overseas", "abroad"];

/** Reads a 去向类型 cell. Anything that is not explicitly overseas stays a China destination. */
export function parseLocationScopeValue(value: string | undefined): "international" | undefined {
  const normalized = (value ?? "").trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return undefined;
  return INTERNATIONAL_TOKENS.some((token) => normalized.includes(token)) ? "international" : undefined;
}

function splitLines(text: string): string[] {
  return text
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    // A leading tab is an empty leading column: trimming it would shift every
    // later cell of a sparse spreadsheet row, so only spaces are stripped.
    .map((line) => line.replace(/^[^\S\t]+|\s+$/g, ""))
    .filter((line) => line.length > 0);
}

function detectDelimiter(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes("，")) return "，";
  if (line.includes(";")) return ";";
  return null;
}

/**
 * RFC4180-style split: a delimiter inside double quotes belongs to the cell,
 * so `"李,四",北京大学,北京` keeps the comma in the student's name. Doubled
 * quotes inside a quoted cell are literal quotes.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
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
  return cells.map(trimImportCell);
}

/** Delimiter-aware split that keeps empty cells so column indexes stay aligned. */
function splitCells(line: string, delimiter: string | null): string[] {
  if (!delimiter) return splitParts(line, null);
  return splitDelimitedLine(line, delimiter);
}

function splitParts(line: string, delimiter: string | null): string[] {
  if (delimiter) {
    return splitDelimitedLine(line, delimiter).filter(Boolean);
  }

  return line
    .replace(/^\d+[\.、\)]\s*/, "")
    .split(/[\s,，、;；\-\|]+/)
    .map(trimImportCell)
    .filter(Boolean);
}

function toCandidate(
  parts: string[],
  sourceLine: number,
  rawLine: string,
): ImportCandidate | null {
  if (parts.length < 3) return null;
  const [name, university, city, scope] = parts;
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScopeValue(scope);
  return {
    name,
    university,
    city,
    ...(locationScope ? { locationScope } : {}),
    sourceLine,
    rawLine,
  };
}

/** Builds a candidate from a detected header mapping; returns null when a required cell is blank. */
export function candidateFromColumns(
  cells: string[],
  indexes: StudentColumnIndexes,
  sourceLine: number,
  rawLine: string,
): ImportCandidate | null {
  const read = (column: StudentColumn): string => readStudentColumn(cells, indexes, column);
  const name = read("name");
  const university = read("university");
  const city = read("city");
  if (!name || !university || !city) return null;
  const locationScope = parseLocationScopeValue(read("locationScope"));
  // A Chinese province column is an optional override; overseas rows never need one.
  const province = locationScope === "international" ? "" : read("province");
  return {
    name,
    university,
    city,
    ...(province ? { province } : {}),
    ...(locationScope ? { locationScope } : {}),
    sourceLine,
    rawLine,
  };
}

function parseLabeledCandidate(
  line: string,
  sourceLine: number,
): ImportCandidate | null {
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
    name,
    university,
    city,
    ...(province ? { province } : {}),
    ...(locationScope ? { locationScope } : {}),
    sourceLine,
    rawLine: line,
  };
}

interface TextHeader {
  lineIndex: number;
  delimiter: string | null;
  cells: string[];
  indexes: StudentColumnIndexes;
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
function detectTextHeader(lines: string[]): TextHeader | null {
  for (const [lineIndex, line] of lines.slice(0, TEXT_HEADER_SEARCH_DEPTH).entries()) {
    const delimiter = detectDelimiter(line);
    const cells = splitCells(line, delimiter);
    if (cells.filter(Boolean).length < 2) continue;
    const indexes = detectHeaderColumns(cells);
    const header = { lineIndex, delimiter, cells, indexes };
    if (lineIndex === 0) {
      if (Object.keys(indexes).length >= 2) return header;
      continue;
    }
    if (missingRequiredColumns(indexes).length > 0) continue;
    if (countExactHeaderCells(cells, indexes) >= MIN_LATE_HEADER_EXACT_CELLS) return header;
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
  const headerIsComplete = header !== null && missingRequiredColumns(header.indexes).length === 0;

  lines.forEach((line, index) => {
    if (header && index === header.lineIndex) return;
    // Titles and notes sitting above the header describe the sheet, not a
    // student: parsing them positionally would invent a record, so they are
    // reported as skipped instead.
    if (header && index < header.lineIndex) {
      unparsed.push({ sourceLine: index + 1, rawLine: line, reason: "表头之前的内容" });
      return;
    }
    let missingReason: string | null = null;

    if (headerIsComplete) {
      const cells = splitCells(line, header!.delimiter);
      // Two exports stacked together repeat the header; it is not a student.
      if (rowRestatesHeader(cells, header!.indexes, header!.cells)) return;
      if (isSummaryRow(cells, header!.indexes)) {
        unparsed.push({ sourceLine: index + 1, rawLine: line, reason: "汇总行" });
        return;
      }
      const mapped = candidateFromColumns(cells, header!.indexes, index + 1, line);
      if (mapped) {
        candidates.push(mapped);
        return;
      }
      // A row of only separators carries no data at all and is not a problem.
      if (cells.every(isBlankImportCell)) return;
      missingReason = describeMissingCells(missingRequiredCells(cells, header!.indexes));
    }

    const labeledCandidate = parseLabeledCandidate(line, index + 1);
    if (labeledCandidate) {
      candidates.push(labeledCandidate);
      return;
    }

    const parts = splitParts(line, detectDelimiter(line));
    const candidate = toCandidate(parts, index + 1, line);
    if (candidate) {
      candidates.push(candidate);
      return;
    }

    unparsed.push({
      sourceLine: index + 1,
      rawLine: line,
      reason: missingReason ?? "无法识别学生名称、录取院校和城市",
    });
  });

  return { candidates, unparsed };
}
