import { parseStudentText, type TextImportResult } from "./import-data";

type StudentColumn = "name" | "university" | "city";

const HEADER_ALIASES: Record<StudentColumn, readonly string[]> = {
  name: ["姓名", "学生", "学生姓名", "名字", "name", "student", "student name"],
  university: ["院校", "录取院校", "大学", "学校", "就读学校", "就读院校", "university", "school", "college"],
  city: ["城市", "所在城市", "目的地城市", "city", "destination city"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s_\-()（）]/g, "");
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

export function parseExcelArrayBuffer(input: ArrayBuffer | string[][]): TextImportResult {
  if (Array.isArray(input)) {
    return parseStudentText(matrixToText(input));
  }
  // Binary workbook decoding is handled at the UI boundary with xlsx.
  // Tests and pure adapters can pass row matrices directly.
  void input;
  return parseStudentText("");
}

export function parseExcelWorkbookRows(rows: string[][]): TextImportResult {
  const header = rows[0] ?? [];
  const indexes = findColumnIndexes(header);
  if (indexes.name !== undefined && indexes.university !== undefined && indexes.city !== undefined) {
    const candidates = rows.slice(1).flatMap((row, rowIndex) => {
      const name = row[indexes.name!]?.trim() ?? "";
      const university = row[indexes.university!]?.trim() ?? "";
      const city = row[indexes.city!]?.trim() ?? "";
      if (!name || !university || !city) return [];
      return [{
        name,
        university,
        city,
        sourceLine: rowIndex + 2,
        rawLine: row.filter((cell) => cell.trim()).join("\t"),
      }];
    });
    return { candidates, unparsed: [] };
  }
  return parseStudentText(matrixToText(rows));
}

export function parseOcrLikeText(text: string): TextImportResult {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s{2,}/g, " ");
  return parseStudentText(normalized);
}
