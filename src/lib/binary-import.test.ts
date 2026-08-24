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
    expect(result.unparsed).toEqual([]);
    expect(result.unmappedHeaders).toEqual([]);
    expect(result.missingRequiredFields).toEqual([]);
  });

  it("parses the canonical template header without leftovers", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市", "去向类型"],
      ["林舟", "北京大学", "北京市", "中国去向"],
      ["周晴", "哈佛大学", "美国·波士顿", "海外去向"],
      ["", "", "", ""],
    ]);

    expect(result.headerRowIndex).toBe(0);
    expect(result.missingRequiredFields).toEqual([]);
    expect(result.unmappedHeaders).toEqual([]);
    expect(result.unparsed).toEqual([]);
    expect(result.candidates).toEqual([
      {
        name: "林舟",
        university: "北京大学",
        city: "北京市",
        sourceLine: 2,
        rawLine: "林舟\t北京大学\t北京市\t中国去向",
      },
      {
        name: "周晴",
        university: "哈佛大学",
        city: "美国·波士顿",
        locationScope: "international",
        sourceLine: 3,
        rawLine: "周晴\t哈佛大学\t美国·波士顿\t海外去向",
      },
    ]);
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

  it("drops every candidate and explains the gap when a required column is missing", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取学校", "备注"],
      ["苏禾", "浙江大学", "保研"],
      ["林舟", "北京大学", ""],
      ["", "", ""],
    ]);

    expect(result.missingRequiredFields).toEqual(["city"]);
    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "苏禾\t浙江大学\t保研", reason: "表头缺少必填列:城市" },
      { sourceLine: 3, rawLine: "林舟\t北京大学", reason: "表头缺少必填列:城市" },
    ]);
  });

  it("keeps extra columns unmapped without shifting mapped values", () => {
    const result = parseExcelWorkbookRows([
      ["班级", "学生姓名", "录取学校", "城市", "去向类型", "备注"],
      ["三班", "苏禾", "浙江大学", "杭州市", "", ""],
      ["", "林舟", "北京大学", "北京市", "", "待确认"],
    ]);

    expect(result.unmappedHeaders).toEqual(["班级", "备注"]);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市", sourceLine: 2 }),
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", sourceLine: 3 }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reports rows with blank required cells as unparsed with 1-based row numbers", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市", "去向类型"],
      ["苏禾", "浙江大学", "杭州市", ""],
      ["林舟", "", "北京市", ""],
      ["", "复旦大学", "", "海外去向"],
      ["", "", "", ""],
    ]);

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", sourceLine: 2 }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "林舟\t北京市", reason: "缺少必填字段:录取院校" },
      { sourceLine: 4, rawLine: "复旦大学\t海外去向", reason: "缺少必填字段:学生姓名、城市" },
    ]);
  });

  it("treats 海外去向 in the destination column as an international scope", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市", "去向类型"],
      ["周晴", "哈佛大学", "美国·波士顿", "海外去向"],
      ["苏禾", "浙江大学", "杭州市", "中国去向"],
      ["顾言", "帝国理工学院", "伦敦", "Overseas"],
    ]);

    expect(result.candidates.map((candidate) => candidate.locationScope)).toEqual([
      "international",
      undefined,
      "international",
    ]);
  });

  it("keeps blank middle cells as column slots on the headerless fallback path", () => {
    const result = parseExcelWorkbookRows([
      ["张三", "", "北京市", "海外"],
      ["周晴", "哈佛大学", "美国·波士顿", "海外"],
    ]);

    expect(result.headerRowIndex).toBeUndefined();
    expect(result.candidates).toEqual([{
      name: "周晴",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      sourceLine: 2,
      rawLine: "周晴\t哈佛大学\t美国·波士顿\t海外",
    }]);
    expect(result.unparsed).toEqual([
      {
        sourceLine: 1,
        rawLine: "张三\t\t北京市\t海外",
        reason: "无法识别学生名称、录取院校和城市",
      },
    ]);
  });

  it("builds a canonical import template with a separate guide sheet", () => {
    const template = createImportTemplateSheets();

    expect(template.data[0]).toEqual(["学生姓名", "录取院校", "城市", "去向类型", "省份"]);
    expect(template.data[1]).toEqual(["", "", "", "", ""]);
    expect(template.guide).toEqual(expect.arrayContaining([
      ["字段", "必填", "示例"],
      ["学生姓名", "是", "林舟"],
      ["去向类型", "否", "中国去向 / 海外去向"],
      ["省份", "否", "浙江省"],
    ]));
  });

  it("explains in the guide that 省份 is optional and overrides city inference", () => {
    const note = createImportTemplateSheets().guide.find((row) => row[0] === "省份说明")?.[2] ?? "";

    expect(note).toContain("选填");
    expect(note).toContain("覆盖");
    expect(note).toContain("留空");
  });

  it("keeps 省份 as the fifth template column so the legacy four columns stay in place", () => {
    const [header] = createImportTemplateSheets().data;

    expect(header?.slice(0, 4)).toEqual(["学生姓名", "录取院校", "城市", "去向类型"]);
    expect(header?.[4]).toBe("省份");
  });

  it("reads an explicit province column without treating it as a required field", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市", "去向类型", "省份"],
      ["苏禾", "浙江大学", "杭州市", "中国去向", "浙江省"],
      ["林舟", "北京大学", "北京市", "中国去向", ""],
    ]);

    expect(result.missingRequiredFields).toEqual([]);
    expect(result.unparsed).toEqual([]);
    expect(result.candidates[0]).toMatchObject({ name: "苏禾", province: "浙江省" });
    expect(result.candidates[1]).not.toHaveProperty("province");
  });

  it("exposes the province column as a mapping row with its source header and samples", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市", "去向类型", "省/直辖市"],
      ["苏禾", "浙江大学", "杭州市", "中国去向", "浙江省"],
      ["顾言", "南京大学", "南京市", "中国去向", "江苏省"],
    ]);

    expect(result.columnMappings.at(-1)).toEqual({
      field: "province",
      sourceHeader: "省/直辖市",
      columnIndex: 4,
      samples: ["浙江省", "江苏省"],
    });
    expect(result.unmappedHeaders).toEqual([]);
  });

  it("maps province aliases anywhere in the header without reporting them as unused", () => {
    const result = parseExcelWorkbookRows([
      ["所在省份", "学生姓名", "录取学校", "所在城市", "备注"],
      ["江苏省", "顾言", "南京大学", "南京市", "保研"],
    ]);

    expect(result.candidates[0]).toMatchObject({ city: "南京市", province: "江苏省" });
    expect(result.unmappedHeaders).toEqual(["备注"]);
    // 省份要出现在识别面板的列映射里,而且排在核心列之后。
    expect(result.columnMappings.map((mapping) => mapping.field)).toEqual(["name", "university", "city", "province"]);
  });

  it("ignores a fifth column on the headerless fallback path instead of reading it as province", () => {
    const result = parseExcelWorkbookRows([
      ["周晴", "哈佛大学", "美国·波士顿", "海外去向", "马萨诸塞州"],
    ]);

    expect(result.headerRowIndex).toBeUndefined();
    expect(result.candidates).toEqual([{
      name: "周晴",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      sourceLine: 1,
      rawLine: "周晴\t哈佛大学\t美国·波士顿\t海外去向\t马萨诸塞州",
    }]);
  });
});
