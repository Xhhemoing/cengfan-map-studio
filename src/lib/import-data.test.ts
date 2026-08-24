import { describe, expect, it } from "vitest";
import { parseStudentText } from "./import-data";

describe("import data", () => {
  it("parses comma and tab separated student rows below a header line", () => {
    const comma = parseStudentText("姓名,院校,城市\n林舟,北京大学,北京\n苏禾,浙江大学,杭州");
    const tab = parseStudentText("姓名\t院校\t城市\n顾言\t复旦大学\t上海");

    expect(comma.candidates).toEqual([
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
    ]);
    expect(comma.unparsed).toEqual([]);

    expect(tab.candidates).toEqual([
      {
        name: "顾言",
        university: "复旦大学",
        city: "上海",
        sourceLine: 2,
        rawLine: "顾言\t复旦大学\t上海",
      },
    ]);
    expect(tab.unparsed).toEqual([]);
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
  });

  it("keeps blank delimited cells as column slots instead of shifting the scope column", () => {
    const result = parseStudentText("张三,,北京市,海外");

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toEqual([
      {
        sourceLine: 1,
        rawLine: "张三,,北京市,海外",
        reason: "无法识别学生名称、录取院校和城市",
      },
    ]);
  });

  it("keeps a leading blank tab cell as a column slot", () => {
    const result = parseStudentText("\t张三\t北京大学\t北京市");

    expect(result.candidates).toEqual([]);
    expect(result.unparsed).toHaveLength(1);
  });

  it("reads an explicit province column after an alias header row", () => {
    const result = parseStudentText([
      "学生姓名,录取院校,城市,去向类型,省份",
      "苏禾,浙江大学,杭州市,中国去向,浙江省",
      "林舟,北京大学,北京市,中国去向,",
    ].join("\n"));

    expect(result.candidates[0]).toEqual({
      name: "苏禾",
      university: "浙江大学",
      city: "杭州市",
      province: "浙江省",
      sourceLine: 2,
      rawLine: "苏禾,浙江大学,杭州市,中国去向,浙江省",
    });
    expect(result.candidates[1]).not.toHaveProperty("province");
    expect(result.unparsed).toEqual([]);
  });

  it("follows the header order instead of column positions when a header row is present", () => {
    const result = parseStudentText([
      "所在省份,城市,录取学校,学生姓名",
      "江苏省,南京市,南京大学,顾言",
    ].join("\n"));

    expect(result.candidates).toEqual([{
      name: "顾言",
      university: "南京大学",
      city: "南京市",
      province: "江苏省",
      sourceLine: 2,
      rawLine: "江苏省,南京市,南京大学,顾言",
    }]);
  });

  it("keeps the legacy four-column order without a header row and never reads a fifth column as province", () => {
    const result = parseStudentText("周晴,哈佛大学,美国·波士顿,海外去向,马萨诸塞州");

    expect(result.candidates).toEqual([{
      name: "周晴",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      sourceLine: 1,
      rawLine: "周晴,哈佛大学,美国·波士顿,海外去向,马萨诸塞州",
    }]);
  });

  it("falls back to column positions when the header row misses a required column", () => {
    const result = parseStudentText([
      "姓名,录取学校,备注",
      "苏禾,浙江大学,杭州市",
    ].join("\n"));

    expect(result.candidates).toEqual([{
      name: "苏禾",
      university: "浙江大学",
      city: "杭州市",
      sourceLine: 2,
      rawLine: "苏禾,浙江大学,杭州市",
    }]);
  });

  it("recognizes a labeled province in natural-language records", () => {
    const result = parseStudentText("姓名：林舟，就读院校：北京大学，城市：北京市，省份：北京市");

    expect(result.candidates).toEqual([{
      name: "林舟",
      university: "北京大学",
      city: "北京市",
      province: "北京市",
      sourceLine: 1,
      rawLine: "姓名：林舟，就读院校：北京大学，城市：北京市，省份：北京市",
    }]);
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
