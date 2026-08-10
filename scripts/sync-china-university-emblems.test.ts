import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseManifest,
  renderEmblemsModule,
  syncChinaUniversityEmblems,
  EMBLEM_URL_PREFIX,
} from "./sync-china-university-emblems.mjs";

const MANIFEST = {
  北京大学: { type: "eol", sid: 10001 },
  浙江大学: { type: "eol", sid: 10002 },
  安徽科技学院: { type: "repo", file: "安徽科技学院.png" },
};

const UNIVERSITIES_SRC = `export const chinaUniversities: { name: string }[] = [
  { name: "北京大学" },
  { name: "浙江大学" },
  { name: "安徽科技学院" },
  { name: "停办学院" },
];`;

describe("sync china university emblems", () => {
  it("parses the manifest into name->source entries", () => {
    const entries = parseManifest(MANIFEST);
    expect(entries.size).toBe(3);
    expect(entries.get("北京大学")).toEqual({ type: "eol", sid: 10001 });
    expect(entries.get("安徽科技学院")).toEqual({ type: "repo", file: "安徽科技学院.png" });
  });

  it("skips malformed manifest entries", () => {
    const entries = parseManifest({
      好学校: { type: "eol", sid: 1 },
      无类型: { name: "x" },
      无sid: { type: "eol" },
      坏repo: { type: "repo" },
    });
    expect(entries.size).toBe(1);
  });

  it("renders the emblem map module with missing list and stats", () => {
    const entries = parseManifest(MANIFEST);
    const module = renderEmblemsModule(
      entries,
      ["北京大学", "浙江大学", "安徽科技学院", "停办学院"],
      new Set(["北京大学.webp", "浙江大学.webp", "安徽科技学院.webp"]),
    );
    expect(module).toContain(`"北京大学": "${EMBLEM_URL_PREFIX}北京大学.webp"`);
    expect(module).toContain('"停办学院",');
    expect(module).toContain("total: 4");
    expect(module).toContain("withEmblem: 3");
    expect(module).toContain("missing: 1");
  });

  it("writes the module after validating assets exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cengfan-embl-"));
    try {
      const manifestFile = join(dir, "manifest.json");
      const emblemsDir = join(dir, "emblems");
      const universitiesFile = join(dir, "china-universities.ts");
      const target = join(dir, "university-emblems.ts");
      await mkdir(emblemsDir, { recursive: true });
      await writeFile(manifestFile, JSON.stringify(MANIFEST), "utf8");
      await writeFile(universitiesFile, UNIVERSITIES_SRC, "utf8");
      await writeFile(join(emblemsDir, "北京大学.webp"), "x");
      await writeFile(join(emblemsDir, "浙江大学.webp"), "x");
      await writeFile(join(emblemsDir, "安徽科技学院.webp"), "x");

      const result = await syncChinaUniversityEmblems({ manifestFile, emblemsDir, universitiesFile, target, minRows: 1 });
      expect(result.withEmblem).toBe(3);
      expect(result.missing).toBe(1);
      const content = await readFile(target, "utf8");
      expect(content).toContain('"停办学院"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to write when an emblem asset is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cengfan-embl-"));
    try {
      const manifestFile = join(dir, "manifest.json");
      const emblemsDir = join(dir, "emblems");
      const universitiesFile = join(dir, "china-universities.ts");
      const target = join(dir, "university-emblems.ts");
      await mkdir(emblemsDir, { recursive: true });
      await writeFile(manifestFile, JSON.stringify(MANIFEST), "utf8");
      await writeFile(universitiesFile, UNIVERSITIES_SRC, "utf8");
      await writeFile(join(emblemsDir, "北京大学.webp"), "x");
      await writeFile(join(emblemsDir, "浙江大学.webp"), "x");
      // 缺 安徽科技学院.webp

      await expect(
        syncChinaUniversityEmblems({ manifestFile, emblemsDir, universitiesFile, target, minRows: 1 }),
      ).rejects.toThrow(/缺少产物文件/);
      await expect(readFile(target, "utf8")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
