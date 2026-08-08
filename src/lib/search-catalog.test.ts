import { describe, expect, it } from "vitest";
import {
  resolveCity,
  resolveProvinceName,
  searchCities,
  searchProvinces,
  searchUniversities,
} from "./search-catalog";

describe("local search catalog", () => {
  it("finds Hangzhou with its canonical city and province", () => {
    expect(searchCities("杭州", 5)[0]).toMatchObject({
      name: "杭州市",
      province: "浙江省",
    });
  });

  it("finds Beijing from its common city alias", () => {
    expect(searchCities("北京", 5)[0]?.name).toBe("北京市");
  });

  it("finds Peking University from its exact alias ahead of substring matches", () => {
    expect(searchUniversities("北大", 5)[0]?.name).toBe("北京大学");
  });

  it("ranks university prefix matches ahead of substring matches", () => {
    expect(searchUniversities("浙江大", 5)[0]).toMatchObject({
      name: "浙江大学",
      city: "杭州市",
    });
    expect(searchUniversities("大", 5)[0]?.name).toBe("大连理工大学");
  });

  it("normalizes whitespace and punctuation around a university alias", () => {
    expect(searchUniversities("  北大。 ", 5)[0]?.name).toBe("北京大学");
  });

  it("returns each canonical city once when aliases overlap", () => {
    const results = searchCities("北京", 5);

    expect(results.filter((city) => city.name === "北京市")).toHaveLength(1);
  });

  it("respects the requested result limit", () => {
    expect(searchUniversities("大学", 2)).toHaveLength(2);
  });

  it("resolves Hong Kong, Macau, Taipei and Weihai", () => {
    expect(resolveCity("香港")).toMatchObject({ city: "香港特别行政区", province: "香港特别行政区", status: "resolved" });
    expect(resolveCity("澳门")).toMatchObject({ city: "澳门特别行政区", province: "澳门特别行政区", status: "resolved" });
    expect(resolveCity("台北")).toMatchObject({ city: "台北市", province: "台湾省", status: "resolved" });
    expect(resolveCity("威海")).toMatchObject({ city: "威海市", province: "山东省", status: "resolved" });
  });

  it("resolves a city omitted from the old hand-maintained catalog", () => {
    expect(resolveCity("沧州")).toMatchObject({
      city: "沧州市",
      province: "河北省",
      status: "resolved",
    });
  });

  it("resolves legacy aliases for autonomous prefectures", () => {
    expect(resolveCity("大理")).toMatchObject({
      city: "大理白族自治州",
      province: "云南省",
      status: "resolved",
    });
    expect(resolveCity("延边")).toMatchObject({
      city: "延边朝鲜族自治州",
      province: "吉林省",
      status: "resolved",
    });
    expect(resolveCity("西双版纳")).toMatchObject({
      city: "西双版纳傣族自治州",
      province: "云南省",
      status: "resolved",
    });
  });

  it("searches every generated province even without a matching city", () => {
    expect(searchProvinces("西藏", 5)).toEqual(["西藏自治区"]);
  });

  it("does not surface the directly administered county placeholder as a city", () => {
    const results = searchCities("河南", 5);

    expect(results.map((city) => city.name)).not.toContain("河南省-省直辖县级行政区划");
    expect(results.every((city) => !city.name.includes("直辖县级行政区划"))).toBe(true);
  });

  describe("resolveProvinceName", () => {
    it("maps a short province alias to the canonical GeoJSON name", () => {
      expect(resolveProvinceName("浙江")).toBe("浙江省");
    });

    it("keeps an already canonical province name unchanged", () => {
      expect(resolveProvinceName("广东省")).toBe("广东省");
    });

    it("keeps a prefecture-level autonomous prefecture name unchanged instead of resolving it to a province", () => {
      expect(resolveProvinceName("海南藏族自治州")).toBe("海南藏族自治州");
    });
  });

  it("resolves city names prefixed by their province", () => {
    expect(resolveCity("广东深圳")).toMatchObject({ city: "深圳市", province: "广东省", status: "resolved" });
    expect(resolveCity("广东省深圳市")).toMatchObject({ city: "深圳市", province: "广东省", status: "resolved" });
  });

  it("keeps custom cities unresolved", () => {
    expect(resolveCity("自定义火星城")).toMatchObject({ status: "unresolved" });
  });
});
