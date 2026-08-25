import { describe, expect, it } from "vitest";
import { parseExcelWorkbookRows } from "./binary-import";

describe("workbook row fidelity", () => {
  it("reports every partially filled row as unparsed with its sheet line and reason", () => {
    const rows = [
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
      ["苏禾", "浙江大学", "杭州市"],
      ["陈宁", "清华大学", "北京市"],
      ["周晴", "复旦大学", "上海市"],
      ["何越", "南京大学", "南京市"],
      ["缺城市", "武汉大学", ""],
      ["", "四川大学", "成都市"],
      ["缺院校", "", "广州市"],
    ];

    const result = parseExcelWorkbookRows(rows);

    expect(result.candidates).toHaveLength(5);
    expect(result.unparsed).toEqual([
      { sourceLine: 7, rawLine: "缺城市\t武汉大学", reason: "缺少必填字段：城市" },
      { sourceLine: 8, rawLine: "四川大学\t成都市", reason: "缺少必填字段：学生姓名" },
      { sourceLine: 9, rawLine: "缺院校\t广州市", reason: "缺少必填字段：录取院校" },
    ]);
    expect(result.candidates.length + result.unparsed.length).toBe(rows.length - 1);
  });

  it("keeps blank spacer rows out of the unparsed report", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
      ["", "", ""],
      ["   ", "", ""],
      ["苏禾", "浙江大学", "杭州市"],
    ]);

    expect(result.candidates).toHaveLength(2);
    expect(result.unparsed).toEqual([]);
  });

  it("reports the whole sheet as unparsed when the header misses a required column", () => {
    const result = parseExcelWorkbookRows([
      ["学生姓名", "录取院校", "备注"],
      ["林舟", "北京大学", "已确认"],
      ["苏禾", "浙江大学", ""],
    ]);

    // 按列位硬读会把「已确认」当成城市，宁可整表报未识别，也不造假数据。
    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟\t北京大学\t已确认", reason: "表头缺少必填列：城市" },
      { sourceLine: 3, rawLine: "苏禾\t浙江大学", reason: "表头缺少必填列：城市" },
    ]);
  });

  it("returns nothing for an empty sheet and for a header-only sheet", () => {
    expect(parseExcelWorkbookRows([])).toMatchObject({ candidates: [], unparsed: [] });
    expect(parseExcelWorkbookRows([["学生姓名", "录取院校", "城市"]])).toMatchObject({
      candidates: [],
      unparsed: [],
      headerRowIndex: 0,
    });
  });

  it("still recognizes a header sitting on the eighth non-empty row", () => {
    const result = parseExcelWorkbookRows([
      ["2026 届毕业生去向统计"],
      ["制表单位", "教务处"],
      ["制表日期", "2026-06-01"],
      ["联系人", "王老师"],
      ["联系电话", "010-00000000"],
      ["版本", "v3"],
      ["备注", "内部使用"],
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
    ]);

    expect(result.headerRowIndex).toBe(7);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", sourceLine: 9 }),
    ]);
  });

  it("reports a header pushed past the scan window instead of importing it as a student", () => {
    const result = parseExcelWorkbookRows([
      ["2026 届毕业生去向统计"],
      ["制表单位", "教务处"],
      ["制表日期", "2026-06-01"],
      ["联系人", "王老师"],
      ["联系电话", "010-00000000"],
      ["版本", "v3"],
      ["备注", "内部使用"],
      ["说明", "以下为正式名单"],
      ["学生姓名", "录取院校", "城市"],
      ["林舟", "北京大学", "北京市"],
    ]);

    expect(result.headerRowIndex).toBeUndefined();
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", sourceLine: 10 }),
    ]);
    expect(result.unparsed).toContainEqual(
      expect.objectContaining({ sourceLine: 9, reason: expect.stringContaining("疑似表头行") }),
    );
    expect(result.candidates.map((candidate) => candidate.name)).not.toContain("学生姓名");
  });

  it("maps unparsed lines back to sheet rows when no header is recognized", () => {
    const result = parseExcelWorkbookRows([
      ["2026 届毕业生去向"],
      ["林舟", "北京大学", "北京市"],
      ["只有一列"],
    ]);

    expect(result.candidates).toEqual([expect.objectContaining({ name: "林舟", sourceLine: 2 })]);
    expect(result.unparsed.map((line) => line.sourceLine)).toEqual([1, 3]);
  });

  it("uses the first of duplicate header columns and lists the rest as unused", () => {
    const result = parseExcelWorkbookRows([
      ["姓名", "姓名", "录取院校", "城市"],
      ["林舟", "别名", "北京大学", "北京市"],
    ]);

    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "name", columnIndex: 0 }),
    ]));
    expect(result.unmappedHeaders).toEqual(["姓名"]);
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
  });

  it("stringifies numeric and formula-evaluated cells", () => {
    const rows = [
      ["学生姓名", "录取院校", "城市", "去向类型"],
      ["林舟", "北京大学", 100010, "中国去向"],
      [2026, "浙江大学", "杭州市", "海外"],
      ["空值", "南京大学", null, ""],
    ] as unknown as string[][];

    const result = parseExcelWorkbookRows(rows);

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", city: "100010" }),
      expect.objectContaining({ name: "2026", city: "杭州市", locationScope: "international" }),
    ]);
    expect(result.unparsed).toEqual([
      expect.objectContaining({ sourceLine: 4, reason: "缺少必填字段：城市" }),
    ]);
  });

  it("parses a 10k-row sheet within a bounded, near-linear cell budget", () => {
    const rowCount = 10_000;
    const columnCount = 4;
    let cellReads = 0;
    const rows: string[][] = [
      ["学生姓名", "录取院校", "城市", "去向类型"],
      ...Array.from({ length: rowCount }, (_, index) => {
        const cells = [`学生${index}`, "浙江大学", index % 500 === 0 ? "" : "杭州市", ""];
        return new Proxy(cells, {
          get(target, property, receiver) {
            if (typeof property === "string" && /^\d+$/.test(property)) cellReads += 1;
            return Reflect.get(target, property, receiver) as unknown;
          },
        });
      }),
    ];

    const startedAt = performance.now();
    const result = parseExcelWorkbookRows(rows);
    const elapsed = performance.now() - startedAt;

    expect(result.candidates).toHaveLength(rowCount - 20);
    expect(result.unparsed).toHaveLength(20);
    // 每个单元格读一遍是一趟扫描；给两趟的余量，四次全表取样或任何 O(n²) 都会撑爆。
    expect(cellReads).toBeLessThanOrEqual(rowCount * columnCount * 2);
    expect(elapsed).toBeLessThan(2000);
  });
});
