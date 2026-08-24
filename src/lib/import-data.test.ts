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

  it("skips header rows that are not on the first line", () => {
    const result = parseStudentText([
      "2026 届毕业生名单",
      "姓名,去向,所在城市,类型",
      "林舟,北京大学,北京,中国去向",
    ].join("\n"));

    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "林舟", university: "北京大学", city: "北京" }),
    ]);
    expect(result.candidates.some((candidate) => candidate.name === "姓名")).toBe(false);
    expect(result.unparsed).toEqual([
      expect.objectContaining({ rawLine: "2026 届毕业生名单" }),
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

  it("recognizes 海外去向 in plain pasted text via the shared scope parser (I-10-01)", () => {
    const result = parseStudentText("王远 剑桥大学 英国·伦敦 海外去向");

    expect(result.candidates).toEqual([{
      name: "王远",
      university: "剑桥大学",
      city: "英国·伦敦",
      locationScope: "international",
      sourceLine: 1,
      rawLine: "王远 剑桥大学 英国·伦敦 海外去向",
    }]);
    expect(result.unparsed).toEqual([]);
  });

  it("flags out-of-enum destination scopes in pasted text with a readable warning (I-10-01)", () => {
    const result = parseStudentText([
      "林舟 北京大学 北京 中国去向",
      "陈宁 香港大学 香港 港澳台",
    ].join("\n"));

    expect(result.candidates).toHaveLength(2);
    // 枚举内取值不产生提示。
    expect(result.candidates[0]!.locationScope).toBeUndefined();
    expect(result.candidates[0]!.warnings).toBeUndefined();
    // 枚举外取值仍按中国去向导入，但必须带可读提示，不允许静默。
    expect(result.candidates[1]!.locationScope).toBeUndefined();
    expect(result.candidates[1]!.warnings).toEqual(["去向类型「港澳台」未识别，已按中国去向导入"]);
    expect(result.unparsed).toEqual([]);
  });

  it("applies the shared scope parser on delimited tables too (I-10-01)", () => {
    const rows = parseDelimitedTable("姓名,院校,城市,去向类型\n王远,剑桥大学,英国·伦敦,海外去向");
    expect(rows).toEqual([expect.objectContaining({ name: "王远", locationScope: "international" })]);
  });
});
