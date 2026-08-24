import { describe, expect, it } from "vitest";
import {
  createImportTemplateSheets,
  expandMergedCells,
  parseExcelArrayBuffer,
  parseExcelWorkbookRows,
  parseHtmlTable,
  parseHtmlTableRows,
  parseOcrLikeText,
} from "./binary-import";
import { parseHtmlTableRows as extractedParseHtmlTableRows } from "./html-table-parse";

describe("binary import adapters", () => {
  it("parses excel-like row matrix into candidates", () => {
    const result = parseExcelArrayBuffer([
      ["姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京"],
      ["苏禾", "浙江大学", "杭州"],
    ]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      name: "林舟",
      university: "北京大学",
      city: "北京",
    });
  });

  it("maps reordered bilingual headers for name, enrolled university, and city", () => {
    const result = parseExcelWorkbookRows([
      ["城市", "就读学校", "学生姓名", "备注"],
      ["杭州", "浙江大学", "苏禾", "保研"],
      ["北京", "清华大学", "陈宁", ""],
    ]);

    expect(result.candidates).toEqual([
      {
        name: "苏禾",
        university: "浙江大学",
        city: "杭州",
        sourceLine: 2,
        rawLine: "杭州\t浙江大学\t苏禾\t保研",
      },
      {
        name: "陈宁",
        university: "清华大学",
        city: "北京",
        sourceLine: 3,
        rawLine: "北京\t清华大学\t陈宁",
      },
    ]);
  });

  it("parses ocr-like free text into candidates", () => {
    const result = parseOcrLikeText("1. 林舟 北京大学 北京\n2. 苏禾 浙江大学 杭州");
    expect(result.candidates).toHaveLength(2);
    expect(result.unparsed).toEqual([]);
  });

  it("finds a shuffled header row after leading notes and exposes representative samples", () => {
    const result = parseExcelWorkbookRows([
      ["这是填写说明"],
      ["更新时间", "2026"],
      ["所在城市", "录取学校", "学生姓名", "去向类型", "备注"],
      ["杭州市", "浙江大学", "苏禾", "中国去向", "保研"],
      ["北京市", "北京大学", "林舟", "海外", "交换"],
    ]);

    expect(result.headerRowIndex).toBe(2);
    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "name", sourceHeader: "学生姓名", samples: ["苏禾", "林舟"] }),
      expect.objectContaining({ field: "university", sourceHeader: "录取学校", samples: ["浙江大学", "北京大学"] }),
      expect.objectContaining({ field: "city", sourceHeader: "所在城市", samples: ["杭州市", "北京市"] }),
    ]));
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", locationScope: "international" }),
    ]);
    expect(result.unmappedHeaders).toEqual(["备注"]);
  });

  it("reads a merged export whose duplicated 姓名 columns are filled unevenly", () => {
    const result = parseExcelWorkbookRows([
      ["姓名", "姓名", "院校", "城市"],
      ["林舟", "", "北京大学", "北京市"],
      ["", "苏禾", "浙江大学", "杭州市"],
    ]);

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
    // The twin backs the claimed column up, so it is in use rather than ignored.
    expect(result.unmappedHeaders).toEqual([]);
  });

  it("recognizes common English headers and reports missing required columns", () => {
    const result = parseExcelWorkbookRows([
      ["student name", "school", "备注"],
      ["Lin", "Peking University", "needs city"],
    ]);

    expect(result.columnMappings).toEqual([
      expect.objectContaining({ field: "name", sourceHeader: "student name" }),
      expect.objectContaining({ field: "university", sourceHeader: "school" }),
    ]);
    expect(result.missingRequiredFields).toEqual(["city"]);
  });

  it("builds a canonical import template with a separate guide sheet", () => {
    const template = createImportTemplateSheets();

    expect(template.data[0]).toEqual(["学生姓名", "录取院校", "城市", "去向类型"]);
    expect(template.data[1]).toEqual(["", "", "", ""]);
    expect(template.guide).toEqual(expect.arrayContaining([
      ["字段", "必填", "示例"],
      ["学生姓名", "是", "林舟"],
      ["去向类型", "否", "中国去向 / 海外去向"],
    ]));
    expect(template.guide.map((row) => row[2]).join("\n")).toContain("合并单元格");
  });

  it("returns an empty result for an empty or blank-only sheet", () => {
    expect(parseExcelWorkbookRows([])).toEqual({
      candidates: [],
      unparsed: [],
      columnMappings: [],
      unmappedHeaders: [],
      missingRequiredFields: [],
    });
    const blank = parseExcelWorkbookRows([["", ""], ["   "]]);
    expect(blank.candidates).toEqual([]);
    expect(blank.unparsed).toEqual([]);
    expect(blank.headerRowIndex).toBeUndefined();
  });

  it("matches headers coming from a BOM-prefixed CSV and numeric cells", () => {
    const result = parseExcelWorkbookRows([
      ["\uFEFF姓名", "学校", "城市"],
      ["林舟", "北京大学", "北京"],
      [123, "清华大学", "北京"],
    ]);

    expect(result.headerRowIndex).toBe(0);
    expect(result.missingRequiredFields).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学" }),
      expect.objectContaining({ name: "123", university: "清华大学" }),
    ]);
  });

  it("maps a province column and keeps it off overseas rows", () => {
    const result = parseExcelWorkbookRows([
      ["名字", "去向", "市", "省", "去向类型"],
      ["苏禾", "浙江大学", "杭州市", "浙江省", "中国去向"],
      ["周晴", "哈佛大学", "美国·波士顿", "", "海外"],
    ]);

    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "province", sourceHeader: "省" }),
      expect.objectContaining({ field: "city", sourceHeader: "市" }),
      expect.objectContaining({ field: "university", sourceHeader: "去向" }),
    ]));
    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "苏禾", province: "浙江省" }));
    expect(result.candidates[0]).not.toHaveProperty("locationScope");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
    expect(result.candidates[1]).not.toHaveProperty("province");
    expect(result.unmappedHeaders).toEqual([]);
  });

  it("skips rows that leave a required cell blank and says which cell is missing", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市"],
      ["苏禾", "浙江大学", "杭州市"],
      ["   ", "浙江大学", "杭州市"],
      ["缺城市", "浙江大学", ""],
      ["", "", ""],
    ]);

    expect(result.candidates).toEqual([expect.objectContaining({ name: "苏禾", sourceLine: 2 })]);
    // A trailing blank sheet row is normal; the two partial rows are reported.
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "浙江大学\t杭州市", reason: "缺少姓名" },
      { sourceLine: 4, rawLine: "缺城市\t浙江大学", reason: "缺少城市" },
    ]);
  });

  it("fills a merged 省份 block down its rows so only the anchor cell needs a value", () => {
    const rows = [
      ["学生姓名", "录取院校", "城市", "省份"],
      ["苏禾", "浙江大学", "杭州市", "浙江省"],
      ["陈宁", "宁波大学", "宁波市", ""],
      ["林舟", "北京大学", "北京市", "北京市"],
    ];
    const merges = [{ s: { r: 1, c: 3 }, e: { r: 2, c: 3 } }];

    expect(parseExcelWorkbookRows(rows, { merges }).candidates).toEqual([
      expect.objectContaining({ name: "苏禾", province: "浙江省" }),
      expect.objectContaining({ name: "陈宁", province: "浙江省" }),
      expect.objectContaining({ name: "林舟", province: "北京市" }),
    ]);
    // Without the merge ranges the blank cell stays blank instead of guessing.
    expect(parseExcelWorkbookRows(rows).candidates[1]).not.toHaveProperty("province");
  });

  it("recovers a sparse row whose only required cell comes from a vertical merge", () => {
    const result = parseExcelWorkbookRows(
      [
        ["城市", "录取院校", "学生姓名"],
        ["杭州市", "浙江大学", "苏禾"],
        ["", "浙江大学", "陈宁"],
      ],
      { merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }] },
    );

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", city: "杭州市" }),
      expect.objectContaining({ name: "陈宁", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("expands a merge block without overwriting cells the user filled in", () => {
    expect(expandMergedCells(
      [["浙江省", "", "杭州市"], ["", "宁波市", ""]],
      [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }],
    )).toEqual([
      ["浙江省", "浙江省", "杭州市"],
      ["浙江省", "宁波市", ""],
    ]);
    // A merge anchored on a blank cell has nothing to copy.
    expect(expandMergedCells([["", ""], ["", ""]], [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }]))
      .toEqual([["", ""], ["", ""]]);
    expect(expandMergedCells([["浙江省"]])).toEqual([["浙江省"]]);
  });

  it("keeps the first of two identically named columns on a very wide sheet", () => {
    const headers = Array.from({ length: 120 }, (_, index) => `扩展字段${index + 1}`);
    headers[0] = "学生姓名";
    headers[1] = "录取院校";
    headers[2] = "城市";
    // A second 城市 column (an export artefact) must not take over the mapping.
    headers[60] = "城市";
    const row = headers.map(() => "");
    row[0] = "苏禾";
    row[1] = "浙江大学";
    row[2] = "杭州市";
    row[60] = "宁波市";

    const result = parseExcelWorkbookRows([headers, row]);

    expect(result.columnMappings.find((mapping) => mapping.field === "city")?.columnIndex).toBe(2);
    expect(result.candidates).toEqual([expect.objectContaining({ name: "苏禾", city: "杭州市" })]);
    expect(result.unparsed).toEqual([]);
  });

  it("skips a header row a stacked export repeats in the middle of the sheet", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市"],
      ["苏禾", "浙江大学", "杭州市"],
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
    ]);

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["苏禾", "林舟"]);
    expect(result.unparsed).toEqual([]);
  });

  it("falls back to free-text parsing when the sheet has no recognizable header", () => {
    const result = parseExcelWorkbookRows([
      ["林舟", "北京大学", "北京"],
      ["苏禾", "浙江大学", "杭州"],
    ]);

    expect(result.headerRowIndex).toBeUndefined();
    expect(result.candidates).toHaveLength(2);
  });

  it("keeps a blank cell through the free-text fallback so later columns stay aligned", () => {
    // The CSV row 林舟,,北京市 reaches the fallback as a matrix row with an empty middle cell.
    // Dropping the gap would shift 北京市 into the 院校 column; keeping it means the row stays
    // three columns wide and is reported instead of silently misread.
    const result = parseExcelWorkbookRows([
      ["苏禾", "浙江大学", "杭州市"],
      ["林舟", "", "北京市"],
    ]);

    expect(result.headerRowIndex).toBeUndefined();
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟\t\t北京市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("re-exports the html table parser extracted into html-table-parse", () => {
    // Call sites import parseHtmlTableRows from binary-import; the identity check pins the
    // re-export to the extracted implementation (behaviour lives in html-table-parse.test.ts).
    expect(parseHtmlTableRows).toBe(extractedParseHtmlTableRows);
    const result = parseHtmlTable(
      "<table><tr><th>姓名</th><th>院校</th><th>城市</th></tr><tr><td>林舟</td><td>北京大学</td><td>北京市</td></tr></table>",
    );
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
  });
});
