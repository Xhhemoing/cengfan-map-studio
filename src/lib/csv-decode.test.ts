import { describe, expect, it } from "vitest";
import { decodeCsvBytes, isCsvFile } from "./csv-decode";

/** 「学生姓名,录取院校,城市\n苏禾,浙江大学,杭州市\n」的 GBK 字节，教务系统导出的典型形态。 */
const GBK_ROSTER = new Uint8Array([
  0xd1, 0xa7, 0xc9, 0xfa, 0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc2, 0xbc, 0xc8, 0xa1, 0xd4, 0xba, 0xd0,
  0xa3, 0x2c, 0xb3, 0xc7, 0xca, 0xd0, 0x0a, 0xcb, 0xd5, 0xba, 0xcc, 0x2c, 0xd5, 0xe3, 0xbd, 0xad,
  0xb4, 0xf3, 0xd1, 0xa7, 0x2c, 0xba, 0xbc, 0xd6, 0xdd, 0xca, 0xd0, 0x0a,
]);

/** GB18030 才有的四字节序列（U+3400 㐀），用来确认兜底解码器不是只认 GBK 双字节。 */
const GB18030_FOUR_BYTE = new Uint8Array([0x81, 0x39, 0xee, 0x39]);

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("decodeCsvBytes", () => {
  it("keeps UTF-8 CSV as-is", () => {
    const result = decodeCsvBytes(utf8("学生姓名,录取院校,城市\n苏禾,浙江大学,杭州市\n"));

    expect(result.encoding).toBe("utf-8");
    expect(result.text).toContain("学生姓名");
    expect(result.text).toContain("苏禾");
  });

  it("drops the UTF-8 BOM Excel writes so the first header stays clean", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("学生姓名,城市\n")]);

    const result = decodeCsvBytes(bytes);

    expect(result.encoding).toBe("utf-8");
    expect(result.text.startsWith("学生姓名")).toBe(true);
  });

  it("falls back to GB18030 when the bytes are not valid UTF-8", () => {
    const result = decodeCsvBytes(GBK_ROSTER);

    expect(result.encoding).toBe("gb18030");
    expect(result.text).toBe("学生姓名,录取院校,城市\n苏禾,浙江大学,杭州市\n");
  });

  it("decodes GB18030 four-byte sequences that GBK does not cover", () => {
    const result = decodeCsvBytes(GB18030_FOUR_BYTE);

    expect(result.encoding).toBe("gb18030");
    expect(result.text).toBe("㐀");
  });

  it("reports UTF-8 for pure ASCII", () => {
    const result = decodeCsvBytes(utf8("name,school,city\nLin,PKU,Beijing\n"));

    expect(result.encoding).toBe("utf-8");
    expect(result.text).toContain("Lin,PKU,Beijing");
  });

  it("accepts an ArrayBuffer view over a larger buffer", () => {
    const padded = new Uint8Array([0x00, ...GBK_ROSTER]);
    const view = new Uint8Array(padded.buffer, 1, GBK_ROSTER.length);

    expect(decodeCsvBytes(view).text).toContain("学生姓名");
  });

  it("returns an empty string for empty input instead of throwing", () => {
    expect(decodeCsvBytes(new ArrayBuffer(0))).toEqual({ text: "", encoding: "utf-8" });
  });
});

describe("isCsvFile", () => {
  it("matches the .csv extension regardless of case", () => {
    expect(isCsvFile({ name: "名单.csv" })).toBe(true);
    expect(isCsvFile({ name: "名单.CSV" })).toBe(true);
  });

  it("matches the CSV mime type when the name has no extension", () => {
    expect(isCsvFile({ name: "名单", type: "text/csv" })).toBe(true);
  });

  it("leaves binary workbooks to the xlsx reader", () => {
    expect(isCsvFile({ name: "名单.xlsx", type: "application/vnd.ms-excel" })).toBe(false);
    expect(isCsvFile({ name: "名单.xls" })).toBe(false);
    expect(isCsvFile(null)).toBe(false);
  });
});
