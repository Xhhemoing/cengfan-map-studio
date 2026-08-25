import { describe, expect, it } from "vitest";
import {
  createImportTemplateSheets,
  parseExcelWorkbook,
  parseExcelWorkbookRows,
} from "./binary-import";

describe("workbook sheet selection", () => {
  it("picks the roster sheet hiding behind a decorative cover sheet", () => {
    const result = parseExcelWorkbook([
      { name: "封面", rows: [["2026 届毕业生去向"], ["制表：教务处"], ["打印日期 2026-06-01"]] },
      {
        name: "名单",
        rows: [
          ["学生姓名", "录取院校", "城市"],
          ["林舟", "北京大学", "北京市"],
          ["苏禾", "浙江大学", "杭州市"],
        ],
      },
    ]);

    expect(result?.sheetName).toBe("名单");
    expect(result?.skippedSheetNames).toEqual(["封面"]);
    expect(result?.candidates).toHaveLength(2);
  });

  it("prefers the sheet with the most candidates when header quality ties", () => {
    const result = parseExcelWorkbook([
      { name: "小表", rows: [["学生姓名", "录取院校", "城市"], ["林舟", "北京大学", "北京市"]] },
      {
        name: "大表",
        rows: [
          ["学生姓名", "录取院校", "城市"],
          ["苏禾", "浙江大学", "杭州市"],
          ["陈宁", "清华大学", "北京市"],
        ],
      },
    ]);

    expect(result?.sheetName).toBe("大表");
    expect(result?.skippedSheetNames).toEqual(["小表"]);
  });

  it("ranks a sheet whose header misses required columns below a header-less fallback", () => {
    const result = parseExcelWorkbook([
      { name: "缺列表", rows: [["学生姓名", "录取院校", "备注"], ["林舟", "北京大学", "已确认"]] },
      { name: "裸数据", rows: [["苏禾", "浙江大学", "杭州市"]] },
    ]);

    expect(result?.sheetName).toBe("裸数据");
    expect(result?.candidates).toHaveLength(1);
  });

  it("keeps a single-sheet workbook identical to parsing its rows directly", () => {
    const rows = [
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
      ["缺城市", "武汉大学", ""],
    ];

    const workbook = parseExcelWorkbook([{ name: "学生数据", rows }]);

    expect(workbook).toMatchObject({ ...parseExcelWorkbookRows(rows), sheetName: "学生数据", skippedSheetNames: [] });
  });

  it("does not let the template guide sheet win over the data sheet", () => {
    const template = createImportTemplateSheets();

    const result = parseExcelWorkbook([
      { name: "填写说明", rows: template.guide },
      { name: "学生数据", rows: [...template.data.slice(0, 1), ["林舟", "北京大学", "北京市", ""]] },
    ]);

    expect(result?.sheetName).toBe("学生数据");
  });

  it("returns null for a workbook without sheets", () => {
    expect(parseExcelWorkbook([])).toBeNull();
  });

  it("keeps every sheet name reported when nothing parses", () => {
    const result = parseExcelWorkbook([
      { name: "封面", rows: [["标题"]] },
      { name: "空白", rows: [] },
    ]);

    expect(result?.candidates).toEqual([]);
    expect(result?.skippedSheetNames).toEqual(["空白"]);
  });
});
