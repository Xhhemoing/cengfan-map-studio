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
      { name: "林舟", university: "北京大学", city: "北京", sourceLine: 2, rawLine: "林舟,北京大学,北京" },
      { name: "苏禾", university: "浙江大学", city: "杭州", sourceLine: 3, rawLine: "苏禾,浙江大学,杭州" },
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
      "顾言 - 复旦大学 - 上海市",
      "无效行",
    ].join("\n"));

    expect(result.candidates).toEqual([
      { name: "林舟", university: "北京大学", city: "北京", sourceLine: 1, rawLine: "1. 林舟 北京大学 北京" },
      { name: "苏禾", university: "浙江大学", city: "杭州", sourceLine: 2, rawLine: "苏禾，浙江大学，杭州" },
      { name: "顾言", university: "复旦大学", city: "上海市", sourceLine: 3, rawLine: "顾言 - 复旦大学 - 上海市" },
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 4, rawLine: "无效行", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("keeps original line text for every candidate", () => {
    const result = parseStudentText("陈宁 清华大学 北京");
    expect(result.candidates[0]?.rawLine).toBe("陈宁 清华大学 北京");
  });

  it("recognizes labeled natural-language records without requiring a delimiter", () => {
    const rawLine = "姓名：林舟，就读院校：北京大学，城市：北京";
    const result = parseStudentText(rawLine);

    expect(result.candidates).toEqual([
      { name: "林舟", university: "北京大学", city: "北京", sourceLine: 1, rawLine },
    ]);
  });

  it("preserves an explicit international destination scope in the fourth column", () => {
    const result = parseStudentText("姓名,院校,城市,去向类型\n周晴,哈佛大学,美国·波士顿,海外");

    expect(result.candidates).toEqual([{
      name: "周晴", university: "哈佛大学", city: "美国·波士顿", locationScope: "international",
      sourceLine: 2, rawLine: "周晴,哈佛大学,美国·波士顿,海外",
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
    const result = parseStudentText("城市,名字,学校,省\n杭州,苏禾,浙江大学,浙江省");

    expect(result.candidates).toEqual([{
      name: "苏禾", university: "浙江大学", city: "杭州", province: "浙江省",
      sourceLine: 2, rawLine: "杭州,苏禾,浙江大学,浙江省",
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
    const result = parseStudentText("姓名,院校,城市,省份,去向类型\n周晴,哈佛大学,美国·波士顿,马萨诸塞州,海外");

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
    const result = parseStudentText("姓名,院校,城市\n   ,北京大学,北京");

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toHaveLength(1);
  });

  it("keeps an empty leading column of a tab-separated row aligned", () => {
    // Dropping the leading tab would shift every cell left by one, which reads
    // the university as the student's name instead of failing loudly.
    const result = parseStudentText("学号\t姓名\t院校\t城市\t省份\n\t林舟\t北京大学\t北京市\t北京市");

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

describe("fullwidth colon separated rows", () => {
  it("splits a row typed with the fullwidth colon into three fields", () => {
    const rawLine = "林舟：北京大学：北京市";
    const result = parseStudentText(rawLine);

    expect(result.candidates).toEqual([
      { name: "林舟", university: "北京大学", city: "北京市", sourceLine: 1, rawLine },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("still reads a labeled row by its labels instead of splitting on the colon after each one", () => {
    const rawLine = "姓名：林舟，就读院校：北京大学，城市：北京";
    const result = parseStudentText(rawLine);

    expect(result.candidates).toEqual([
      { name: "林舟", university: "北京大学", city: "北京", sourceLine: 1, rawLine },
    ]);
  });

  it("keeps a labeled row and a colon-separated row of the same paste apart", () => {
    const result = parseStudentText([
      "姓名：苏禾，学校：浙江大学，城市：杭州市",
      "林舟：北京大学：北京市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("aligns the 去向类型 column of a colon-separated overseas roster", () => {
    const result = parseStudentText([
      "姓名：院校：城市：去向类型",
      "周晴：哈佛大学：波士顿：海外",
      "苏禾：浙江大学：杭州市：国内",
    ].join("\n"));

    expect(result.candidates[0]).toEqual(expect.objectContaining({
      name: "周晴", university: "哈佛大学", city: "波士顿", locationScope: "international",
    }));
    expect(result.candidates[1]).not.toHaveProperty("locationScope");
    expect(result.unparsed).toEqual([]);
  });

  it("leaves an ASCII colon inside a cell alone", () => {
    // 18:30 and 1:2 are a time and a ratio, not two columns.
    expect(parseDelimitedTable("林舟,北京大学,北京市 09:00")).toEqual([
      expect.objectContaining({ city: "北京市 09:00" }),
    ]);
  });

  it("splits a row typed with the small colon a CJK-width paste ships", () => {
    // ﹕ (U+FE55) is the small form of ：, so a row typed with it held no
    // delimiter the splitter knew and stayed a single field.
    const rawLine = "林舟﹕北京大学﹕北京市";
    const result = parseStudentText(rawLine);

    expect(result.candidates).toEqual([
      { name: "林舟", university: "北京大学", city: "北京市", sourceLine: 1, rawLine },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reads a roster headed by the small colon and names the gap of its empty 院校 cell", () => {
    const result = parseStudentText([
      "姓名﹕院校﹕城市﹕去向类型",
      "苏禾﹕浙江大学﹕杭州市﹕",
      "周晴﹕哈佛大学﹕波士顿﹕海外",
      "林舟﹕﹕北京市﹕",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿", locationScope: "international" }),
    ]);
    expect(result.candidates[0]?.locationScope).toBeUndefined();
    expect(result.unparsed).toEqual([
      { sourceLine: 4, rawLine: "林舟﹕﹕北京市﹕", reason: "缺少院校" },
    ]);
  });

  it("reads a ﹕-separated roster without a header and reports its gap", () => {
    const result = parseStudentText("苏禾﹕浙江大学﹕杭州市\n林舟﹕﹕北京市");

    expect(result.candidates).toEqual([expect.objectContaining({ name: "苏禾", city: "杭州市" })]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟﹕﹕北京市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("keeps a ﹕ inside one cell from splitting a row another delimiter already divides", () => {
    // The header names the comma as the delimiter, so a 城市 that lists two
    // places must stay one cell instead of opening a column of its own.
    const result = parseStudentText([
      "姓名,院校,城市",
      "苏禾,浙江大学,杭州市",
      "周晴,哈佛大学,波士顿﹕剑桥",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿﹕剑桥" }),
    ]);
    expect(result.unparsed).toEqual([]);
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
      expect.objectContaining({ name: "北京大学 （深圳研究生院）", university: "林舟", city: "深圳市", sourceLine: 2 }),
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
    const result = parseStudentText("姓名,院校,城市\n,,杭州市");

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

describe("empty cells in a header-less paste", () => {
  it("reports a row with an empty cell instead of shifting its later columns left", () => {
    // Dropping the empty 院校 cell pulled 城市 into its place and the overseas
    // marker into 城市: 林舟 imported as a student studying at 北京市, and
    // nothing warned about it because the shifted row looked complete.
    const result = parseStudentText("苏禾,浙江大学,杭州市,\n林舟,,北京市,海外");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟,,北京市,海外", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("keeps a three-column row with a gap out of the candidates", () => {
    const result = parseStudentText("苏禾,浙江大学,杭州市\n林舟,,北京市");

    expect(result.candidates).toEqual([expect.objectContaining({ name: "苏禾", city: "杭州市" })]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟,,北京市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("still reads a paste padded with a column no row fills", () => {
    // A blank 序号 column and a trailing separator shift nothing, so both
    // rosters have to keep importing whole.
    const leading = parseStudentText(",林舟,北京大学,北京市\n,苏禾,浙江大学,杭州市");
    const trailing = parseStudentText("林舟,北京大学,北京市,\n苏禾,浙江大学,杭州市,");

    for (const result of [leading, trailing]) {
      expect(result.candidates).toEqual([
        expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
        expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      ]);
      expect(result.unparsed).toEqual([]);
    }
  });

  it("tells a padding column apart from a gap in the same paste", () => {
    const result = parseStudentText(",林舟,北京大学,北京市\n,苏禾,,杭州市");

    expect(result.candidates).toEqual([expect.objectContaining({ name: "林舟", city: "北京市" })]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: ",苏禾,,杭州市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });
});

describe("number columns in a header-less paste", () => {
  it("drops a 学号 column instead of importing the student number as the name", () => {
    // Read by position the serial took the 姓名 slot and pushed every later value
    // one column left: a student called 20260001 attending 林舟, a record complete
    // enough that nothing ever warned about it.
    const result = parseStudentText("20260001,林舟,北京大学,北京市\n20260002,苏禾,浙江大学,杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps the overseas marker aligned once a 序号 column is gone", () => {
    const result = parseStudentText("1\t林舟\t北京大学\t北京市\t中国去向\n2\t周晴\t哈佛大学\t波士顿\t海外");

    expect(result.candidates[0]).not.toHaveProperty("locationScope");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
    // The quoted line still holds the serial, so it maps back to what the user pasted.
    expect(result.candidates[1]?.rawLine).toBe("2\t周晴\t哈佛大学\t波士顿\t海外");
  });

  it("reads a number sitting between two named columns as a column of its own", () => {
    const result = parseStudentText("林舟,20260001,北京大学,北京市\n苏禾,20260002,浙江大学,杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
  });

  it("keeps the numbers of a paste that has no column to spare", () => {
    // Nothing is left to read as 姓名 once the digits go, so "001" is taken at face
    // value: an anonymized roster imports rather than disappearing.
    const result = parseStudentText("001,北京大学,北京市\n002,浙江大学,杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "001", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "002", university: "浙江大学", city: "杭州市" }),
    ]);
  });

  it("keeps a column another row fills with a name", () => {
    // 苏禾 makes the first column a real one, so the paste is malformed rather than
    // numbered, and no column is dropped behind the user's back.
    const result = parseStudentText("1,林舟,北京大学,北京市\n苏禾,浙江大学,杭州市,");

    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "苏禾", university: "浙江大学" }));
    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "1", university: "林舟" }));
  });

  it("leaves a numeric column that a header names to the header mapping", () => {
    const result = parseStudentText("学号,姓名,院校,城市\n20260001,林舟,北京大学,北京市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", sourceLine: 2 }),
    ]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("a 序号 leading a whitespace-separated line", () => {
  it("drops the number instead of importing it as the name", () => {
    // Spaces open no column to compare, so the serial kept the 姓名 slot and pushed
    // every later value one field left: a student called 1 attending 林舟.
    const result = parseStudentText("1 林舟 北京大学 北京市\n2 苏禾 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    // The reported line still holds the serial, so it maps back to what the user pasted.
    expect(result.candidates[0]?.rawLine).toBe("1 林舟 北京大学 北京市");
    expect(result.unparsed).toEqual([]);
  });

  it("drops a 学号 as readily as a 序号 and keeps the overseas marker aligned", () => {
    const result = parseStudentText("20260001 林舟 北京大学 北京市 中国去向\n20260002 周晴 哈佛大学 波士顿 海外");

    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "林舟", city: "北京市" }));
    expect(result.candidates[0]).not.toHaveProperty("locationScope");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
  });

  it("keeps the number of a line that has no word to spare", () => {
    // Nothing is left to read as 姓名 once the digits go, so "001" is taken at face
    // value: an anonymized roster imports rather than disappearing.
    const result = parseStudentText("001 北京大学 北京市\n002 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "001", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "002", university: "浙江大学", city: "杭州市" }),
    ]);
  });

  it("leaves a number that a whitespace header already names to the header mapping", () => {
    const result = parseStudentText("序号 姓名 院校 城市\n1 林舟 北京大学 北京市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市", sourceLine: 2 }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps a tab-separated row split on its tabs rather than on the space after the serial", () => {
    // Reading "1" as a list marker would eat the tab behind it and glue 林舟 to the
    // university, so the number has to go as a cell, not as punctuation.
    const result = parseStudentText("1\t林舟 舟\t北京大学\t北京市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟 舟", university: "北京大学", city: "北京市" }),
    ]);
  });
});

describe("a 序号 typed in fullwidth digits", () => {
  it("drops a fullwidth number leading a whitespace-separated line", () => {
    // A roster numbered with the IME in fullwidth mode reads "１" as a word, not as a
    // serial, so it took the 姓名 slot and pushed every later value one field left: a
    // student called １ attending 林舟, complete-looking enough that nothing warned.
    const result = parseStudentText("１ 林舟 北京大学 北京市\n２ 苏禾 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("drops a fullwidth 序号 column and keeps the overseas marker aligned", () => {
    // The shift moved 海外 out of the 去向类型 slot, which quietly put an overseas
    // student back on the China map.
    const result = parseStudentText("１,林舟,北京大学,北京市,中国去向\n２,周晴,哈佛大学,波士顿,海外");

    expect(result.candidates[0]).toEqual(expect.objectContaining({ name: "林舟", city: "北京市" }));
    expect(result.candidates[0]).not.toHaveProperty("locationScope");
    expect(result.candidates[1]).toEqual(expect.objectContaining({ name: "周晴", locationScope: "international" }));
  });

  it("reads a fullwidth-numbered list marker as punctuation", () => {
    const result = parseStudentText("１、林舟，北京大学，北京市\n２、苏禾，浙江大学，杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reads a fullwidth full stop after the 序号 as punctuation", () => {
    // The IME types the period fullwidth too, and "．" was outside the marker class:
    // "１．林舟" stayed one word, so the roster imported students named "１．林舟".
    const result = parseStudentText("１．林舟 北京大学 北京市\n２．苏禾 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reads a fullwidth closing parenthesis after the 序号 as punctuation", () => {
    const result = parseStudentText("1）林舟 北京大学 北京市\n2）苏禾 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reads the 。 a Chinese IME types for the period as punctuation", () => {
    const result = parseStudentText("１。林舟 北京大学 北京市\n２。苏禾 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("finds the ，separator of a line a fullwidth marker opens", () => {
    // The marker is stripped before the delimiter is looked for, so "１．" must not
    // hide the ，columns behind it.
    const result = parseStudentText("１．林舟，北京大学，北京市\n２．苏禾，浙江大学，杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps a fullwidth decimal a number rather than a marker and its name", () => {
    // "２．５" is one serial: reading "．" as a list marker would have made 5 the
    // student and pushed 林舟 into the 院校 slot.
    const result = parseStudentText("２．５ 林舟 北京大学 北京市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps a fullwidth number the line has no word to spare for", () => {
    // Same face-value rule as the ASCII "001": an anonymized roster still imports.
    const result = parseStudentText("００１ 北京大学 北京市\n００２ 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "００１", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "００２", university: "浙江大学", city: "杭州市" }),
    ]);
  });

  it("still treats a serial Excel left with a trailing .0 as a number", () => {
    const result = parseStudentText("1.0 林舟 北京大学 北京市\n2.0 苏禾 浙江大学 杭州市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
  });
});

describe("hyphens in an unlabeled line", () => {
  it("keeps a hyphenated name whole instead of reading it as two fields", () => {
    // Splitting on the hyphen made 克莱尔 her university and 巴黎高等师范 her
    // city: a plausible-looking record no warning ever pointed at.
    const result = parseStudentText("玛丽-克莱尔 巴黎高等师范 巴黎");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "玛丽-克莱尔", university: "巴黎高等师范", city: "巴黎" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("separates on a hyphen only where it stands between spaces", () => {
    const spaced = parseStudentText("顾言 - 复旦大学 - 上海市");
    const glued = parseStudentText("顾言-复旦大学-上海市");

    expect(spaced.candidates).toEqual([
      expect.objectContaining({ name: "顾言", university: "复旦大学", city: "上海市" }),
    ]);
    // A glued hyphen may belong to any of the three values, so the row is
    // reported rather than cut at a guess.
    expect(glued.candidates).toEqual([]);
    expect(glued.unparsed).toEqual([
      { sourceLine: 1, rawLine: "顾言-复旦大学-上海市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });
});

describe("、 | ； separated pastes", () => {
  it("keeps an empty cell of a bar-separated row from shifting the later columns left", () => {
    // Filtering the blank out imported 林舟 as a student of 北京市 living in 海外.
    const result = parseStudentText("苏禾|浙江大学|杭州市|海外\n林舟||北京市|海外");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟||北京市|海外", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("reads a row separated by the fullwidth bar a Chinese keyboard types", () => {
    // ｜ (U+FF5C) is what a Chinese IME produces, so a pasted roster never held
    // the ASCII bar the splitter looked for and the whole line stayed one field.
    const result = parseStudentText("林舟｜北京大学｜北京市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps a fullwidth-bar roster aligned when one row states an overseas 去向", () => {
    const result = parseStudentText([
      "苏禾｜浙江大学｜杭州市",
      "林舟｜北京大学｜北京市",
      "周晴｜哈佛大学｜波士顿｜海外",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿", locationScope: "international" }),
    ]);
    // The 去向 column only the last row fills must not pull anyone else's cells left.
    expect(result.candidates[0]?.locationScope).toBeUndefined();
    expect(result.candidates[1]?.locationScope).toBeUndefined();
    expect(result.unparsed).toEqual([]);
  });

  it("names the missing 院校 of a 、-separated row instead of moving the city into it", () => {
    const result = parseStudentText([
      "姓名、院校、城市",
      "苏禾、浙江大学、杭州市",
      "林舟、、北京市",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
    ]);
    expect(result.unparsed).toEqual([
      { sourceLine: 3, rawLine: "林舟、、北京市", reason: "缺少院校" },
    ]);
  });

  it("reads a semicolon-separated roster and reports its gap", () => {
    const result = parseStudentText("苏禾；浙江大学；杭州市\n林舟；；北京市");

    expect(result.candidates).toEqual([expect.objectContaining({ name: "苏禾", city: "杭州市" })]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟；；北京市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("reads a pasted markdown table without importing its rule row", () => {
    // The bars are columns now, so the rule row lines up with 姓名/院校/城市 and
    // would import a student called "---".
    const result = parseStudentText([
      "| 姓名 | 院校 | 城市 |",
      "| --- | --- | --- |",
      "| 林舟 | 北京大学 | 北京市 |",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("still reads a 、 that numbers a list or enumerates inside one cell", () => {
    // 、 is the Chinese enumeration mark as well as a separator, so a single one
    // must not turn "北京、天津" into a column of its own.
    const result = parseStudentText([
      "1、林舟 北京大学 北京",
      "2、苏禾、浙江大学、杭州市",
      "3、周晴 哈佛大学 波士顿、剑桥",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reads a roster separated by the small ideographic comma a CJK-width paste ships", () => {
    // ﹑ (U+FE51) is the small form of 、, so a roster typed with it held no
    // delimiter the splitter knew and every row stayed a single field.
    const result = parseStudentText([
      "姓名﹑院校﹑城市﹑去向类型",
      "苏禾﹑浙江大学﹑杭州市﹑",
      "周晴﹑哈佛大学﹑波士顿﹑海外",
      "林舟﹑﹑北京市﹑",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿", locationScope: "international" }),
    ]);
    expect(result.candidates[0]?.locationScope).toBeUndefined();
    expect(result.unparsed).toEqual([
      { sourceLine: 4, rawLine: "林舟﹑﹑北京市﹑", reason: "缺少院校" },
    ]);
  });

  it("still reads a ﹑ that numbers a list or enumerates inside one cell", () => {
    const result = parseStudentText([
      "1﹑林舟 北京大学 北京",
      "2﹑苏禾﹑浙江大学﹑杭州市",
      "3﹑周晴 哈佛大学 波士顿﹑剑桥",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京" }),
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("reads a roster headed by the small semicolon a CJK-width paste ships", () => {
    // ﹔ (U+FE54) is the small form of ；, so a roster typed with it held no
    // delimiter the splitter knew and every row stayed a single field.
    const result = parseStudentText([
      "姓名﹔院校﹔城市﹔去向类型",
      "苏禾﹔浙江大学﹔杭州市﹔",
      "周晴﹔哈佛大学﹔波士顿﹔海外",
      "林舟﹔﹔北京市﹔",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿", locationScope: "international" }),
    ]);
    expect(result.candidates[0]?.locationScope).toBeUndefined();
    expect(result.unparsed).toEqual([
      { sourceLine: 4, rawLine: "林舟﹔﹔北京市﹔", reason: "缺少院校" },
    ]);
  });

  it("reads a ﹔-separated roster without a header and reports its gap", () => {
    const result = parseStudentText("苏禾﹔浙江大学﹔杭州市\n林舟﹔﹔北京市");

    expect(result.candidates).toEqual([expect.objectContaining({ name: "苏禾", city: "杭州市" })]);
    expect(result.unparsed).toEqual([
      { sourceLine: 2, rawLine: "林舟﹔﹔北京市", reason: "无法识别学生名称、录取院校和城市" },
    ]);
  });

  it("keeps a ﹔ inside one cell from splitting a row another delimiter already divides", () => {
    // The header names the comma as the delimiter, so a 城市 that lists two
    // places must stay one cell instead of opening a column of its own.
    const result = parseStudentText([
      "姓名,院校,城市",
      "苏禾,浙江大学,杭州市",
      "周晴,哈佛大学,波士顿﹔剑桥",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿﹔剑桥" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("／ separated pastes", () => {
  it("reads a row separated by the fullwidth solidus a Chinese IME types", () => {
    const result = parseStudentText("林舟／北京大学／北京市");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("leaves the ASCII slash of a joint program inside its cell", () => {
    // A / separates nothing in a roster: it writes a date, a path, and the
    // school within a university, so splitting on it cut 哈佛大学 in half.
    const result = parseStudentText("林舟,哈佛大学/肯尼迪学院,波士顿");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "哈佛大学/肯尼迪学院", city: "波士顿" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps an ASCII slash inside the city of an unlabeled line", () => {
    const result = parseStudentText("林舟 北京大学 北京市/海淀区");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市/海淀区" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("still believes the ， of a row whose cell holds a ／", () => {
    // ， is the separator here and ／ only joins a university to its school, so
    // reading the ／ first would have made 肯尼迪学院 the city.
    const result = parseStudentText("林舟，哈佛大学／肯尼迪学院，波士顿");

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "哈佛大学／肯尼迪学院", city: "波士顿" }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("still reads a labeled ，-separated row by its labels", () => {
    const result = parseStudentText("姓名：林舟，就读院校：北京大学，城市：北京市，去向类型：海外");

    expect(result.candidates).toEqual([
      expect.objectContaining({
        name: "林舟", university: "北京大学", city: "北京市", locationScope: "international",
      }),
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("keeps a ／-separated roster aligned when one row states an overseas 去向", () => {
    const result = parseStudentText([
      "苏禾／浙江大学／杭州市",
      "林舟／北京大学／北京市",
      "周晴／哈佛大学／波士顿／海外",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "苏禾", university: "浙江大学", city: "杭州市" }),
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京市" }),
      expect.objectContaining({ name: "周晴", university: "哈佛大学", city: "波士顿", locationScope: "international" }),
    ]);
    expect(result.candidates[0]?.locationScope).toBeUndefined();
    expect(result.candidates[1]?.locationScope).toBeUndefined();
    expect(result.unparsed).toEqual([]);
  });
});
