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

/** Columns a roster source can provide. `name`/`university`/`city` are required. */
export type StudentColumn = "name" | "university" | "city" | "province" | "locationScope";

export const REQUIRED_STUDENT_COLUMNS = ["name", "university", "city"] as const;

export type RequiredStudentColumn = (typeof REQUIRED_STUDENT_COLUMNS)[number];

/**
 * Header aliases used by every roster source (pasted text, CSV, XLSX).
 * Values are compared after {@link normalizeHeaderCell}, so spacing, casing,
 * BOM, brackets and trailing "必填"-style markers do not have to be listed.
 *
 * Field order below is also the claim order: when one header cell could serve
 * two fields, the earlier field wins and the later one stays unmapped.
 */
export const STUDENT_HEADER_ALIASES: Record<StudentColumn, readonly string[]> = {
  name: ["姓名", "名字", "学生", "学生姓名", "学生名称", "同学", "同学姓名", "name", "student", "studentname", "fullname"],
  university: [
    "院校",
    "学校",
    "去向",
    "录取院校",
    "录取学校",
    "毕业去向",
    "去向院校",
    "升学去向",
    "深造院校",
    "大学",
    "就读学校",
    "就读院校",
    "university",
    "school",
    "college",
    "enrolleduniversity",
    "destination",
  ],
  city: ["城市", "市", "所在城市", "目的地城市", "城市地区", "所在地", "city", "destinationcity", "location"],
  province: ["省份", "省", "所在省份", "省自治区", "省直辖市", "province", "state"],
  locationScope: ["去向类型", "地区类型", "国内海外", "是否海外", "destinationtype", "locationscope", "scope"],
};

const STUDENT_COLUMN_ORDER = Object.keys(STUDENT_HEADER_ALIASES) as StudentColumn[];

/** Strips BOM, whitespace, separators and decoration so header aliases stay short. */
export function normalizeHeaderCell(value: string): string {
  return value
    .replace(/\uFEFF/g, "")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s_\-()（）[\]【】*＊]/g, "")
    .replace(/[:：]$/, "")
    .replace(/(必填|选填|可选)$/, "");
}

const NORMALIZED_HEADER_ALIASES = new Map<StudentColumn, Set<string>>(
  STUDENT_COLUMN_ORDER.map((column) => [
    column,
    new Set(STUDENT_HEADER_ALIASES[column].map(normalizeHeaderCell)),
  ]),
);

export type StudentColumnIndexes = Partial<Record<StudentColumn, number>>;

/**
 * Maps header cells to student columns. Every source column is claimed by at
 * most one field so an ambiguous header (e.g. "去向" next to "学校") cannot be
 * silently read as two different fields.
 */
export function detectHeaderColumns(headers: string[]): StudentColumnIndexes {
  const normalized = headers.map((cell) => normalizeHeaderCell(String(cell ?? "")));
  const indexes: StudentColumnIndexes = {};
  const claimed = new Set<number>();
  for (const column of STUDENT_COLUMN_ORDER) {
    const aliases = NORMALIZED_HEADER_ALIASES.get(column)!;
    const index = normalized.findIndex((cell, cellIndex) => cell !== "" && !claimed.has(cellIndex) && aliases.has(cell));
    if (index >= 0) {
      indexes[column] = index;
      claimed.add(index);
    }
  }
  return indexes;
}

export function missingRequiredColumns(indexes: StudentColumnIndexes): RequiredStudentColumn[] {
  return REQUIRED_STUDENT_COLUMNS.filter((column) => indexes[column] === undefined);
}

/** A row of header cells is only treated as a header when it maps at least two fields. */
export function looksLikeStudentHeader(cells: string[]): boolean {
  return Object.keys(detectHeaderColumns(cells)).length >= 2;
}

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
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function detectDelimiter(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes("，")) return "，";
  if (line.includes(";")) return ";";
  return null;
}

/** Delimiter-aware split that keeps empty cells so column indexes stay aligned. */
function splitCells(line: string, delimiter: string | null): string[] {
  if (!delimiter) return splitParts(line, null);
  return line.split(delimiter).map((part) => part.trim());
}

function splitParts(line: string, delimiter: string | null): string[] {
  if (delimiter) {
    return line
      .split(delimiter)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return line
    .replace(/^\d+[\.、\)]\s*/, "")
    .split(/[\s,，、;；\-\|]+/)
    .map((part) => part.trim())
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
  const read = (column: StudentColumn): string => {
    const index = indexes[column];
    if (index === undefined) return "";
    return (cells[index] ?? "").replace(/\uFEFF/g, "").trim();
  };
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
    fields.set(label, line.slice(start, end).replace(/^[\s,，;；|｜]+|[\s,，;；|｜]+$/g, "").trim());
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
  indexes: StudentColumnIndexes;
}

/** Detects a header on the first non-empty line only, so data-first pastes keep working. */
function detectTextHeader(lines: string[]): TextHeader | null {
  const first = lines[0];
  if (!first) return null;
  const delimiter = detectDelimiter(first);
  const cells = splitCells(first, delimiter);
  if (cells.filter(Boolean).length < 2) return null;
  const indexes = detectHeaderColumns(cells);
  if (Object.keys(indexes).length < 2) return null;
  return { lineIndex: 0, delimiter, indexes };
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

    if (headerIsComplete) {
      const mapped = candidateFromColumns(
        splitCells(line, header!.delimiter),
        header!.indexes,
        index + 1,
        line,
      );
      if (mapped) {
        candidates.push(mapped);
        return;
      }
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
      reason: "无法识别学生名称、录取院校和城市",
    });
  });

  return { candidates, unparsed };
}
