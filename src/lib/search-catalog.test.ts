import { describe, expect, it } from "vitest";
import {
  resolveCity,
  searchCities,
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

  it("resolves city names prefixed by their province", () => {
    expect(resolveCity("广东深圳")).toMatchObject({ city: "深圳市", province: "广东省", status: "resolved" });
    expect(resolveCity("广东省深圳市")).toMatchObject({ city: "深圳市", province: "广东省", status: "resolved" });
  });

  it("keeps custom cities unresolved", () => {
    expect(resolveCity("自定义火星城")).toMatchObject({ status: "unresolved" });
  });
});
