import { describe, expect, it } from "vitest";
import {
  createImportTemplateSheets,
  decodeCsvBytes,
  isCsvFile,
  parseExcelArrayBuffer,
  parseExcelWorkbook,
  parseExcelWorkbookRows,
  parseOcrLikeText,
} from "./binary-import";

/**
 * GB18030 双字节编码表：把所有合法双字节对用换行隔开一次性解码，
 * 每个分段长度为 1 才是真正映射到单个字符的字节对（未映射的会解出替换字符加回读的 ASCII 尾字节）。
 */
function buildGb18030Table(): Map<string, [number, number]> {
  const pairs: Array<[number, number]> = [];
  const bytes: number[] = [];
  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) continue;
      pairs.push([lead, trail]);
      bytes.push(lead, trail, 0x0a);
    }
  }
  const segments = new TextDecoder("gb18030").decode(new Uint8Array(bytes)).split("\n");
  const table = new Map<string, [number, number]>();
  segments.forEach((segment, index) => {
    const pair = pairs[index];
    if (!pair || segment.length !== 1 || table.has(segment)) return;
    table.set(segment, pair);
  });
  return table;
}

const gb18030Table = buildGb18030Table();

function encodeGb18030(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const pair = gb18030Table.get(character);
    if (!pair) throw new Error(`GB18030 编码表缺少字符：${character}`);
    bytes.push(pair[0], pair[1]);
  }
  return new Uint8Array(bytes);
}

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
