import { describe, expect, it } from "vitest";
import { parseDelimitedTable, parseStudentText } from "./import-data";
import { parseExcelWorkbookRows, parseOcrLikeText } from "./binary-import";

const incompleteRows = [
  ["", "北京大学", "北京市", "海外"],
  ["测试同学", "", "北京市", "海外"],
  ["测试同学", "北京大学", "", "海外"],
];

describe("import source fidelity", () => {
  for (const delimiter of ["\t", ",", "，", ";"]) {
    it.each(incompleteRows)(`rejects incomplete columns separated by ${JSON.stringify(delimiter)}: %j`, (...cells) => {
      const text = cells.join(delimiter);
      const parsed = parseStudentText(text);
      expect(parsed.candidates).toEqual([]);
      expect(parsed.unparsed).toEqual([
        expect.objectContaining({ sourceLine: 1, reason: expect.any(String) }),
      ]);
      expect(parseDelimitedTable(text)).toEqual([]);
    });
  }

  it.each(incompleteRows)("rejects missing columns in headerless workbooks: %j", (...cells) => {
    const result = parseExcelWorkbookRows([[], cells]);
    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toEqual([
      expect.objectContaining({ sourceLine: 2, reason: expect.any(String) }),
    ]);
  });

  it("preserves physical line numbers while skipping empty rows and a leading header", () => {
    const text = "\uFEFF\n姓名\t院校\t城市\n\n测试同学\t北京大学\t北京市\n\n错误行";
    const result = parseStudentText(text);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "测试同学", sourceLine: 4 }),
    ]);
    expect(result.unparsed).toEqual([
      expect.objectContaining({ rawLine: "错误行", sourceLine: 6 }),
    ]);
    expect(parseDelimitedTable(text)).toEqual([
      expect.objectContaining({ name: "测试同学", sourceLine: 4 }),
    ]);
  });

  it("accepts padded cells and a blank optional type without shifting columns", () => {
    expect(parseStudentText(" 测试同学 \t 北京大学 \t 北京市 \t")).toMatchObject({
      candidates: [{ name: "测试同学", university: "北京大学", city: "北京市" }],
      unparsed: [],
    });
  });

  it.each(["海外", "海外去向", "international", " INTERNATIONAL ", "overseas"])(
    "uses the same international classification for text and workbook: %s",
    (scope) => {
      const text = parseStudentText(`测试同学\t测试院校\tLondon\t${scope}`);
      const workbook = parseExcelWorkbookRows([
        ["学生姓名", "录取院校", "城市", "去向类型"],
        ["测试同学", "测试院校", "London", scope],
      ]);
      expect(text.candidates[0]).toMatchObject({ locationScope: "international", city: "London" });
      expect(workbook.candidates[0]).toMatchObject({ locationScope: "international", city: "London" });
    },
  );

  it("keeps domestic destinations domestic", () => {
    expect(parseStudentText("测试同学\t北京大学\t北京市\t中国去向").candidates[0]?.locationScope).toBeUndefined();
  });

  it("preserves OCR row boundaries and original error line numbers", () => {
    const result = parseOcrLikeText("测试同学  北京大学  北京市\n\n错误行");
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "测试同学", city: "北京市", sourceLine: 1 }),
    ]);
    expect(result.unparsed).toEqual([
      expect.objectContaining({ sourceLine: 3, rawLine: "错误行" }),
    ]);
  });
});
