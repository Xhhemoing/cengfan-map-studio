import { describe, expect, it } from "vitest";
import { globalDataViewLabel, globalDataViews } from "./global-data-views";

describe("globalDataViews", () => {
  it("keeps the navigation order the screen renders", () => {
    expect(globalDataViews.map((item) => item.id)).toEqual([
      "overview",
      "roster",
      "quality",
      "mapping",
      "presentation",
    ]);
  });
});

describe("globalDataViewLabel", () => {
  it("returns the label of each known view", () => {
    expect(globalDataViewLabel("overview")).toBe("数据总览");
    expect(globalDataViewLabel("roster")).toBe("名单管理");
    expect(globalDataViewLabel("quality")).toBe("数据质量");
    expect(globalDataViewLabel("mapping")).toBe("地图映射");
    expect(globalDataViewLabel("presentation")).toBe("数据呈现");
  });

  it("falls back to 数据总览 for an unknown view", () => {
    expect(globalDataViewLabel("unknown" as never)).toBe("数据总览");
  });
});
