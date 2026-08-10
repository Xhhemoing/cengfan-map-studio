import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chinaUniversities } from "./china-universities";
import { universityEmblems, universityEmblemsMissing, universityEmblemStats } from "./university-emblems";

describe("university emblem catalog", () => {
  it("covers at least 98% of the university catalog", () => {
    expect(universityEmblemStats.total).toBe(chinaUniversities.length);
    expect(universityEmblemStats.withEmblem / universityEmblemStats.total).toBeGreaterThan(0.98);
  });

  it("missing list matches the catalog minus the emblem map", () => {
    const catalog = new Set(chinaUniversities.map((u) => u.name));
    const withEmblem = new Set(Object.keys(universityEmblems));
    const expectedMissing = [...catalog].filter((name) => !withEmblem.has(name)).sort((a, b) => a.localeCompare(b, "zh-CN"));
    expect(universityEmblemsMissing).toEqual(expectedMissing);
    expect(universityEmblemStats.missing).toBe(universityEmblemsMissing.length);
  });

  it("every emblem asset path resolves to an existing public file", () => {
    const root = resolve(import.meta.dirname, "../../public");
    let checked = 0;
    for (const [name, src] of Object.entries(universityEmblems)) {
      expect(src.startsWith("/emblems/")).toBe(true);
      const file = resolve(root, src.replace(/^\//, ""));
      expect(existsSync(file), `${name} 的校徽文件缺失: ${src}`).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(2800);
  });

  it("maps well-known universities to their emblems", () => {
    expect(universityEmblems["浙江大学"]).toBe("/emblems/浙江大学.webp");
    expect(universityEmblems["清华大学"]).toBe("/emblems/清华大学.webp");
    expect(universityEmblems["福建福耀科技大学"]).toBe("/emblems/福建福耀科技大学.webp");
    expect(universityEmblemsMissing).not.toContain("浙江大学");
  });
});
