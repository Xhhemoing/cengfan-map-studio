import { describe, expect, it } from "vitest";
import { createImportTemplateSheets, parseExcelArrayBuffer, parseExcelWorkbookRows, parseOcrLikeText } from "./binary-import";

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

  it("maps a 去向 column holding university names onto the university field", () => {
    const result = parseExcelWorkbookRows([
      ["2026 届毕业生去向统计"],
      ["姓名", "去向", "所在城市", "类型"],
      ["林舟", "北京大学", "北京市", "中国去向"],
      ["周晴", "哈佛大学", "美国·波士顿", "海外去向"],
    ]);

    expect(result.headerRowIndex).toBe(1);
    expect(result.missingRequiredFields).toEqual([]);
    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "university", sourceHeader: "去向" }),
      expect.objectContaining({ field: "locationScope", sourceHeader: "类型" }),
    ]));
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "美国·波士顿", locationScope: "international" }),
    ]);
    // 表头行绝不能变成「姓名｜去向」假学生。
    expect(result.candidates.some((candidate) => candidate.name === "姓名")).toBe(false);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps 去向 as the destination scope when the column holds scope values", () => {
    const result = parseExcelWorkbookRows([
      ["姓名", "录取院校", "城市", "去向"],
      ["林舟", "北京大学", "北京市", "中国去向"],
      ["周晴", "哈佛大学", "美国·波士顿", "海外"],
    ]);

    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "university", sourceHeader: "录取院校" }),
      expect.objectContaining({ field: "locationScope", sourceHeader: "去向" }),
    ]));
    expect(result.candidates[1]).toMatchObject({ locationScope: "international" });
  });

  it("surfaces rows missing required fields as unparsed instead of dropping them silently", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
      ["苏禾", "", "杭州市"],
      ["", "", ""],
      ["顾言", "复旦大学", "上海市"],
      ["陈宁", "", ""],
    ]);

    expect(result.candidates).toHaveLength(2);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "苏禾\t杭州市", reason: "缺少必填字段：录取院校" },
      { sourceLine: 6, rawLine: "陈宁", reason: "缺少必填字段：录取院校、城市" },
    ]);
  });

  it("does not turn the header or leading notes into candidates when required columns are missing", () => {
    const result = parseExcelWorkbookRows([
      ["填写说明：请勿修改表头"],
      ["学生姓名", "录取院校", "备注"],
      ["林舟", "北京大学", "缺城市列"],
    ]);

    expect(result.missingRequiredFields).toEqual(["city"]);
    expect(result.candidates.some((candidate) => candidate.name === "学生姓名" || candidate.name === "填写说明：请勿修改表头")).toBe(false);
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
  });
});
