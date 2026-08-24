import {
  COLUMN_LABELS,
  HEADER_ALIASES,
  matchStudentColumn,
  parseLocationScope,
  REQUIRED_COLUMNS,
  type RequiredStudentColumn,
  type StudentColumn,
} from "./import-aliases";
import { parseStudentText, type TextImportResult, type UnparsedLine } from "./import-data";

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

function findColumnIndexes(header: string[]): Partial<Record<StudentColumn, number>> {
  const indexes: Partial<Record<StudentColumn, number>> = {};
  header.forEach((cell, index) => {
    const column = matchStudentColumn(cell);
    if (column && indexes[column] === undefined) indexes[column] = index;
  });
  return indexes;
}

function toRowCells(row: string[] | undefined): string[] {
  return (row ?? []).map((cell) => String(cell ?? "").trim());
}

function rowRawLine(cells: string[]): string {
  return cells.filter(Boolean).join("\t");
}

function matrixToText(rows: string[][]): string {
  return rows
    .map((row) => rowRawLine(toRowCells(row)))
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
    candidates.push({
      ...values,
      ...(locationScope ? { locationScope } : {}),
      sourceLine,
      rawLine,
    });
  }

  return { candidates, unparsed, ...metadata };
}

export function parseOcrLikeText(text: string): TextImportResult {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s{2,}/g, " ");
  return parseStudentText(normalized);
}
