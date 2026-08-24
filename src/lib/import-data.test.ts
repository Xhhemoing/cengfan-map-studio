import { describe, expect, it } from "vitest";
import { parseDelimitedTable, parseStudentText, type ImportCandidate } from "./import-data";

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

  it("reads the fourth column with the same scope vocabulary as the excel importer", () => {
    const result = parseStudentText([
      "姓名,院校,城市,去向类型",
      "周晴,哈佛大学,美国·波士顿,海外去向",
      "苏禾,浙江大学,杭州市,中国去向",
      "顾言,帝国理工学院,伦敦,Overseas",
    ].join("\n"));

    expect(result.candidates.map((candidate) => candidate.locationScope)).toEqual([
      "international",
      undefined,
      "international",
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("skips alias header rows instead of importing them as students", () => {
    const result = parseStudentText("学生姓名,录取学校,城市\n苏禾,浙江大学,杭州市");

    expect(result.candidates).toEqual([{
      name: "苏禾",
      university: "浙江大学",
      city: "杭州市",
      sourceLine: 2,
      rawLine: "苏禾,浙江大学,杭州市",
    }]);
    expect(result.unparsed).toEqual([]);
    expect(parseDelimitedTable("学生姓名,录取学校,城市\n苏禾,浙江大学,杭州市")).toEqual([
      expect.objectContaining({ name: "苏禾", sourceLine: 2 }),
    ]);
  });

  it("recognizes labeled records that use alias labels", () => {
    const result = parseStudentText("学生姓名：苏禾；录取学校：浙江大学；所在城市：杭州市");

    expect(result.candidates).toEqual([{
      name: "苏禾",
      university: "浙江大学",
      city: "杭州市",
      sourceLine: 1,
      rawLine: "学生姓名：苏禾；录取学校：浙江大学；所在城市：杭州市",
    }]);
  });
});
