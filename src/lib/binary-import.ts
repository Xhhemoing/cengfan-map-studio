import { parseStudentText, type TextImportResult } from "./import-data";

export type StudentColumn = "name" | "university" | "city" | "locationScope";

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

const REQUIRED_COLUMNS = ["name", "university", "city"] as const;

const HEADER_ALIASES: Record<StudentColumn, readonly string[]> = {
  name: ["姓名", "学生", "学生姓名", "名字", "name", "student", "student name", "full name"],
  university: [
    "院校",
    "录取院校",
    "录取学校",
    "大学",
    "学校",
    "就读学校",
    "就读院校",
    "university",
    "school",
    "college",
    "enrolled university",
  ],
  city: ["城市", "所在城市", "目的地城市", "city", "destination city", "location"],
  locationScope: ["去向类型", "去向", "地区类型", "destination type", "location scope", "scope"],
};

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

function matrixToText(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join("\t"))
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
  const mappedIndexes = new Set<number>();
  const columnMappings = (Object.keys(HEADER_ALIASES) as StudentColumn[]).flatMap((field) => {
    const columnIndex = header.indexes[field];
    if (columnIndex === undefined) return [];
    mappedIndexes.add(columnIndex);
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
  if (metadata.missingRequiredFields.length > 0) {
    return { ...parseStudentText(matrixToText(rows)), ...metadata };
  }

  const candidates = rows.slice(header.rowIndex + 1).flatMap((row, rowIndex) => {
    const name = row[header.indexes.name!]?.trim() ?? "";
    const university = row[header.indexes.university!]?.trim() ?? "";
    const city = row[header.indexes.city!]?.trim() ?? "";
    if (!name || !university || !city) return [];
    const locationScope = parseLocationScope(row[header.indexes.locationScope!]);
    return [{
      name,
      university,
      city,
      ...(locationScope ? { locationScope } : {}),
      sourceLine: header.rowIndex + rowIndex + 2,
      rawLine: row.map((cell) => cell.trim()).filter(Boolean).join("\t"),
    }];
  });

  return {
    candidates,
    unparsed: [],
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
