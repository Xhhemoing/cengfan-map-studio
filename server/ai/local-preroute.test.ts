import { describe, expect, it } from "vitest";
import { getProvinceNames, toShortProvinceName } from "../../src/lib/map-data";
import { resolveProvinceName } from "../../src/lib/search-catalog";
import { matchLocalStatIntent, tryLocalPreroute } from "./local-preroute";

const digest = {
  students: {
    total: 42,
    hidden: 2,
    duplicateGroups: 3,
    duplicateStudentCount: 7,
    topProvinces: [
      { province: "广东省", count: 12 },
      { province: "北京市", count: 8 },
      { province: "内蒙古自治区", count: 1 },
    ],
  },
};

describe("matchLocalStatIntent 命中", () => {
  it.each([
    ["多少人", "student-total"],
    ["一共有多少人", "student-total"],
    ["名单里总共有几个同学", "student-total"],
    ["请问现在有多少名学生？", "student-total"],
    ["学生总数是多少", "student-total"],
    ["人数", "student-total"],
    ["有没有重复", "duplicate"],
    ["有重复吗", "duplicate"],
    ["重复了吗", "duplicate"],
    ["有多少组重复", "duplicate"],
    ["重复的有几个", "duplicate"],
    ["隐藏了多少人", "hidden-count"],
    ["有多少人被隐藏了", "hidden-count"],
    ["哪个省最多", "top-province"],
    ["人最多的省份是哪个", "top-province"],
    ["人数最多的是哪个省", "top-province"],
  ])("把「%s」识别为 %s", (message, kind) => {
    expect(matchLocalStatIntent(message)).toMatchObject({ kind });
  });

  it.each([
    ["广东有几人", "广东省"],
    ["广东有几人啊？", "广东省"],
    ["上海有几人", "上海市"],
    ["内蒙有多少人", "内蒙古自治区"],
    ["香港有几个学生", "香港特别行政区"],
    ["广东省有多少人", "广东省"],
    ["北京多少个同学", "北京市"],
    ["内蒙古的人数是多少", "内蒙古自治区"],
    ["新疆有多少名学生", "新疆维吾尔自治区"],
    // 城市目录里直辖市/特区自带的别名，旧的本地词表没有这些写法。
    ["帝都有几人", "北京市"],
    ["魔都有多少人", "上海市"],
    ["渝有多少人", "重庆市"],
  ])("把「%s」解析成省份 %s", (message, province) => {
    expect(matchLocalStatIntent(message)).toEqual({ kind: "province-count", province });
  });

  /**
   * 预路由在服务端跑，不能 import 带 geojson 的 search-catalog（见实现里的注释），
   * 但测试跑在 Vite 下可以。用这条把两侧钉死：地图省名或目录改名时这里先红，
   * 而不是等到线上答错省份。
   */
  it("每个省的全名与短名都与 search-catalog 的权威解析一致", () => {
    const provinces = getProvinceNames();
    expect(provinces).toHaveLength(34);
    for (const name of provinces) {
      for (const variant of new Set([name, toShortProvinceName(name)])) {
        expect(matchLocalStatIntent(`${variant}有几人`))
          .toEqual({ kind: "province-count", province: resolveProvinceName(variant) });
      }
    }
  });
});

describe("matchLocalStatIntent 未命中", () => {
  it.each([
    "把城市字号调大",
    "城市视图切换一下",
    "把广东的人挪到左边",
    "帮我数一下广东有几人然后把地图放大",
    "去重",
    "重复的删掉",
    "隐藏没有城市的同学",
    "生成一版更紧凑的布局",
  ])("含写意图的「%s」不命中", (message) => {
    expect(matchLocalStatIntent(message)).toBeNull();
  });

  it.each([
    "",
    "你好",
    "北大有几人",
    "深圳有多少人",
    "海淀区有几人",
    "多少人适合放在一页里比较好看",
    "北京的房价是多少",
    "省份最多的是哪个",
    "这个海报怎么排版更好看",
  ])("非统计问题或非省级范围的「%s」不命中", (message) => {
    expect(matchLocalStatIntent(message)).toBeNull();
  });
});

describe("tryLocalPreroute", () => {
  it("按 digest 计数回答总人数并说明隐藏行", () => {
    expect(tryLocalPreroute({ userMessage: "一共有多少人", digest, messages: [] })).toEqual({
      intent: "student-total",
      summary: "当前名单共 42 名同学，其中 2 名已隐藏。",
    });
  });

  it("按 topProvinces 回答省份人数", () => {
    expect(tryLocalPreroute({ userMessage: "广东有几人", digest, messages: [] })?.summary)
      .toBe("广东省目前有 12 名同学（未计入 2 名已隐藏同学）。");
  });

  it("榜单未截断时把缺席省份如实答成 0", () => {
    expect(tryLocalPreroute({ userMessage: "西藏有多少人", digest, messages: [] })?.summary)
      .toBe("西藏自治区目前没有同学（未计入 2 名已隐藏同学）。");
  });

  it("topProvinces 满 10 条时不敢断言缺席省份为 0，交回主模型", () => {
    const truncated = {
      students: {
        ...digest.students,
        topProvinces: Array.from({ length: 10 }, (_, index) => ({ province: `省${index}`, count: 10 - index })),
      },
    };
    expect(tryLocalPreroute({ userMessage: "西藏有多少人", digest: truncated, messages: [] })).toBeNull();
  });

  it("回答重复与最多省份", () => {
    expect(tryLocalPreroute({ userMessage: "有没有重复", digest, messages: [] })?.summary)
      .toBe("检测到 3 组重复，共涉及 7 名同学。");
    expect(tryLocalPreroute({ userMessage: "哪个省最多", digest, messages: [] })?.summary)
      .toBe("人数最多的是广东省，共 12 名同学（未计入 2 名已隐藏同学）。");
  });

  it("没有重复时给出否定结论", () => {
    const clean = { students: { ...digest.students, hidden: 0, duplicateGroups: 0, duplicateStudentCount: 0 } };
    expect(tryLocalPreroute({ userMessage: "有重复吗", digest: clean, messages: [] })?.summary)
      .toBe("未检测到重复的同学。");
    expect(tryLocalPreroute({ userMessage: "多少人", digest: clean, messages: [] })?.summary)
      .toBe("当前名单共 42 名同学。");
  });

  it("digest 缺少 students 统计时不预路由", () => {
    expect(tryLocalPreroute({ userMessage: "多少人", digest: {}, messages: [] })).toBeNull();
    expect(tryLocalPreroute({ userMessage: "多少人", digest: { students: { total: "42" } }, messages: [] })).toBeNull();
  });

  it("agent 循环进行中时不打断多步任务", () => {
    const messages = [
      { role: "assistant" as const, content: null, tool_calls: [{ id: "t1", type: "function" as const, function: { name: "inspect_project", arguments: "{}" } }] },
      { role: "tool" as const, tool_call_id: "t1", content: "{}" },
    ];
    expect(tryLocalPreroute({ userMessage: "多少人", digest, messages })).toBeNull();
  });

  it("上一段任务的工具往返不挡住新提问", () => {
    const messages = [
      { role: "user" as const, content: "把地图调小一点" },
      { role: "assistant" as const, content: null, tool_calls: [{ id: "t1", type: "function" as const, function: { name: "update_map", arguments: "{}" } }] },
      { role: "tool" as const, tool_call_id: "t1", content: "{\"ok\":true}" },
      { role: "assistant" as const, content: "地图已调小。" },
      { role: "user" as const, content: "一共多少人" },
    ];
    expect(tryLocalPreroute({ userMessage: "一共多少人", digest, messages })?.intent).toBe("student-total");
  });

  it("任务中途本轮消息之后已有工具往返时仍不预路由", () => {
    const messages = [
      { role: "user" as const, content: "多少人" },
      { role: "assistant" as const, content: null, tool_calls: [{ id: "t1", type: "function" as const, function: { name: "inspect_project", arguments: "{}" } }] },
      { role: "tool" as const, tool_call_id: "t1", content: "{}" },
      // parseAgentRequest 会把本轮 userMessage 补写到末尾，边界必须取第一条而不是最后一条。
      { role: "user" as const, content: "多少人" },
    ];
    expect(tryLocalPreroute({ userMessage: "多少人", digest, messages })).toBeNull();
  });

  it("此前只有纯文本往返时仍可预路由", () => {
    const messages = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好，需要我做什么？" },
    ];
    expect(tryLocalPreroute({ userMessage: "多少人", digest, messages })?.intent).toBe("student-total");
  });
});
