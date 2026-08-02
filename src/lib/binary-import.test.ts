import { describe, expect, it } from "vitest";
import { parseExcelArrayBuffer, parseExcelWorkbookRows, parseOcrLikeText } from "./binary-import";

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
});
