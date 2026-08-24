import { describe, expect, it } from "vitest";
import {
  detectHeaderColumns,
  looksLikeStudentHeader,
  missingRequiredColumns,
  normalizeHeaderCell,
  parseStudentText,
} from "./import-data";

/**
 * Header engine of every roster source: cell normalization, the alias table and
 * the header → student column mapping. `import-data.test.ts` covers what the
 * text parser does with the mapping once it exists.
 */
describe("student header aliases", () => {
  it("normalizes casing, spacing, brackets, BOM and 必填 markers", () => {
    expect(normalizeHeaderCell("\uFEFF 学生 姓名 ")).toBe("学生姓名");
    expect(normalizeHeaderCell("Student Name")).toBe("studentname");
    expect(normalizeHeaderCell("城市（必填）")).toBe("城市");
    expect(normalizeHeaderCell("姓名*")).toBe("姓名");
  });

  it("maps the documented alias families to their student column", () => {
    expect(detectHeaderColumns(["名字", "去向", "省", "市"])).toEqual({
      name: 0,
      university: 1,
      province: 2,
      city: 3,
    });
    expect(detectHeaderColumns(["name", "school", "city"])).toEqual({
      name: 0,
      university: 1,
      city: 2,
    });
    expect(detectHeaderColumns(["姓名", "学校", "城市", "省份", "去向类型"])).toEqual({
      name: 0,
      university: 1,
      city: 2,
      province: 3,
      locationScope: 4,
    });
  });

  it("never lets two fields claim the same source column", () => {
    // "学校" and "去向" are both university aliases: the first one wins and the
    // other stays unmapped instead of being read twice.
    const indexes = detectHeaderColumns(["姓名", "学校", "去向", "城市"]);

    expect(indexes).toEqual({ name: 0, university: 1, city: 3 });
    expect(missingRequiredColumns(indexes)).toEqual([]);
  });

  it("reports which required columns a header is missing", () => {
    expect(missingRequiredColumns(detectHeaderColumns(["姓名", "备注"]))).toEqual(["university", "city"]);
    expect(looksLikeStudentHeader(["姓名", "备注"])).toBe(false);
    expect(looksLikeStudentHeader(["姓名", "学校"])).toBe(true);
    expect(looksLikeStudentHeader(["林舟", "北京大学", "北京"])).toBe(false);
  });
});

describe("import header aliases and fuzzy matching", () => {
  it("maps the 录取学校 / 高校 / 学院 destination wordings", () => {
    expect(detectHeaderColumns(["姓名", "录取学校", "城市"]).university).toBe(1);
    expect(detectHeaderColumns(["姓名", "高校", "城市"]).university).toBe(1);
    expect(detectHeaderColumns(["姓名", "学院", "城市"]).university).toBe(1);
  });

  it("accepts 生源地 as a city column but never over an explicit city column", () => {
    expect(detectHeaderColumns(["姓名", "高校", "生源地"])).toEqual({ name: 0, university: 1, city: 2 });
    // A sheet carrying both keeps the destination city and leaves 生源地 unused.
    expect(detectHeaderColumns(["姓名", "高校", "生源地", "城市"])).toEqual({ name: 0, university: 1, city: 3 });
  });

  it("maps 所在省 like the other province wordings", () => {
    expect(detectHeaderColumns(["姓名", "院校", "城市", "所在省"])).toEqual({
      name: 0,
      university: 1,
      city: 2,
      province: 3,
    });
  });

  it("reads decorated headers by substring while ignoring non-student columns", () => {
    expect(detectHeaderColumns(["学生学号", "学生姓名（中文）", "录取院校名称", "所在城市/地区", "所在省"])).toEqual({
      name: 1,
      university: 2,
      city: 3,
      province: 4,
    });
  });

  it("prefers the exact header over a decorated one for the same field", () => {
    // "录取院校名称" only matches by substring, so the exact "院校" wins.
    expect(detectHeaderColumns(["姓名", "录取院校名称", "院校", "城市"])).toMatchObject({ university: 2 });
  });

  it("reads slash-separated headers because the slash is dropped like other decoration", () => {
    expect(normalizeHeaderCell("省 / 直辖市")).toBe("省直辖市");
    expect(detectHeaderColumns(["姓名", "院校", "城市", "省/直辖市", "国内/海外"])).toEqual({
      name: 0,
      university: 1,
      city: 2,
      province: 3,
      locationScope: 4,
    });
  });

  it("maps an employer destination without letting 单位 claim a city column", () => {
    expect(detectHeaderColumns(["姓名", "工作单位", "城市"])).toEqual({ name: 0, university: 1, city: 2 });
    expect(detectHeaderColumns(["姓名", "单位", "所在市"])).toEqual({ name: 0, university: 1, city: 2 });
    // 单位 counts as a whole header only: this sheet has a city column, not a 单位 one.
    expect(detectHeaderColumns(["姓名", "录取院校", "单位所在城市"])).toEqual({ name: 0, university: 1, city: 2 });
    expect(detectHeaderColumns(["姓名", "录取院校", "目的地城市"])).toEqual({ name: 0, university: 1, city: 2 });
    // A sheet carrying both keeps the school column and leaves 工作单位 unused.
    expect(detectHeaderColumns(["姓名", "工作单位", "录取院校", "城市"])).toEqual({ name: 0, university: 2, city: 3 });
  });

  it("recognizes the overseas-or-not wordings and keeps the province optional there", () => {
    expect(detectHeaderColumns(["姓名", "院校", "城市", "是否出国"]).locationScope).toBe(3);
    expect(detectHeaderColumns(["姓名", "院校", "城市", "境内境外"]).locationScope).toBe(3);

    const result = parseStudentText([
      "姓名,院校,城市,省份,是否出国",
      "周晴,哈佛大学,波士顿,马萨诸塞州,出国",
      "苏禾,浙江大学,杭州市,浙江省,境内",
    ].join("\n"));

    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
    expect(result.candidates[0]).not.toHaveProperty("province");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "苏禾", province: "浙江省" }));
    expect(result.candidates[1]).not.toHaveProperty("locationScope");
  });

  it("never reads a data row as a header just because its values contain alias words", () => {
    expect(looksLikeStudentHeader(["姓名：林舟", "就读院校：北京大学", "城市：北京"])).toBe(false);
    expect(looksLikeStudentHeader(["林舟", "北京大学", "北京市"])).toBe(false);
    // 同学 and 大学 are aliases, yet this line is a student, not a header.
    expect(looksLikeStudentHeader(["新同学", "北京大学", "北京"])).toBe(false);
    expect(parseStudentText("新同学 北京大学 北京").candidates).toEqual([
      expect.objectContaining({ name: "新同学", university: "北京大学", city: "北京" }),
    ]);
  });
});

describe("wide and repetitive headers", () => {
  it("gives a repeated header name to the first column that claims it", () => {
    expect(detectHeaderColumns(["姓名", "姓名", "院校", "城市"])).toEqual({ name: 0, university: 2, city: 3 });

    const result = parseStudentText([
      "姓名,姓名,院校,城市",
      "林舟,曾用名,北京大学,北京市",
    ].join("\n"));

    expect(result.candidates).toEqual([expect.objectContaining({ name: "林舟", city: "北京市" })]);
  });

  it("keeps a duplicated header on its first column and leaves the copy unused", () => {
    // Merging two exports duplicates whole columns; the first claim wins so the
    // mapping never depends on which copy the sheet happens to list last.
    expect(detectHeaderColumns(["姓名", "院校", "城市", "姓名", "城市"])).toEqual({
      name: 0,
      university: 1,
      city: 2,
    });

    const result = parseStudentText([
      "姓名,院校,城市,姓名,城市",
      "林舟,北京大学,北京市,曾用名,旧城市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("skips a header row that a stacked export repeats inside the data", () => {
    const result = parseStudentText([
      "学生姓名,录取院校,城市",
      "林舟,北京大学,北京市",
      "学生姓名,录取院校,城市",
      "苏禾,浙江大学,杭州市",
      // A differently worded repeat still maps to the same three columns.
      "姓名,院校,城市",
      "顾言,复旦大学,上海市",
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["林舟", "苏禾", "顾言"]);
    // The repeats are headers, not data, so they are not reported as losses.
    expect(result.unparsed).toEqual([]);
  });

  it("names a totals row instead of importing 合计 as a student", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      "林舟,北京大学,北京市",
      "合计,2 所院校,2 个城市",
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["林舟"]);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "合计,2 所院校,2 个城市", reason: "汇总行" },
    ]);
  });

  it("finds a header below a title line and reports the skipped preamble", () => {
    const result = parseStudentText([
      "2026 届毕业去向统计",
      "更新时间,2026-06-30",
      "姓名,录取院校,城市",
      "苏禾,浙江大学,杭州市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市", sourceLine: 4 }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 1, rawLine: "2026 届毕业去向统计", reason: "表头之前的内容" },
      { sourceLine: 2, rawLine: "更新时间,2026-06-30", reason: "表头之前的内容" },
    ]);
  });

  it("never promotes a data line to a header just because it fills three columns", () => {
    // 林舟's row maps nothing exactly, so the paste stays positional instead of
    // losing its first record to a made-up header.
    const result = parseStudentText([
      "毕业名单",
      "林舟,北京大学,北京市",
      "苏禾,浙江大学,杭州市",
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["林舟", "苏禾"]);
  });

  it("maps a very wide sheet by header instead of by position", () => {
    const headers = Array.from({ length: 200 }, (_, index) => `扩展字段${index + 1}`);
    headers[3] = "学生姓名";
    headers[97] = "录取院校";
    headers[150] = "所在城市";
    headers[151] = "省份";

    expect(detectHeaderColumns(headers)).toEqual({ name: 3, university: 97, city: 150, province: 151 });

    const row = headers.map(() => "");
    row[3] = "苏禾";
    row[97] = "浙江大学";
    row[150] = "杭州市";
    row[151] = "浙江省";
    expect(parseStudentText([headers.join("\t"), row.join("\t")].join("\n")).candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市", province: "浙江省" }),
    ]);
  });
});
