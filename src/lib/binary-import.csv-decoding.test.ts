import { describe, expect, it } from "vitest";
import { decodeCsvBytes, isCsvFile, parseExcelWorkbookRows } from "./binary-import";
import { encodeGb18030 } from "./binary-import-test-fixtures";

describe("csv decoding", () => {
  it("detects csv files by extension and mime type only", () => {
    expect(isCsvFile({ name: "roster.CSV" })).toBe(true);
    expect(isCsvFile({ name: "roster.txt", type: "text/csv" })).toBe(true);
    expect(isCsvFile({ name: "roster.xlsx", type: "application/vnd.ms-excel" })).toBe(false);
    expect(isCsvFile(null)).toBe(false);
  });

  it("decodes a GB18030 roster that UTF-8 cannot read", () => {
    const csv = "姓名,院校,城市\n林舟,北京大学,北京市\n苏禾,浙江大学,杭州市\n";
    const bytes = encodeGb18030(csv);

    expect(new TextDecoder("utf-8").decode(bytes)).toContain("\uFFFD");
    const decoded = decodeCsvBytes(bytes);

    expect(decoded.encoding).toBe("gb18030");
    expect(decoded.text).toBe(csv);
  });

  it("parses a GB18030 roster end to end once decoded", () => {
    const bytes = encodeGb18030("姓名,院校,城市\n林舟,北京大学,北京市\n");
    const rows = decodeCsvBytes(bytes).text
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split(","));

    const result = parseExcelWorkbookRows(rows);

    expect(result.headerRowIndex).toBe(0);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
  });

  it("keeps valid UTF-8 untouched and strips the byte order mark", () => {
    const text = "姓名,院校,城市\n林舟,北京大学,北京市\n";
    const utf8 = new TextEncoder().encode(text);
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);

    expect(decodeCsvBytes(utf8)).toEqual({ text, encoding: "utf-8" });
    expect(decodeCsvBytes(withBom)).toEqual({ text, encoding: "utf-8" });
  });

  it("accepts an ArrayBuffer as well as a view", () => {
    const utf8 = new TextEncoder().encode("name,school,city\n");

    expect(decodeCsvBytes(utf8.buffer as ArrayBuffer).text).toBe("name,school,city\n");
  });

  it("keeps a literal replacement character on the UTF-8 path instead of re-reading it as GB18030", () => {
    const text = "姓名,院校,城市\n林\uFFFD舟,北京大学,北京市\n";

    const decoded = decodeCsvBytes(new TextEncoder().encode(text));

    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text).toBe(text);
  });

  it("decodes empty input without guessing an encoding", () => {
    expect(decodeCsvBytes(new Uint8Array())).toEqual({ text: "", encoding: "utf-8" });
  });
});
