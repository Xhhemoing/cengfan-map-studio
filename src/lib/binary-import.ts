import { parseStudentText, type TextImportResult, type UnparsedLine } from "./import-data";
import { resolveUniversity } from "./search-catalog";

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
    // 毕业班名单常用「毕业去向」表示录取院校；该列写的是学校名而非去向类型。
    "毕业去向",
    "去向院校",
    "去向学校",
    "university",
    "school",
    "college",
    "enrolled university",
  ],
  city: ["城市", "所在城市", "目的地城市", "city", "destination city", "location"],
  locationScope: ["去向类型", "去向", "类型", "地区类型", "destination type", "location scope", "scope"],
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

function looksLikeUniversityName(value: string): boolean {
  if (/大学|学院|university|college|institute/i.test(value)) return true;
  return resolveUniversity(value).status === "resolved";
}

/**
 * 「去向」/「类型」这类模糊表头默认映射到去向类型，但很多名单在该列填的是
 * 录取院校。当院校列缺失时按内容改判：先看已映射为去向类型的列，再看别名
 * 表不认识的未映射列；内容以大学名为主的列改判为录取院校，去向类型让位给
 * 其余未映射的别名列（如「类型」）。这样确认面板不会一边报「缺少录取院校」
 * 一边又列出满是院校名的候选。
 */
function refineIndexesByContent(
  rows: string[][],
  header: { rowIndex: number; headers: string[]; indexes: Partial<Record<StudentColumn, number>> },
): Partial<Record<StudentColumn, number>> {
  const indexes = { ...header.indexes };
  if (indexes.university !== undefined) return indexes;

  const mostlyUniversityNames = (column: number): boolean => {
    const samples = rows
      .slice(header.rowIndex + 1)
      .map((row) => row[column]?.trim() ?? "")
      .filter(Boolean);
    return samples.length > 0 && samples.filter(looksLikeUniversityName).length * 2 >= samples.length;
  };

  if (indexes.locationScope !== undefined && mostlyUniversityNames(indexes.locationScope)) {
    indexes.university = indexes.locationScope;
    delete indexes.locationScope;
    const taken = new Set(Object.values(indexes));
    const scopeAliases = HEADER_ALIASES.locationScope.map(normalizeHeader);
    const fallback = header.headers.findIndex(
      (cell, index) => !taken.has(index) && scopeAliases.includes(normalizeHeader(cell)),
    );
    if (fallback >= 0) indexes.locationScope = fallback;
    return indexes;
  }

  const taken = new Set(Object.values(indexes));
  const promoted = header.headers.findIndex(
    (cell, index) => Boolean(cell) && !taken.has(index) && mostlyUniversityNames(index),
  );
  if (promoted >= 0) indexes.university = promoted;
  return indexes;
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
  if (!best) return null;
  const refined = refineIndexesByContent(rows, best);
  return { rowIndex: best.rowIndex, headers: best.headers, indexes: refined };
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

const REQUIRED_FIELD_LABELS: Record<Extract<StudentColumn, "name" | "university" | "city">, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
};

export function parseExcelWorkbookRows(rows: string[][]): ExcelImportResult {
  const header = findHeaderRow(rows);
  if (!header) return { ...parseStudentText(matrixToText(rows)), ...emptyMetadata() };

  const metadata = createMetadata(rows, header);
  if (metadata.missingRequiredFields.length > 0) {
    // 只把表头之后的内容交给文本回退解析：表头行与其上方的说明行不是学生数据，
    // 不能变成「姓名｜去向」这类假学生。
    return { ...parseStudentText(matrixToText(rows.slice(header.rowIndex + 1))), ...metadata };
  }

  const candidates: ExcelImportResult["candidates"] = [];
  const unparsed: UnparsedLine[] = [];
  rows.slice(header.rowIndex + 1).forEach((row, rowIndex) => {
    const rawLine = row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join("\t");
    // 完全空行（模板自带的示例空行）不是数据也不算错误。
    if (!rawLine) return;
    const sourceLine = header.rowIndex + rowIndex + 2;
    const name = row[header.indexes.name!]?.trim() ?? "";
    const university = row[header.indexes.university!]?.trim() ?? "";
    const city = row[header.indexes.city!]?.trim() ?? "";
    if (!name || !university || !city) {
      // 缺必填字段的行必须回显给用户，不允许静默丢弃。
      const missing = (Object.keys(REQUIRED_FIELD_LABELS) as Array<keyof typeof REQUIRED_FIELD_LABELS>)
        .filter((field) => !row[header.indexes[field]!]?.trim())
        .map((field) => REQUIRED_FIELD_LABELS[field]);
      unparsed.push({ sourceLine, rawLine, reason: `缺少必填字段：${missing.join("、")}` });
      return;
    }
    const locationScope = parseLocationScope(header.indexes.locationScope === undefined ? undefined : row[header.indexes.locationScope]);
    candidates.push({
      name,
      university,
      city,
      ...(locationScope ? { locationScope } : {}),
      sourceLine,
      rawLine,
    });
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
