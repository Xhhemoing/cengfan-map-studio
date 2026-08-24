import { describe, expect, it } from "vitest";
import {
  buildRosterExportRows,
  buildRosterExportSheets,
  createRosterExportFilename,
  rosterExportHeader,
} from "./roster-export";
import { createImportTemplateSheets, parseExcelWorkbookRows } from "./binary-import";
import type { Student } from "./project-data";

const roster: Student[] = [
  { id: "student-1", name: "顾青禾", university: "浙江大学", city: "杭州市", visibility: true },
  { id: "student-2", name: "沈砚", university: "北京大学", city: "北京市", province: "北京市", visibility: true },
  { id: "student-3", name: "周晚", university: "哈佛大学", city: "美国·波士顿", locationScope: "international", visibility: false },
  { id: "student-4", name: "陆见川", university: "四川大学", city: "成都市", locationScope: "china", visibility: true },
];

describe("roster-export", () => {
  it("uses the import template header as the single source of truth", () => {
    const [header] = buildRosterExportRows(roster);

    expect(header).toEqual(createImportTemplateSheets().data[0]);
    expect(header).toEqual(["学生姓名", "录取院校", "城市", "去向类型"]);
  });

  it("returns a fresh header array so callers cannot mutate the template", () => {
    const header = rosterExportHeader();
    header[0] = "被改坏的表头";

    expect(rosterExportHeader()[0]).toBe("学生姓名");
    expect(createImportTemplateSheets().data[0]?.[0]).toBe("学生姓名");
  });

  it("writes the destination scope as 中国去向 / 海外去向", () => {
    const [, implicitChina, , international, explicitChina] = buildRosterExportRows(roster);

    expect(implicitChina).toEqual(["顾青禾", "浙江大学", "杭州市", "中国去向"]);
    expect(international).toEqual(["周晚", "哈佛大学", "美国·波士顿", "海外去向"]);
    expect(explicitChina).toEqual(["陆见川", "四川大学", "成都市", "中国去向"]);
  });

  it("trims stored values and can limit the export to visible records", () => {
    const rows = buildRosterExportRows(
      [{ id: "student-9", name: " 温言 ", university: " 南京大学 ", city: " 南京市 ", visibility: true }, roster[2]!],
      { visibleOnly: true },
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["温言", "南京大学", "南京市", "中国去向"]);
  });

  it("round-trips exported rows back through parseExcelWorkbookRows", () => {
    const rows = buildRosterExportRows(roster);
    const parsed = parseExcelWorkbookRows(rows);

    expect(parsed.headerRowIndex).toBe(0);
    expect(parsed.missingRequiredFields).toEqual([]);
    expect(parsed.unmappedHeaders).toEqual([]);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.candidates.map((candidate) => ({
      name: candidate.name,
      university: candidate.university,
      city: candidate.city,
      locationScope: candidate.locationScope ?? "china",
    }))).toEqual(roster.map((student) => ({
      name: student.name,
      university: student.university,
      city: student.city,
      locationScope: student.locationScope ?? "china",
    })));
  });

  it("keeps 1-based sheet row numbers when the export is re-imported", () => {
    const parsed = parseExcelWorkbookRows(buildRosterExportRows(roster));

    expect(parsed.candidates.map((candidate) => candidate.sourceLine)).toEqual([2, 3, 4, 5]);
  });

  it("round-trips through a real xlsx workbook", async () => {
    const XLSX = await import("xlsx");
    const sheets = buildRosterExportSheets(roster);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheets.data), "学生数据");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheets.guide), "填写说明");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const reopened = XLSX.read(bytes, { type: "array" });
    const sheet = reopened.Sheets[reopened.SheetNames[0]!]!;
    const matrix = XLSX.utils
      .sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" })
      .map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()));
    const parsed = parseExcelWorkbookRows(matrix);

    expect(parsed.unparsed).toEqual([]);
    expect(parsed.candidates.map((candidate) => candidate.name)).toEqual(["顾青禾", "沈砚", "周晚", "陆见川"]);
    expect(parsed.candidates[2]?.locationScope).toBe("international");
    expect(parsed.candidates[0]?.locationScope).toBeUndefined();
  });

  it("exports the template guide sheet alongside the roster", () => {
    expect(buildRosterExportSheets(roster).guide).toEqual(createImportTemplateSheets().guide);
  });

  it("names the export file with the export date", () => {
    expect(createRosterExportFilename(new Date(2026, 7, 9))).toBe("蹭饭图-学生名单-20260809.xlsx");
  });

  it("exports only the header for an empty roster", () => {
    expect(buildRosterExportRows([])).toEqual([createImportTemplateSheets().data[0]]);
  });
});
