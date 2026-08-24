import { describe, expect, it } from "vitest";
import {
  detectHeaderColumns,
  looksLikeStudentHeader,
  missingRequiredColumns,
  normalizeHeaderCell,
  parseDelimitedTable,
  parseLocationScopeValue,
  parseStudentText,
  type ImportCandidate,
} from "./import-data";

describe("import data", () => {
  it("parses comma and tab separated student rows", () => {
    const comma = parseDelimitedTable("姓名,院校,城市\n林舟,北京大学,北京\n苏禾,浙江大学,杭州");
    const tab = parseDelimitedTable("姓名\t院校\t城市\n顾言\t复旦大学\t上海");

    expect(comma).toEqual([
      {
        name: "林舟",
        university: "北京大学",
        city: "北京",
        sourceLine: 2,
        rawLine: "林舟,北京大学,北京",
      },
      {
        name: "苏禾",
        university: "浙江大学",
        city: "杭州",
        sourceLine: 3,
        rawLine: "苏禾,浙江大学,杭州",
      },
    ] satisfies ImportCandidate[]);

    expect(tab[0]).toMatchObject({
      name: "顾言",
      university: "复旦大学",
      city: "上海",
      sourceLine: 2,
    });
  });

  it("parses free-form Chinese lines into three-field candidates", () => {
    const result = parseStudentText([
      "1. 林舟 北京大学 北京",
      "苏禾，浙江大学，杭州",
      "顾言-复旦大学-上海市",
      "无效行",
    ].join("\n"));

    expect(result.candidates).toEqual([
      {
        name: "林舟",
        university: "北京大学",
        city: "北京",
        sourceLine: 1,
        rawLine: "1. 林舟 北京大学 北京",
      },
      {
        name: "苏禾",
        university: "浙江大学",
        city: "杭州",
        sourceLine: 2,
        rawLine: "苏禾，浙江大学，杭州",
      },
      {
        name: "顾言",
        university: "复旦大学",
        city: "上海市",
        sourceLine: 3,
        rawLine: "顾言-复旦大学-上海市",
      },
    ]);
    expect(result.unparsed).toEqual([
      {
        sourceLine: 4,
        rawLine: "无效行",
        reason: "无法识别学生名称、录取院校和城市",
      },
    ]);
  });

  it("keeps original line text for every candidate", () => {
    const result = parseStudentText("陈宁 清华大学 北京");
    expect(result.candidates[0]?.rawLine).toBe("陈宁 清华大学 北京");
  });

  it("recognizes labeled natural-language records without requiring a delimiter", () => {
    const result = parseStudentText("姓名：林舟，就读院校：北京大学，城市：北京");

    expect(result.candidates).toEqual([
      {
        name: "林舟",
        university: "北京大学",
        city: "北京",
        sourceLine: 1,
        rawLine: "姓名：林舟，就读院校：北京大学，城市：北京",
      },
    ]);
  });

  it("preserves an explicit international destination scope in the fourth column", () => {
    const result = parseStudentText("姓名,院校,城市,去向类型\n周晴,哈佛大学,美国·波士顿,海外");

    expect(result.candidates).toEqual([{
      name: "周晴",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      sourceLine: 2,
      rawLine: "周晴,哈佛大学,美国·波士顿,海外",
    }]);
  });
});

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

  it("treats only explicit overseas markers as an international destination", () => {
    expect(parseLocationScopeValue("海外")).toBe("international");
    expect(parseLocationScopeValue(" Overseas ")).toBe("international");
    expect(parseLocationScopeValue("出国留学")).toBe("international");
    expect(parseLocationScopeValue("中国去向")).toBeUndefined();
    expect(parseLocationScopeValue("")).toBeUndefined();
    expect(parseLocationScopeValue(undefined)).toBeUndefined();
  });
});

describe("import data robustness", () => {
  it("reads a reordered aliased header instead of relying on column position", () => {
    const result = parseStudentText([
      "城市,名字,学校,省",
      "杭州,苏禾,浙江大学,浙江省",
    ].join("\n"));

    expect(result.candidates).toEqual([{
      name: "苏禾",
      university: "浙江大学",
      city: "杭州",
      province: "浙江省",
      sourceLine: 2,
      rawLine: "杭州,苏禾,浙江大学,浙江省",
    }]);
    expect(result.unparsed).toEqual([]);
  });

  it("strips a BOM from a CSV export so the first header still matches", () => {
    const result = parseStudentText("\uFEFF姓名,院校,城市\n林舟,北京大学,北京");

    expect(result.candidates).toEqual([expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京" })]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps column alignment when an optional cell is empty", () => {
    const result = parseStudentText([
      "姓名,院校,城市,省份,去向类型",
      "林舟,北京大学,北京,,",
      "周晴,哈佛大学,美国·波士顿,,海外",
    ].join("\n"));

    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "林舟", city: "北京" }));
    expect(result.candidates[0]).not.toHaveProperty("province");
    expect(result.candidates[0]).not.toHaveProperty("locationScope");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
  });

  it("drops a province column for overseas rows because they have no Chinese province", () => {
    const result = parseStudentText([
      "姓名,院校,城市,省份,去向类型",
      "周晴,哈佛大学,美国·波士顿,马萨诸塞州,海外",
    ].join("\n"));

    expect(result.candidates[0]).toEqual(expect.objectContaining({ locationScope: "international" }));
    expect(result.candidates[0]).not.toHaveProperty("province");
  });

  it("reports a row missing a required cell instead of importing a partial record", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      "林舟,北京大学,北京",
      "只有姓名,,",
    ].join("\n"));

    expect(result.candidates).toHaveLength(1);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "只有姓名,,", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("ignores rows whose cells are only whitespace", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      "   ,北京大学,北京",
    ].join("\n"));

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toHaveLength(1);
  });

  it("still parses a header-less paste positionally", () => {
    expect(parseDelimitedTable("林舟,北京大学,北京")).toEqual([
      { name: "林舟", university: "北京大学", city: "北京", sourceLine: 1, rawLine: "林舟,北京大学,北京" },
    ]);
  });

  it("reads a labeled record with an explicit province and overseas marker", () => {
    const china = parseStudentText("姓名：苏禾，学校：浙江大学，城市：杭州，省份：浙江省");
    expect(china.candidates[0]).toEqual(expect.objectContaining({ province: "浙江省" }));

    const overseas = parseStudentText("姓名：周晴，学校：哈佛大学，城市：波士顿，去向类型：海外");
    expect(overseas.candidates[0]).toEqual(expect.objectContaining({ locationScope: "international" }));
    expect(overseas.candidates[0]).not.toHaveProperty("province");
  });

  it("returns nothing for blank input without inventing candidates", () => {
    expect(parseStudentText("")).toEqual({ candidates: [], unparsed: [] });
    expect(parseStudentText("\uFEFF\n   \n")).toEqual({ candidates: [], unparsed: [] });
  });
});
