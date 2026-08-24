import { describe, expect, it } from "vitest";
import {
  isBlankImportCell,
  parseDelimitedTable,
  parseLocationScopeValue,
  parseStudentText,
  splitDelimitedLine,
  trimImportCell,
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

describe("destination scope values", () => {
  it("treats only explicit overseas markers as an international destination", () => {
    expect(parseLocationScopeValue("海外")).toBe("international");
    expect(parseLocationScopeValue(" Overseas ")).toBe("international");
    expect(parseLocationScopeValue("出国留学")).toBe("international");
    expect(parseLocationScopeValue("中国去向")).toBeUndefined();
    expect(parseLocationScopeValue("")).toBeUndefined();
    expect(parseLocationScopeValue(undefined)).toBeUndefined();
  });

  it("reads a negative answer to 是否出国 as a China destination", () => {
    // The negative answers spell the marker out in full; reading them as a
    // match moves a student who never left the country off the province map.
    expect(parseLocationScopeValue("未出国")).toBeUndefined();
    expect(parseLocationScopeValue("未出国留学")).toBeUndefined();
    expect(parseLocationScopeValue("不出国")).toBeUndefined();
    expect(parseLocationScopeValue("国内（非海外）")).toBeUndefined();
    expect(parseLocationScopeValue("not abroad")).toBeUndefined();
    // Only an adjacent negation counts, so a qualifier keeps the row overseas.
    expect(parseLocationScopeValue("非全日制海外硕士")).toBe("international");
    expect(parseLocationScopeValue("已出国")).toBe("international");
  });

  it("keeps a whole roster of 是否出国 answers on the right side of the map", () => {
    const result = parseStudentText([
      "姓名,院校,城市,是否出国",
      "苏禾,浙江大学,杭州市,未出国",
      "周晴,哈佛大学,波士顿,已出国",
    ].join("\n"));

    expect(result.candidates[0]).not.toHaveProperty("locationScope");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ locationScope: "international" }));
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
      { sourceLine: 3, rawLine: "只有姓名,,", reason: "缺少院校、城市" },
    ]);
  });

  it("never re-reads an incomplete mapped row by position", () => {
    // Positional reading shifts every value one column left, which imported the
    // student number as the name and the university as the city — with no
    // warning at all, because the invented record looked complete.
    const result = parseStudentText([
      "学号,姓名,院校,城市",
      "20260001,林舟,北京大学,北京市",
      "20260002,苏禾,浙江大学,",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "20260002,苏禾,浙江大学,", reason: "缺少城市" },
    ]);
  });

  it("still reads a labeled line that the header mapping cannot place", () => {
    // The row follows neither the header's delimiter nor its columns, so the
    // self-describing labels are the only honest reading of it.
    const result = parseStudentText([
      "姓名,院校,城市",
      "林舟,北京大学,北京市",
      "姓名：苏禾，学校：浙江大学，城市：杭州市",
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["林舟", "苏禾"]);
    expect(result.unparsed).toEqual([]);
  });

  it("ignores rows whose cells are only whitespace", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      "   ,北京大学,北京",
    ].join("\n"));

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toHaveLength(1);
  });

  it("keeps an empty leading column of a tab-separated row aligned", () => {
    // Dropping the leading tab would shift every cell left by one, which reads
    // the university as the student's name instead of failing loudly.
    const result = parseStudentText([
      "学号\t姓名\t院校\t城市\t省份",
      "\t林舟\t北京大学\t北京市\t北京市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", province: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
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

describe("quoted csv rows", () => {
  it("keeps a delimiter that sits inside a quoted cell", () => {
    expect(splitDelimitedLine('"李,四",北京大学,北京市', ",")).toEqual(["李,四", "北京大学", "北京市"]);
    expect(splitDelimitedLine('林舟,"北京大学, 深圳研究生院",深圳市', ",")).toEqual(["林舟", "北京大学, 深圳研究生院", "深圳市"]);
    expect(splitDelimitedLine('张 "大" 三,北京大学', ",")).toEqual(['张 "大" 三', "北京大学"]);
  });

  it("unescapes a doubled quote inside a quoted cell", () => {
    expect(splitDelimitedLine('"张""大""三",北京大学', ",")).toEqual(['张"大"三', "北京大学"]);
  });

  it("imports a quoted roster whose names contain commas", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      '"李,四",北京大学,北京市',
      '"周, 晴",哈佛大学,美国·波士顿,海外',
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["李,四", "周, 晴"]);
    expect(result.unparsed).toEqual([]);
  });

  it("rejoins a quoted cell that a CSV export broke across two lines", () => {
    // RFC4180 allows the line break, and splitting on it first would import the
    // tail of the record as a student of its own.
    const result = parseStudentText([
      "姓名,院校,城市",
      '"北京大学',
      '（深圳研究生院）",林舟,深圳市',
      "苏禾,浙江大学,杭州市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({
        name: "北京大学 （深圳研究生院）",
        university: "林舟",
        city: "深圳市",
        sourceLine: 2,
      }),
      expect.objectContaining({ name: "苏禾", sourceLine: 4 }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("never lets one unterminated quote swallow the rest of the paste", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      '"林舟,北京大学,北京市',
      "苏禾,浙江大学,杭州市",
      "顾言,复旦大学,上海市",
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["苏禾", "顾言"]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: '"林舟,北京大学,北京市', reason: "缺少院校、城市" },
    ]);
  });
});

describe("reported source lines", () => {
  it("numbers rows by their real line so a blank line never shifts the report", () => {
    // The import panel shows "第 N 行"; N has to point at the line the user sees.
    const result = parseStudentText([
      "姓名,院校,城市",
      "",
      "林舟,北京大学,北京市",
      "",
      "",
      "只有姓名",
      "苏禾,浙江大学,杭州市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", sourceLine: 3 }),
      expect.objectContaining({ name: "苏禾", sourceLine: 7 }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 6, rawLine: "只有姓名", reason: "缺少院校、城市" },
    ]);
  });

  it("keeps the real line numbers of a preamble split by blank lines", () => {
    const result = parseStudentText([
      "2026 届毕业去向统计",
      "",
      "姓名,院校,城市",
      "林舟,北京大学,北京市",
    ].join("\n"));

    expect(result.candidates).toEqual([expect.objectContaining({ name: "林舟", sourceLine: 4 })]);
    expect(result.unparsed).toEqual([
      { sourceLine: 1, rawLine: "2026 届毕业去向统计", reason: "表头之前的内容" },
    ]);
  });
});

describe("blank and incomplete import rows", () => {
  it("treats a zero-width-only name as missing instead of importing it", () => {
    expect(trimImportCell("\u200b \uFEFF")).toBe("");
    expect(isBlankImportCell("\u3000")).toBe(true);

    const result = parseStudentText("姓名,院校,城市\n\u200b,北京大学,北京市");

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toEqual([expect.objectContaining({ reason: "缺少姓名" })]);
  });

  it("names the missing fields of a city-only row instead of dropping it silently", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      ",,杭州市",
    ].join("\n"));

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: ",,杭州市", reason: "缺少姓名、院校" },
    ]);
  });

  it("stays quiet about a separator-only row that carries no data", () => {
    const result = parseStudentText([
      "姓名,院校,城市",
      "林舟,北京大学,北京市",
      ",,",
    ].join("\n"));

    expect(result.candidates).toHaveLength(1);
    expect(result.unparsed).toEqual([]);
  });
});
