import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chinaCities } from "../data/china-locations";
import { chinaUniversities as universityCatalog } from "../data/china-universities";
import {
  resolveCity,
  resolveProvinceName,
  searchCities,
  searchProvinces,
  type CityResolution,
} from "./search-catalog";
import {
  resolveUniversity,
  searchUniversities,
} from "./search-university-catalog";

describe("local search catalog", () => {
  it("keeps the city catalog free of the university list", () => {
    expect(readFileSync("src/lib/search-catalog.ts", "utf-8")).not.toContain("china-universities");
    expect(readFileSync("src/components/canvas/PosterCanvas.tsx", "utf-8")).not.toContain("university-emblems");
  });
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
    // 别名精确匹配优先于任何名称子串匹配（如"北京北大方正软件职业技术学院"）。
    expect(searchUniversities("北大", 5)[0]?.name).toBe("北京大学");
  });

  it("ranks university prefix matches ahead of substring matches", () => {
    expect(searchUniversities("浙江大", 5)[0]).toMatchObject({
      name: "浙江大学",
      city: "杭州市",
    });
    expect(searchUniversities("中南", 5)[0]?.name).toBe("中南大学");
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

  it.each<[input: string, expected: CityResolution]>([
    // Beijing municipality: alias resolves to the municipal city/province pair.
    ["北京", { city: "北京市", province: "北京市", status: "resolved" }],
    // Special regions and Taiwan compatibility rows.
    ["香港", { city: "香港特别行政区", province: "香港特别行政区", status: "resolved" }],
    ["澳门", { city: "澳门特别行政区", province: "澳门特别行政区", status: "resolved" }],
    ["台北", { city: "台北市", province: "台湾省", status: "resolved" }],
    // A normal upstream prefecture-level city with a legacy alias.
    ["威海", { city: "威海市", province: "山东省", status: "resolved" }],
    // Province-prefixed city input.
    ["广东深圳", { city: "深圳市", province: "广东省", status: "resolved" }],
    // Unknown/custom city stays unresolved with the original name.
    ["自定义火星城", { city: "自定义火星城", province: "", status: "unresolved" }],
  ])('resolves the compatibility input "%s" to the expected city/province pair', (input, expected) => {
    expect(resolveCity(input)).toEqual(expected);
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

  it("resolves 州/地区/盟 cities exactly as search finds them", () => {
    expect(resolveCity("阿里")).toMatchObject({
      city: "阿里地区",
      province: "西藏自治区",
      status: "resolved",
    });
    expect(resolveCity("兴安")).toMatchObject({
      city: "兴安盟",
      province: "内蒙古自治区",
      status: "resolved",
    });
  });

  it.each<[input: string, expected: CityResolution]>([
    // Legacy county-level/historical city labels preserved for backwards-compatible importing:
    // 莱芜 merged into 济南市 in 2019; 敦煌/格尔木/喀什/伊宁 are county-level cities that
    // resolve to their canonical upstream prefecture; 济源 keeps a standalone compatibility row.
    ["莱芜", { city: "济南市", province: "山东省", status: "resolved" }],
    ["济源", { city: "济源市", province: "河南省", status: "resolved" }],
    ["敦煌", { city: "酒泉市", province: "甘肃省", status: "resolved" }],
    ["格尔木", { city: "海西蒙古族藏族自治州", province: "青海省", status: "resolved" }],
    ["喀什", { city: "喀什地区", province: "新疆维吾尔自治区", status: "resolved" }],
    ["伊宁", { city: "伊犁哈萨克自治州", province: "新疆维吾尔自治区", status: "resolved" }],
  ])('resolves the legacy compatibility input "%s" to its canonical city/province pair', (input, expected) => {
    expect(resolveCity(input)).toEqual(expected);
  });

  it("searches every generated province even without a matching city", () => {
    expect(searchProvinces("西藏", 5)).toEqual(["西藏自治区"]);
  });

  it("excludes every directly administered county placeholder from the generated city catalog", () => {
    const placeholders = chinaCities.filter((city) => city.name.includes("直辖县级行政区划"));

    expect(placeholders).toEqual([]);
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

  describe("resolveUniversity", () => {
    it("resolves a university to its canonical city and province", () => {
      expect(resolveUniversity("浙江大学")).toEqual({
        university: "浙江大学",
        city: "杭州市",
        province: "浙江省",
        status: "resolved",
      });
    });

    it("resolves a university from its exact alias", () => {
      expect(resolveUniversity("浙大")).toMatchObject({
        university: "浙江大学",
        city: "杭州市",
        province: "浙江省",
        status: "resolved",
      });
      expect(resolveUniversity("北大")).toMatchObject({
        university: "北京大学",
        city: "北京市",
        province: "北京市",
        status: "resolved",
      });
    });

    it("resolves municipality universities to the municipality as both city and province", () => {
      expect(resolveUniversity("清华大学")).toMatchObject({
        university: "清华大学",
        city: "北京市",
        province: "北京市",
        status: "resolved",
      });
    });

    it("keeps an unknown university unresolved with an empty city and province", () => {
      expect(resolveUniversity("火星大学")).toEqual({
        university: "火星大学",
        city: "",
        province: "",
        status: "unresolved",
      });
    });

    it("rejects empty and partial inputs that are not an exact school name", () => {
      expect(resolveUniversity("")).toMatchObject({ status: "unresolved" });
      // 只有学校简称，不匹配任何大学的精确名/别名
      expect(resolveUniversity("浙江")).toMatchObject({ status: "unresolved" });
    });

    it("trims surrounding whitespace before resolving", () => {
      expect(resolveUniversity("  复旦大学  ")).toMatchObject({
        university: "复旦大学",
        city: "上海市",
        status: "resolved",
      });
    });
  });

  describe("generated university catalog integrity", () => {
    it("covers a broad set of ordinary higher-education institutions", () => {
      expect(universityCatalog.length).toBeGreaterThan(2000);
      expect(universityCatalog.length).toBeLessThan(4000);
    });

    it("keeps every university row with a non-empty province and city", () => {
      const invalid = universityCatalog.filter(
        (entry) => !entry.province.trim() || !entry.city.trim(),
      );
      expect(invalid).toEqual([]);
    });

    it("keeps at least 98% of university cities resolvable to a canonical province", () => {
      const unresolved = universityCatalog.filter(
        (entry) => resolveCity(entry.city).status !== "resolved",
      );
      expect(unresolved.length / universityCatalog.length).toBeLessThan(0.02);
    });

    it("keeps the hand-curated aliases attached to their schools", () => {
      expect(catalogEntryAliases("北京大学")).toEqual(["北大"]);
      expect(catalogEntryAliases("上海交通大学")).toEqual(["上交", "上海交大"]);
    });
  });
});

function catalogEntryAliases(name: string): string[] {
  return universityCatalog.find((entry) => entry.name === name)?.aliases ?? [];
}
